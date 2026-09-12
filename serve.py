import http.server
import os

PORT = int(os.environ.get("PORT", 8420))


class Handler(http.server.SimpleHTTPRequestHandler):
    pass


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("", PORT), Handler) as httpd:
    httpd.serve_forever()
