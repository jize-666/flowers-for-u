"""Export the active native Blender model back into the website.

Example, from the project folder:
    blender blender/generated/hero-flower.blend --background --python blender/export_flower.py

Only the Flower root and its children are exported, not preview lights/cameras.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
name = Path(bpy.data.filepath).stem
if name not in {"hero-flower", "flower", "tulip"}:
    raise ValueError("Open hero-flower.blend, flower.blend, or tulip.blend first.")
asset = bpy.data.objects.get("Flower")
if asset is None:
    raise RuntimeError("Missing Flower root. Keep the supplied asset hierarchy.")

bpy.ops.object.select_all(action="DESELECT")

def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)

select_tree(asset)
bpy.context.view_layer.objects.active = asset
# The web renderer uses the open base mesh and the Closed morph target.
for obj in [asset, *asset.children_recursive]:
    if obj.type == "MESH" and obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            if key.name != "Basis":
                key.value = 0

output = ROOT / "static" / "models" / f"{name}.glb"
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    use_selection=True,
    export_extras=True,
    export_yup=True,
    export_normals=True,
    export_morph=True,
    export_animations=False,
    export_lights=False,
    export_cameras=False,
)
print(f"Exported {output}. Hard-refresh the browser to see the changes.")
