import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error

INTERNAL_URL = "http://127.0.0.1:50032"
LISTEN_PORT = 50033

class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silent logger to prevent filling container logs
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self._proxy("GET")

    def do_HEAD(self):
        self._proxy("HEAD")

    def do_POST(self):
        self._proxy("POST")

    def do_PUT(self):
        self._proxy("PUT")

    def do_DELETE(self):
        self._proxy("DELETE")

    def _proxy(self, method):
        url = INTERNAL_URL + self.path
        body = None
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length)

        headers = {}
        for k, v in self.headers.items():
            if k.lower() not in ("host", "origin", "content-length"):
                headers[k] = v

        # Rewrite origin and host so COEIROINK's FastAPI CORS middleware allows it
        headers["Origin"] = "http://localhost:50032"
        headers["Host"] = "127.0.0.1:50032"

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in (
                        "access-control-allow-origin",
                        "access-control-allow-credentials",
                        "access-control-allow-methods",
                        "access-control-allow-headers",
                        "transfer-encoding",
                    ):
                        self.send_header(k, v)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "*")
                self.send_header("Access-Control-Allow-Headers", "*")
                self.end_headers()
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in (
                    "access-control-allow-origin",
                    "access-control-allow-credentials",
                    "access-control-allow-methods",
                    "access-control-allow-headers",
                    "transfer-encoding",
                ):
                    self.send_header(k, v)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()
            while True:
                chunk = e.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except Exception as e:
            self.send_response(502)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(str(e).encode())

def run():
    server = HTTPServer(("0.0.0.0", LISTEN_PORT), ProxyHandler)
    print(f"📡 CORS Reverse Proxy listening on 0.0.0.0:{LISTEN_PORT} -> {INTERNAL_URL}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    run()
