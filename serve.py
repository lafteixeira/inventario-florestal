import http.server
import os

PORT = int(os.environ.get("PORT", 8420))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Sem cache: evita servir JS desatualizado durante o desenvolvimento local
    # (o Service Worker cacheia por cima, e cache duplo confunde os testes).
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("", PORT), Handler) as httpd:
    httpd.serve_forever()
