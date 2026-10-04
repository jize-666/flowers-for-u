"""Flowers For You: a small Flask host for an interactive 3D garden."""
from __future__ import annotations

import mimetypes
import os
from flask import Flask, render_template

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("audio/ogg", ".ogg")
app = Flask(__name__)
from opening_routes import install_opening
install_opening(app)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return {"status": "ok", "project": "Flowers For You"}


@app.after_request
def safe_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


if __name__ == "__main__":
    # Local development only. Never expose Flask's interactive debugger publicly.
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")), debug=False)
