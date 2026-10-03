"""Install pinned Three.js and GSAP files locally, without requiring Node.js.

Usage:
    python tools/vendor_dependencies.py
    python tools/vendor_dependencies.py --from-node-modules

Downloads only from the npm registry and verifies the registry's integrity
hash. No package lifecycle scripts are executed. The current installation
is replaced only after both libraries have been prepared successfully.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import shutil
import sys
import tarfile
import tempfile
import urllib.request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = {"three": "0.180.0", "gsap": "3.13.0"}
ENTRY_POINTS = [
    "build/three.module.js", "build/three.core.js",
    "examples/jsm/loaders/GLTFLoader.js",
    "examples/jsm/controls/OrbitControls.js",
    "examples/jsm/postprocessing/EffectComposer.js",
    "examples/jsm/postprocessing/RenderPass.js",
    "examples/jsm/postprocessing/UnrealBloomPass.js",
    "examples/jsm/postprocessing/OutputPass.js",
]
IMPORT = re.compile(r'''(?:from\s*|import\s*)["'](\.[^"']+)["']''')


def get(url, max_bytes=40_000_000):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "registry.npmjs.org":
        raise ValueError("Only HTTPS downloads from registry.npmjs.org are accepted.")
    request = urllib.request.Request(url, headers={"User-Agent": "FlowersForYou-local-vendor/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValueError("Package exceeds the download size limit.")
    return payload


def fetch_package(name, version):
    metadata = json.loads(get(f"https://registry.npmjs.org/{name}/{version}", 2_000_000))
    archive = get(metadata["dist"]["tarball"])
    integrity = metadata["dist"].get("integrity")
    if not integrity:
        raise ValueError(f"Missing integrity data for {name}.")
    algorithm, expected = integrity.split()[0].split("-", 1)
    if algorithm not in {"sha512", "sha256"}:
        raise ValueError("Unsupported package integrity algorithm.")
    actual = base64.b64encode(hashlib.new(algorithm, archive).digest()).decode()
    if actual != expected:
        raise ValueError(f"Integrity check failed for {name}.")
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile() or not member.name.startswith("package/"):
                continue
            path = PurePosixPath(member.name).relative_to("package").as_posix()
            if ".." in PurePosixPath(path).parts or member.size > 10_000_000:
                raise ValueError("Unexpected archive member.")
            extracted = tar.extractfile(member)
            if extracted is not None:
                files[path] = extracted.read()
    return files, {"version": version, "integrity": integrity, "source": metadata["dist"]["tarball"]}


def installed_package(name, version):
    folder = ROOT / "node_modules" / name
    metadata = json.loads((folder / "package.json").read_text())
    if metadata["version"] != version:
        raise ValueError(f"Expected {name} {version}; run npm install in the project folder.")
    files = {}
    for file in folder.rglob("*"):
        if file.is_file() and (file.suffix in {".js", ".json", ".md", ".txt"} or file.name == "LICENSE"):
            files[file.relative_to(folder).as_posix()] = file.read_bytes()
    return files, {"version": version, "source": "local node_modules"}


def module_tree(files, starting):
    required = set()
    pending = list(starting)
    while pending:
        path = pending.pop()
        if path in required:
            continue
        if path.startswith("../") or path.startswith("/") or path not in files:
            raise ValueError(f"Missing or invalid module: {path}")
        required.add(path)
        text = files[path].decode("utf-8")
        for relative in IMPORT.findall(text):
            dependency = posixpath.normpath(posixpath.join(posixpath.dirname(path), relative))
            if dependency.endswith(".js"):
                pending.append(dependency)
    return required


def write_files(destination, package, paths):
    for relative in paths:
        file = destination / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(package[relative])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-node-modules", action="store_true")
    args = parser.parse_args()
    loader = installed_package if args.from_node_modules else fetch_package
    vendor = ROOT / "static" / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)
    metadata = {}
    with tempfile.TemporaryDirectory(prefix="flowers-vendor-") as temp:
        stage = Path(temp)
        for name, version in VERSIONS.items():
            print(f"Preparing {name} {version}...", flush=True)
            files, details = loader(name, version)
            metadata[name] = details
            if name == "three":
                selected = module_tree(files, ENTRY_POINTS)
                selected.update(path for path in files if path in {"LICENSE", "package.json"})
                write_files(stage / name, files, selected)
                print(f"  {len(selected)} files including matching addon dependencies")
            else:
                if "dist/gsap.min.js" not in files:
                    raise ValueError("GSAP distribution file is missing.")
                (stage / "gsap").mkdir()
                (stage / "gsap" / "gsap.min.js").write_bytes(files["dist/gsap.min.js"])
                for path in files:
                    if path.lower() in {"license", "license.md", "license.txt", "package.json"}:
                        (stage / "gsap" / PurePosixPath(path).name).write_bytes(files[path])
        for name in VERSIONS:
            destination = vendor / name
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(stage / name, destination)
        (vendor / "manifest.json").write_text(json.dumps({"installed": True, "three": VERSIONS["three"], "gsap": VERSIONS["gsap"], "packages": metadata}, indent=2))
    print("Done. Reload the website; the browser now uses local libraries, not the CDN.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, tarfile.TarError) as error:
        print(f"Vendor setup failed: {error}\nThe CDN option remains available. Check your connection and try again.", file=sys.stderr)
        raise SystemExit(1)
