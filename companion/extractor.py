"""Loopback-only media extractor. No browser cookies, shell commands or public API."""
import concurrent.futures
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.local'
PORT = 47831
MAX_BYTES = 20 * 1024 * 1024
TEMP_BUDGET = 64 * 1024 * 1024
PROTOCOL = 2


def canonical_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Cole um link de vídeo válido.')
    u = urlparse(value.strip())
    if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443):
        raise ValueError('Use um link HTTPS de YouTube, Instagram ou X.')
    host = (u.hostname or '').lower().removeprefix('www.').removeprefix('m.')
    if host in ('youtube.com', 'youtu.be'):
        from urllib.parse import parse_qs
        ident = u.path.strip('/') if host == 'youtu.be' else (parse_qs(u.query).get('v', [''])[0] if u.path == '/watch' else u.path.strip('/').split('/')[-1] if u.path.startswith(('/shorts/', '/live/', '/embed/')) else '')
        if re.fullmatch(r'[\w-]{11}', ident):
            return 'https://www.youtube.com/watch?v=' + ident
    if host == 'instagram.com':
        match = re.fullmatch(r'/(?:[\w.]+/)?(?:p|reel|reels|tv)/([\w-]{3,80})/?', u.path)
        if match:
            return 'https://www.instagram.com/p/' + match[1] + '/'
    if host in ('x.com', 'twitter.com'):
        match = re.fullmatch(r'/(?:[\w]{1,30}|i/web)/status/(\d{5,30})/?(?:video/\d+)?', u.path)
        if match:
            return 'https://x.com/i/status/' + match[1]
    raise ValueError('Este link não é um vídeo/post compatível. Use YouTube, Reels/posts do Instagram ou um post do X.')



