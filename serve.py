#!/usr/bin/env python3
"""
Server locale per testare "Presidente di Provincia" su desktop e smartphone
collegati alla stessa rete Wi-Fi (binding su 0.0.0.0).

Uso:
    python serve.py          # porta 8000
    python serve.py 8080     # porta personalizzata
"""

import http.server
import os
import socket
import sys


class PWARequestHandler(http.server.SimpleHTTPRequestHandler):
    # Forza MIME types corretti anche su Windows (evita text/plain per .js ES Modules)
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)

    lan_ip = get_lan_ip()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), PWARequestHandler)

    print("=" * 56)
    print("  Presidente di Provincia — Server Locale PWA")
    print("=" * 56)
    print(f"  Desktop:    http://localhost:{port}")
    print(f"  Smartphone: http://{lan_ip}:{port}  (stessa Wi-Fi)")
    print("  Premi Ctrl+C per fermare il server.")
    print("=" * 56)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer fermato.")
        server.server_close()


if __name__ == "__main__":
    main()
