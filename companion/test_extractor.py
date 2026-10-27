import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from extractor import Extractor, canonical_url, handler_for

class FakeExtractor(Extractor):
    duration = 135
    def execute(self, args, job, folder, timeout):
        self.calls.append(args)
        if '--dump-single-json' in args:
            return json.dumps({'title': '../Meme: Teste', 'duration': self.duration, 'extractor_key': 'Youtube'})
        (folder / ('clip.mp4' if Path(args[0]).stem == 'ffmpeg' else 'source.mp4')).write_bytes(b'video' * 100)
        return ''

class Tests(unittest.TestCase):
    def setUp(self):
        state = Path(__file__).resolve().parent / '.local'
        state.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=state)
        self.app = FakeExtractor(Path(self.temp.name) / 'state')
        self.app.calls = []

    def tearDown(self):
        self.app.pool.shutdown(wait=True)
        self.temp.cleanup()

    def test_url_allowlist(self):
        self.assertEqual(canonical_url('https://youtu.be/BaW_jenozKc?t=1'), 'https://www.youtube.com/watch?v=BaW_jenozKc')
        self.assertEqual(canonical_url('https://www.instagram.com/reel/ABC_123/?igsh=example'), 'https://www.instagram.com/p/ABC_123/')
        self.assertEqual(canonical_url('https://twitter.com/Test/status/123456789/video/1'), 'https://x.com/i/status/123456789')
        for url in ['http://youtube.com/watch?v=BaW_jenozKc', 'https://127.0.0.1/a.mp4', 'https://youtube.com.evil.test/watch?v=BaW_jenozKc', 'https://evil@youtube.com/watch?v=BaW_jenozKc', 'https://www.youtube.com/playlist?list=abc', 'file:///test', 'https://instagram.com/account']:
            with self.assertRaises(ValueError, msg=url): canonical_url(url)

    def run_job(self):
        job = {'id': 'a' * 32, 'kind': 'extract', 'status': 'queued', 'cancel': threading.Event(), 'updated': time.time()}
        self.app.jobs[job['id']] = job
        self.app.run(job, {'url': 'https://www.youtube.com/watch?v=BaW_jenozKc'})
        return job

    def test_whole_video_without_drive_or_trimming(self):
        job = self.run_job()
        self.assertEqual(job['status'], 'ready')
        self.assertEqual(job['result']['duration'], 135, 'not silently limited to 30/90 seconds')
        self.assertTrue(job['result']['name'].endswith('.mp4'))
        self.assertNotIn('/', job['result']['name'])
        self.assertNotIn('driveSaved', job['result'])
        self.assertFalse(hasattr(self.app, 'configure_drive'))
        for args in self.app.calls:
            self.assertNotIn('--download-sections', args)
            self.assertNotIn('-ss', args)
            self.assertNotIn('-t', args)
        self.app.remove(job['id'])
        self.assertEqual(list(self.app.temp.iterdir()), [])

    def test_long_video_fails_without_silent_cut(self):
        self.app.duration = 601
        job = self.run_job()
        self.assertEqual(job['status'], 'error')
        self.assertIn('10 minutos', job['error'])
        self.assertEqual(len(self.app.calls), 1, 'reject before downloading')
        self.assertEqual(list(self.app.temp.iterdir()), [])

    def test_auth_origin_and_payload(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.app))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        def request(origin=None, token=None, path='/health', data=None):
            headers = {'Host': '127.0.0.1:47831'}
            if origin: headers['Origin'] = origin
            if token: headers['Authorization'] = 'Bearer ' + token
            return urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{server.server_port}{path}',headers=headers,data=json.dumps(data).encode() if data else None))
        try:
            with self.assertRaises(urllib.error.HTTPError) as error: request()
            self.assertEqual(error.exception.code, 401); error.exception.close()
            with self.assertRaises(urllib.error.HTTPError) as error: request('https://wide.video', self.app.config['token'])
            error.exception.close()
            with self.assertRaises(urllib.error.HTTPError) as error: request(token=self.app.config['token'],path='/drive',data={'folder':'test'})
            self.assertEqual(error.exception.code,404); error.exception.close()
            with request('chrome-extension://'+'a'*32,self.app.config['token']) as response:
                body=json.load(response);self.assertEqual(body['protocol'],2);self.assertNotIn('token',body);self.assertNotIn('driveFolder',body)
        finally:
            server.shutdown(); server.server_close()

if __name__ == '__main__': unittest.main()
