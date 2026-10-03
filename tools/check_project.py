"""Check local assets and installed vendor files; no network access required."""
from pathlib import Path
import argparse
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_VENDOR = [
    "three/build/three.module.js", "three/build/three.core.js",
    "three/examples/jsm/loaders/GLTFLoader.js",
    "three/examples/jsm/controls/OrbitControls.js",
    "three/examples/jsm/postprocessing/EffectComposer.js",
    "three/examples/jsm/postprocessing/RenderPass.js",
    "three/examples/jsm/postprocessing/UnrealBloomPass.js",
    "three/examples/jsm/postprocessing/OutputPass.js", "gsap/gsap.min.js",
]


def vendor_ready():
    try:
        manifest = json.loads((ROOT / "static/vendor/manifest.json").read_text())
        return (manifest.get("installed") is True and manifest.get("three") == "0.180.0"
                and manifest.get("gsap") == "3.13.0"
                and all((ROOT / "static/vendor" / path).is_file() for path in REQUIRED_VENDOR))
    except (OSError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor-only", action="store_true")
    args = parser.parse_args()
    if args.vendor_only:
        return 0 if vendor_ready() else 1
    failures = []
    for name in ["hero-flower", "flower", "tulip"]:
        path = ROOT / "static/models" / (name + ".glb")
        try:
            content = path.read_bytes()
            magic, version, length = struct.unpack_from("<4sII", content)
            if magic != b"glTF" or version != 2 or length != len(content):
                raise ValueError("invalid GLB header")
            print(f"OK model: {path.name} ({len(content):,} bytes)")
        except (OSError, ValueError, struct.error) as error:
            failures.append(f"{path.name}: {error}")
    for relative in ["templates/index.html", "static/css/style.css", "static/js/bootstrap.js",
                     "static/js/config.js", "static/js/main.js", "static/js/content.js",
                     "static/js/loaders.js", "static/textures/paper.webp", "static/textures/garden-desktop.webp",
                     "static/textures/garden-mobile.webp", "static/audio/night-garden.mp3"]:
        if not (ROOT / relative).is_file():
            failures.append(f"Missing {relative}")
    print("Local Three.js / GSAP:", "READY" if vendor_ready() else "NOT INSTALLED (CDN required for 3D)")
    print("Native Blender sources:", "GENERATED" if (ROOT / "blender/generated/hero-flower.blend").is_file() else "run blender/create_scene.py in Blender")
    for error in failures:
        print("ERROR:", error, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
