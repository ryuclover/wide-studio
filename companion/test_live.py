"""Public upstream test URLs. No cookies and no downloads during this probe."""
import json
from pathlib import Path
import time
import urllib.request

root=Path(__file__).resolve().parent
token=json.loads((root/'.local/connection.json').read_text('utf-8'))['token']
def request(path, data=None, method=None):
    body=json.dumps(data).encode() if data is not None else None
    r=urllib.request.Request('http://127.0.0.1:47831'+path, data=body, method=method, headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(r,timeout=20) as response:
        return json.load(response)
results=[]
for platform,url in [('YouTube','https://www.youtube.com/watch?v=jNQXAC9IVRw'),('Instagram','https://www.instagram.com/p/aye83DjauH/'),('X','https://x.com/i/status/1790637656616943991')]:
    ident=request('/jobs',{'kind':'inspect','url':url})['id']
    for _ in range(100):
        job=request('/jobs/'+ident)
        if job['status'] not in ('queued','running'):
            break
        time.sleep(.7)
    summary={'platform':platform,'url':url,'status':job['status'],'error':job.get('error'),'metadata':job.get('result')}
    if summary['metadata']:
        summary['metadata'].pop('thumbnail',None)
    results.append(summary)
    print(json.dumps(summary,ensure_ascii=True),flush=True)
    request('/jobs/'+ident,method='DELETE')
(root.parent/'docs/evidence/extract-platform-real.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),'utf-8')