class Extractor:
    def __init__(self, state=STATE):
        self.state = Path(state)
        self.state.mkdir(parents=True, exist_ok=True)
        self.temp = self.state / 'temporarios'
        self.temp.mkdir(exist_ok=True)
        self.config_path = self.state / 'connection.json'
        self.config = json.loads(self.config_path.read_text('utf-8')) if self.config_path.exists() else {'token': secrets.token_urlsafe(32)}
        self.config.pop('driveFolder', None)
        self.save_config()
        self.jobs = {}
        self.lock = threading.RLock()
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        self.javascript = False
        for runtime, minimum in [('node', (22, 0)), ('deno', (2, 3))]:
            try:
                result = subprocess.run([runtime, '--version'], capture_output=True, text=True, timeout=3, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                match = re.search(r'(\d+)\.(\d+)', result.stdout)
                self.javascript |= bool(match and (int(match[1]), int(match[2])) >= minimum)
            except (OSError, subprocess.TimeoutExpired):
                pass
        # Only our own disposable job directories, never the configured Drive folder.
        for folder in self.temp.iterdir():
            if folder.is_dir() and re.fullmatch(r'[a-f0-9]{32}', folder.name):
                shutil.rmtree(folder)

    def save_config(self):
        self.config_path.write_text(json.dumps(self.config), 'utf-8')

    def health(self):
        import importlib.util
        return {'protocol': PROTOCOL, 'extractor': importlib.util.find_spec('yt_dlp') is not None,
                'ffmpeg': bool(shutil.which('ffmpeg')), 'javascript': self.javascript,
                'maxBytes': MAX_BYTES}

    def cleanup(self):
        for ident, job in list(self.jobs.items()):
            if job['status'] not in ('running', 'queued') and time.time() - job['updated'] > 300:
                self.remove(ident)

    def remove(self, ident):
        with self.lock:
            self._remove(ident)

    def _remove(self, ident):
        job = self.jobs.get(ident)
        if not job:
            return
        job['cancel'].set()
        if job['status'] in ('running', 'queued'):
            return
        folder = self.temp / ident
        if folder.is_dir():
            shutil.rmtree(folder, ignore_errors=True)
        self.jobs.pop(ident, None)

    def create(self, data):
        with self.lock:
            return self._create(data)

    def _create(self, data):
        self.cleanup()
        if any(j['status'] in ('queued', 'running') for j in self.jobs.values()):
            raise ValueError('Aguarde a extração atual ou cancele-a.')
        kind = data.get('kind')
        if kind not in ('inspect', 'extract'):
            raise ValueError('Operação inválida.')
        url = canonical_url(data.get('url'))
        if kind == 'extract':
            if not self.health()['ffmpeg']:
                raise ValueError('FFmpeg não encontrado. Execute CONFIGURAR.ps1 e confira as dependências.')
        ident = secrets.token_hex(16)
        job = {'id': ident, 'status': 'queued', 'stage': 'Na fila…', 'kind': kind, 'updated': time.time(), 'cancel': threading.Event()}
        self.jobs[ident] = job
        self.pool.submit(self.run, job, {**data, 'url': url})
        return {'id': ident}

    def execute(self, args, job, folder, timeout):
        # Argument array + -- before URL: no shell interpolation, no user options.
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        out, err = folder / 'stdout.txt', folder / 'stderr.txt'
        with out.open('wb') as stdout, err.open('wb') as stderr:
            process = subprocess.Popen(args, cwd=folder, stdout=stdout, stderr=stderr, creationflags=creationflags)
            started = time.monotonic()
            try:
                while process.poll() is None:
                    if job['cancel'].is_set():
                        raise ValueError('Extração cancelada.')
                    if time.monotonic() - started > timeout:
                        raise ValueError('O site demorou demais. Tente outro vídeo.')
                    if sum(p.stat().st_size for p in folder.rglob('*') if p.is_file()) > TEMP_BUDGET:
                        raise ValueError('O download excedeu o limite temporário de 64 MB. Tente um vídeo menor.')
                    time.sleep(.15)
            except Exception:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=creationflags)
                else:
                    process.kill()
                process.wait(timeout=10)
                raise
        if process.returncode:
            diagnostic = err.read_text('utf-8', errors='replace')[-4000:]
            if re.search(r'private|login|sign in|cookies|age.restrict|not available|unavailable|403|429|confirm.*bot', diagnostic, re.I):
                raise ValueError('O site bloqueou este vídeo ou exige login. Tente um vídeo público; contas privadas e restrições não são contornadas.')
            raise ValueError('Não foi possível extrair este link. Atualize o auxiliar em CONFIGURAR.ps1 ou tente outro vídeo. ' + re.sub(r'https?://\S+', '[URL]', diagnostic.strip().split('\n')[-1])[:280])
        return out.read_text('utf-8', errors='replace')

    def run(self, job, data):
        folder = self.temp / job['id']
        folder.mkdir(exist_ok=True)
        job.update(status='running', stage='Consultando o vídeo…')
        try:
            base = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-cache-dir', '--no-playlist', '--socket-timeout', '15', '--retries', '1', '--no-warnings', '--js-runtimes', 'node']
            info = json.loads(self.execute(base + ['--skip-download', '--dump-single-json', '--', data['url']], job, folder, 55))
            if info.get('is_live') or info.get('_type') in ('playlist', 'multi_video'):
                raise ValueError('Escolha um vídeo individual gravado. Lives e posts com vários vídeos não são suportados nesta versão.')
            duration = info.get('duration')
            metadata = {'title': str(info.get('title') or 'Vídeo')[:180], 'duration': duration, 'url': data['url'], 'platform': info.get('extractor_key', ''), 'thumbnail': info.get('thumbnail')}
            if job['kind'] == 'inspect':
                job.update(status='ready', stage='Vídeo encontrado.', result=metadata)
                return
            if duration and duration > 600:
                raise ValueError('Este vídeo tem mais de 10 minutos. A importação direta aceita vídeos de até 10 minutos e 20 MB.')
            quality = 480
            job['stage'] = 'Baixando o vídeo…'
            social = urlparse(data['url']).hostname == 'x.com'
            selection = f'b[height<={quality}][protocol=https]/b[protocol=https]/b' if social else f'bv*[height<={quality}][ext=mp4]+ba[ext=m4a]/b[height<={quality}][ext=mp4]/b[height<={quality}]/b'
            args = base + ['--no-progress', '--max-filesize', str(TEMP_BUDGET // 2), '--format', selection, '--merge-output-format', 'mp4', '--recode-video', 'mp4', '--output', str(folder / 'source.%(ext)s'), '--', data['url']]
            self.execute(args, job, folder, 180)
            source = folder / 'source.mp4'
            if not source.is_file():
                raise ValueError('O site não entregou um vídeo utilizável. Tente outro link.')
            job['stage'] = 'Otimizando vídeo para o editor…'
            self.execute(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-vf', f"scale=w=-2:h='trunc(min({quality},ih)/2)*2'", '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(folder / 'clip.mp4')], job, folder, 90)
            source.unlink()
            media = folder / 'clip.mp4'
            if not media.is_file() or media.stat().st_size < 100:
                raise ValueError('O site não entregou um MP4 utilizável dentro do limite. Tente outro vídeo mais curto.')
            if media.stat().st_size > MAX_BYTES:
                raise ValueError('O vídeo inteiro ultrapassou 20 MB. Tente um vídeo menor.')
            if job['cancel'].is_set():
                raise ValueError('Extração cancelada.')
            name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', metadata['title']).strip(' .')[:110] or 'Video'
            name += '.mp4'
            job.update(status='ready', stage='Vídeo pronto. Adicionando à Biblioteca…', media=media, result={**metadata, 'name': name, 'bytes': media.stat().st_size, 'mime': 'video/mp4'})
        except Exception as e:
            job.update(status='error', stage='Não concluído.', error=str(e))
        finally:
            job['updated'] = time.time()
            if job['kind'] == 'inspect' or job['status'] == 'error':
                shutil.rmtree(folder, ignore_errors=True)

    def public_job(self, ident):
        job = self.jobs.get(ident)
        if not job:
            raise ValueError('Esta extração expirou. Analise o link novamente.')
        return {k: v for k, v in job.items() if k not in ('cancel', 'media', 'updated')}


def handler_for(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log bearer tokens or signed platform URLs.

        def cors(self):
            origin = self.headers.get('Origin', '')
            if origin and not re.fullmatch(r'chrome-extension://[a-p]{32}', origin):
                raise ValueError('Origem não permitida.')
            if self.headers.get('Host') != f'127.0.0.1:{PORT}':
                raise ValueError('Host não permitido.')
            return origin

        def respond(self, status, data, binary=False):
            self.send_response(status)
            origin = self.headers.get('Origin', '')
            if re.fullmatch(r'chrome-extension://[a-p]{32}', origin):
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Type', 'video/mp4' if binary else 'application/json; charset=utf-8')
            payload = data if binary else json.dumps(data).encode()
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_OPTIONS(self):
            try:
                self.cors()
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', ''))
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.end_headers()
            except ValueError:
                self.respond(403, {'error': 'Origem não permitida.'})

        def dispatch(self):
            try:
                self.cors()
                auth = self.headers.get('Authorization', '')
                if not hmac.compare_digest(auth, 'Bearer ' + app.config['token']):
                    self.respond(401, {'error': 'A conexão local precisa ser atualizada. Execute INICIAR.cmd novamente.'})
                    return
                path = self.path.split('?')[0]
                data = {}
                if self.command == 'POST':
                    length = int(self.headers.get('Content-Length', '0'))
                    if length < 0 or length > 16384:
                        raise ValueError('Requisição grande demais.')
                    data = json.loads(self.rfile.read(length))
                    if not isinstance(data, dict):
                        raise ValueError('Requisição inválida.')
                if self.command == 'GET' and path == '/health':
                    self.respond(200, app.health())
                elif self.command == 'POST' and path == '/jobs':
                    self.respond(200, app.create(data))
                elif self.command == 'POST' and path == '/shutdown':
                    for job in list(app.jobs.values()):
                        job['cancel'].set()
                    self.respond(200, {'stopping': True})
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                elif re.fullmatch(r'/jobs/[a-f0-9]{32}(?:/media)?', path):
                    ident = path.split('/')[2]
                    job = app.jobs.get(ident)
                    if self.command == 'DELETE':
                        app.remove(ident)
                        self.respond(200, {'removed': True})
                    elif self.command == 'GET' and path.endswith('/media'):
                        if not job or job['status'] != 'ready' or not job.get('media'):
                            raise ValueError('Arquivo ainda indisponível.')
                        self.respond(200, job['media'].read_bytes(), binary=True)
                    elif self.command == 'GET':
                        self.respond(200, app.public_job(ident))
                    else:
                        self.respond(404, {'error': 'Rota inexistente.'})
                else:
                    self.respond(404, {'error': 'Rota inexistente.'})
            except Exception as e:
                self.respond(400, {'error': str(e)[:500]})

        do_GET = dispatch
        do_POST = dispatch
        do_DELETE = dispatch
    return Handler


if __name__ == '__main__':
    app = Extractor()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), handler_for(app))
    (STATE / 'CONEXAO.html').unlink(missing_ok=True)
    print(f'Wide Studio Extrair pronto em 127.0.0.1:{PORT}', flush=True)
    def janitor():
        while True:
            time.sleep(30)
            app.cleanup()
    threading.Thread(target=janitor, daemon=True).start()
    try:
        server.serve_forever()
    finally:
        app.pool.shutdown(wait=True)
        for ident in list(app.jobs):
            app.remove(ident)
        server.server_close()
