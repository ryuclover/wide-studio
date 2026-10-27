import json
from pathlib import Path
import struct
import subprocess
import unittest
root=Path(__file__).resolve().parent
class NativePipe(unittest.TestCase):
    def test_private_stdio_without_registry(self):
        manifest=root/'.local/native-host.json'
        backup=manifest.read_bytes() if manifest.exists() else None
        origin='chrome-extension://hbaclibpnjdaeebnjelihmkcmancpbmm/'
        manifest.write_text(json.dumps({'allowed_origins':[origin]}),'utf-8')
        try:
            def call(caller,kind):
                payload=json.dumps({'type':kind}).encode()
                p=subprocess.run([str(root/'.local/native-bridge.exe'),caller],input=struct.pack('<I',len(payload))+payload,capture_output=True,timeout=20)
                size=struct.unpack('<I',p.stdout[:4])[0]
                self.assertLess(size,4096);self.assertEqual(len(p.stdout),4+size)
                return json.loads(p.stdout[4:])
            wrong=call('chrome-extension://'+'a'*32+'/','connect')
            self.assertFalse(wrong['success']);self.assertNotIn('token',wrong)
            self.assertFalse(call(origin,'write-file')['success'])
            good=call(origin,'connect')
            self.assertTrue(good['success']);self.assertEqual(good['protocol'],2)
            token=json.loads((root/'.local/connection.json').read_text('utf-8'))['token']
            self.assertEqual(good['token'],token)
        finally:
            if backup is None: manifest.unlink(missing_ok=True)
            else: manifest.write_bytes(backup)
if __name__=='__main__':unittest.main()
