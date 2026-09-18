from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os,webbrowser
os.chdir(Path(__file__).resolve().parent)
server=ThreadingHTTPServer(('127.0.0.1',0),SimpleHTTPRequestHandler)
url=f'http://127.0.0.1:{server.server_port}/'
print('Character preview:',url,flush=True)
webbrowser.open(url)
server.serve_forever()
