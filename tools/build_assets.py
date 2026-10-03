"""Create original, editable flower assets. Uses only the Python standard library.

The GLBs use glTF 2.0, separate named parts, vertex colors, and a Closed
morph target on each petal. The browser combines parts into one draw call
per flower, while preserving the information needed to animate growth.
"""
from __future__ import annotations

import array
import json
import math
from pathlib import Path
import random
import struct

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau


def normalize(v):
    length = math.sqrt(sum(x * x for x in v)) or 1.0
    return tuple(x / length for x in v)


def normal_vectors(vertices, faces):
    result = [[0.0, 0.0, 0.0] for _ in vertices]
    for a, b, c in faces:
        p, q, r = vertices[a], vertices[b], vertices[c]
        u = [q[i] - p[i] for i in range(3)]
        v = [r[i] - p[i] for i in range(3)]
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        for index in (a, b, c):
            for axis in range(3):
                result[index][axis] += n[axis]
    return [normalize(v) for v in result]


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(len(a)))


class GLB:
    def __init__(self, name, height):
        self.binary = bytearray()
        self.height = height
        self.tilt = 0.85
        self.doc = {
            "asset": {"version": "2.0", "generator": "Flowers For You / original procedural assets"},
            "scene": 0, "scenes": [{"nodes": [0]}],
            "nodes": [{"name": name, "children": [], "extras": {"height": height, "assetVersion": 1}}],
            "meshes": [], "buffers": [], "bufferViews": [], "accessors": [],
            "materials": [{"name": "Botanical satin", "doubleSided": True,
                           "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.05, "roughnessFactor": 0.43}}],
        }

    def accessor(self, data, kind, component=5126, target=34962, bounds=False):
        flat = [x for row in data for x in row] if kind != "SCALAR" else data
        raw = array.array("f" if component == 5126 else "I", flat)
        import sys
        if sys.byteorder != "little":
            raw.byteswap()
        while len(self.binary) % 4:
            self.binary.append(0)
        view = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append({"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(raw) * raw.itemsize, "target": target})
        self.binary.extend(raw.tobytes())
        acc = {"bufferView": view, "componentType": component, "count": len(data), "type": kind}
        if bounds:
            acc["min"] = [min(row[i] for row in data) for i in range(3)]
            acc["max"] = [max(row[i] for row in data) for i in range(3)]
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def mesh(self, name, vertices, faces, colors, part, pivot=(0, 0, 0), closed=None, emission=0.0):
        normals = normal_vectors(vertices, faces)
        primitive = {
            "attributes": {"POSITION": self.accessor(vertices, "VEC3", bounds=True),
                           "NORMAL": self.accessor(normals, "VEC3"),
                           "COLOR_0": self.accessor(colors, "VEC3")},
            "indices": self.accessor([i for f in faces for i in f], "SCALAR", 5125, 34963),
            "material": 0,
        }
        mesh = {"name": name, "primitives": [primitive]}
        if closed:
            closed_normals = normal_vectors(closed, faces)
            primitive["targets"] = [{
                "POSITION": self.accessor([tuple(b[i] - a[i] for i in range(3)) for a, b in zip(vertices, closed)], "VEC3", bounds=True),
                "NORMAL": self.accessor([tuple(b[i] - a[i] for i in range(3)) for a, b in zip(normals, closed_normals)], "VEC3"),
            }]
            mesh["weights"] = [0.0]
            mesh["extras"] = {"targetNames": ["Closed"]}
        self.doc["meshes"].append(mesh)
        self.doc["nodes"][0]["children"].append(len(self.doc["nodes"]))
        self.doc["nodes"].append({"name": name, "mesh": len(self.doc["meshes"]) - 1,
                                  "extras": {"part": part, "pivot": list(pivot), "emission": emission}})

        if part >= 2:
            c, s = math.cos(self.tilt), math.sin(self.tilt)
            h = self.height
            self.doc["nodes"][-1]["matrix"] = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, h - h * c, -h * s, 1]

    def save(self, path):
        self.doc["buffers"] = [{"byteLength": len(self.binary)}]
        encoded = json.dumps(self.doc, separators=(",", ":")).encode()
        encoded += b" " * ((-len(encoded)) % 4)
        self.binary.extend(b"\0" * ((-len(self.binary)) % 4))
        header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(self.binary))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(header + struct.pack("<I4s", len(encoded), b"JSON") + encoded + struct.pack("<I4s", len(self.binary), b"BIN\0") + self.binary)
        print(f"{path.name}: {path.stat().st_size / 1024:.0f} KiB")


def grid_faces(rows, cols):
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j
            faces.extend([(a, a + cols, a + 1), (a + 1, a + cols, a + cols + 1)])
    return faces


def stem(asset, height):
    vertices, colors = [], []
    rows, sides = 35, 10
    for i in range(rows):
        t = i / (rows - 1)
        radius = (0.031 * (1 - t) + 0.019 * t)
        for j in range(sides + 1):
            a = j / sides * TAU
            vertices.append((math.cos(a) * radius, height * t, math.sin(a) * radius))
            colors.append(mix(linear("274e40"), linear("719171"), 0.3 + 0.45 * t + 0.2 * math.cos(a)))
    asset.mesh("Stem", vertices, grid_faces(rows, sides + 1), colors, 0)


def leaf(asset, name, y, angle, length, width):
    vertices, colors = [], []
    rows, cols = 18, 11
    direction = (math.cos(angle), math.sin(angle))
    for i in range(rows):
        t = i / (rows - 1)
        w = width * max(0.002, math.sin(math.pi * t)) ** 0.8
        for j in range(cols):
            s = j / (cols - 1) * 2 - 1
            x = length * t
            z = w * s
            rise = 0.65 * length * t + 0.13 * math.sin(t * math.pi) - abs(s) ** 1.5 * w * 0.33
            vertices.append((x * direction[0] - z * direction[1], y + rise, x * direction[1] + z * direction[0]))
            rib = math.exp(-abs(s) * 22) * 0.26
            colors.append(mix(linear("183d34"), linear("749568"), min(0.88, 0.26 + rib + 0.2 * t)))
    asset.mesh(name, vertices, grid_faces(rows, cols), colors, 1, (0, y, 0))


def petal(asset, name, height, angle, length, width, layer, base, tip, kind="cosmos"):
    vertices, closed, colors = [], [], []
    rows, cols = 25, 15
    for i in range(rows):
        t = i / (rows - 1)
        for j in range(cols):
            s = j / (cols - 1) * 2 - 1
            if kind == "tulip":
                w = width * max(0.001, math.sin(math.pi * t * 0.92)) ** 0.62
                radius = 0.09 + length * 0.52 * math.sin(t * math.pi * 0.63)
                y = height + length * t * 0.95
            else:
                w = width * max(0.001, math.sin(math.pi * t)) ** (0.58 if kind == "cosmos" else 0.46)
                radius = 0.07 + length * t - 0.02 * math.cos(s * 7 * math.pi) * t ** 10
                y = height + layer * 0.045 + 0.23 * t * t - 0.08 * math.sin(math.pi * t) + 0.09 * s * s * math.sin(math.pi * t)
            tangential = w * s
            y += 0.009 * math.cos(s * 8 * math.pi) * math.sin(math.pi * t)
            x = radius * math.cos(angle) - tangential * math.sin(angle)
            z = radius * math.sin(angle) + tangential * math.cos(angle)
            vertices.append((x, y, z))
            bud_r = 0.08 + math.sin(t * math.pi) * 0.11 + layer * 0.008
            bud_t = w * s * 0.20
            closed.append((bud_r * math.cos(angle) - bud_t * math.sin(angle),
                           height + layer * 0.025 + t * length * 0.95,
                           bud_r * math.sin(angle) + bud_t * math.cos(angle)))
            vein = 0.055 * math.cos(s * 7 * math.pi) * math.sin(t * math.pi)
            fade = max(0, min(1, 0.20 + 0.80 * t + vein))
            colors.append(mix(linear(base), linear(tip), fade))
    asset.mesh(name, vertices, grid_faces(rows, cols), colors, 2, (0, height, 0), closed, 0.08)


def sphere(asset, name, center, radius, color, part=3, emission=0.65, squash=1):
    vertices, colors = [], []
    rows, cols = 10, 17
    for i in range(rows):
        phi = math.pi * (i + 0.001) / (rows - 1 + 0.002)
        for j in range(cols):
            theta = TAU * j / (cols - 1)
            vertices.append((center[0] + radius * math.sin(phi) * math.cos(theta),
                             center[1] + radius * math.cos(phi) * squash,
                             center[2] + radius * math.sin(phi) * math.sin(theta)))
            colors.append(linear(color))
    asset.mesh(name, vertices, grid_faces(rows, cols), colors, part, center, emission=emission)


def pollen(asset, height, count=34):
    # A joined mesh avoids a separate draw call for every pollen grain in Blender.
    vertices, faces, colors = [], [], []
    golden = math.pi * (3 - math.sqrt(5))
    for k in range(count):
        r = 0.13 * math.sqrt((k + 0.5) / count)
        theta = golden * k
        center = (r * math.cos(theta), height + 0.08 + 0.07 * (1 - r / 0.16), r * math.sin(theta))
        offset = len(vertices)
        for i in range(5):
            p = math.pi * (i + 0.01) / 4.02
            for j in range(7):
                a = j / 6 * TAU
                vertices.append((center[0] + 0.018 * math.sin(p) * math.cos(a), center[1] + 0.022 * math.cos(p), center[2] + 0.018 * math.sin(p) * math.sin(a)))
                colors.append(linear("e8c47d" if k % 3 else "f6dfac"))
        faces += [tuple(i + offset for i in f) for f in grid_faces(5, 7)]
    asset.mesh("Pollen", vertices, faces, colors, 3, (0, height, 0), emission=0.75)


def flower(path, kind, height=3.15):
    asset = GLB("Flower", height)
    asset.tilt = 0.24 if kind == "tulip" else 0.85
    stem(asset, height)
    leaf(asset, "Leaf_Lower_Left", height * 0.24, math.pi * 0.91, 0.94, 0.18)
    leaf(asset, "Leaf_Lower_Right", height * 0.37, 0.15, 0.91, 0.19)
    leaf(asset, "Leaf_Upper_Left", height * 0.57, math.pi * 1.1, 0.75, 0.135)
    leaf(asset, "Leaf_Upper_Right", height * 0.72, -0.25, 0.57, 0.11)
    if kind == "cosmos":
        for layer, count, length, width in [(0, 9, 0.77, 0.28), (1, 7, 0.56, 0.23)]:
            for k in range(count):
                petal(asset, f"Petal_{layer}_{k:02}", height, k / count * TAU + layer * 0.30, length, width, layer, "c486a1", "fff2ea")
    elif kind == "daisy":
        for k in range(11):
            petal(asset, f"Petal_0_{k:02}", height, k / 11 * TAU, 0.72, 0.17, 0, "d6c3bf", "fff8e7", "daisy")
    else:
        for k in range(6):
            petal(asset, f"Petal_0_{k:02}", height, k / 6 * TAU, 0.59, 0.27, 0, "a65375", "f3bdd0", "tulip")
    sphere(asset, "Receptacle", (0, height + 0.035, 0), 0.165, "8e7651", squash=0.36, emission=0.12)
    pollen(asset, height, 31 if kind != "tulip" else 14)
    asset.save(path)


def main():
    folder = ROOT / "static" / "models"
    flower(folder / "hero-flower.glb", "cosmos")
    flower(folder / "flower.glb", "daisy", 2.95)
    flower(folder / "tulip.glb", "tulip", 2.75)


if __name__ == "__main__":
    main()
