"""Zero-install local preview. Flask remains the main app.

Usage: python tools/preview_server.py --port 8000
No external Python packages required; not a production server.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import functools
import mimetypes

ROOT = Path(__file__).resolve().parents[1]
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("model/gltf-binary", ".glb")


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            self.path = "/templates/index.html"
        return super().do_GET()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=str(ROOT))
    print(f"Flowers For You preview: http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), handler).serve_forever()
