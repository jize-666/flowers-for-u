"""Build three editable .blend files from the supplied original GLBs.

Run with Blender 4.5 or newer:
    blender --background --python blender/create_scene.py

The native Blender files are created in blender/generated/. They are not
prerequisites for running the website. Main growth and wind stay in JavaScript.
"""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "blender" / "generated"
OUTPUT.mkdir(parents=True, exist_ok=True)


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, location, energy, color, size):
    light = bpy.data.lights.new(name=name, type="AREA")
    light.energy = energy
    light.color = color
    light.shape = "DISK"
    light.size = size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 1.7))
    return obj


for name in ["hero-flower", "flower", "tulip"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    model = ROOT / "static" / "models" / f"{name}.glb"
    if not model.exists():
        raise FileNotFoundError(f"Missing model: {model}. Run python tools/build_assets.py first.")
    bpy.ops.import_scene.gltf(filepath=str(model))
    asset_root = bpy.data.objects.get("Flower")
    if asset_root is None:
        raise RuntimeError("The GLB is missing its Flower root node.")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for face in obj.data.polygons:
                face.use_smooth = True
    camera_data = bpy.data.cameras.new("Preview_Camera")
    camera = bpy.data.objects.new("Preview_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (4.2, -8.0, 4.1)
    camera.data.type = "PERSP"
    camera.data.lens = 58
    aim(camera, (0, 0, 1.8))
    bpy.context.scene.camera = camera
    area("Preview_Key", (-3.0, -4.0, 6.0), 750, (1.0, 0.85, 0.76), 5)
    area("Preview_Rim", (3.0, 3.0, 5.0), 900, (0.60, 0.79, 1.0), 4)
    area("Preview_Fill", (4.0, -3.0, 3.0), 280, (1.0, 0.70, 0.83), 4)
    world = bpy.data.worlds.new("Night Garden")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.025, 0.040, 0.047, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.25
    bpy.context.scene.world = world
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    bpy.context.scene.render.resolution_x = 1000
    bpy.context.scene.render.resolution_y = 1000
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.filepath = str(OUTPUT / f"{name}-preview.png")
    bpy.context.scene["Project"] = "Flowers For You"
    bpy.context.scene["Workflow"] = "Edit mesh / Closed shape keys; export GLB with custom properties. Animate in Three.js / GSAP."
    bpy.ops.object.select_all(action="DESELECT")
    asset_root.select_set(True)
    bpy.context.view_layer.objects.active = asset_root
    notes = bpy.data.texts.new("READ_ME")
    notes.write("Flowers For You\n\nThis scene contains editable meshes, vertex colors, and Closed petal shape keys.\nKeep the Flower root and custom properties.\nDo not export Preview_* cameras/lights.\nUse blender/export_flower.py or export selected objects to GLB with Custom Properties enabled.\nGrowth, wind and letter interactions are implemented in JavaScript, not baked here.\n")
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / f"{name}.blend"))
    print(f"Created {OUTPUT / f'{name}.blend'}")

print("All native Blender sources generated.")
