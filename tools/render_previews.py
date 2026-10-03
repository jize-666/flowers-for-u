"""Render the supplied GLBs to local fallback artwork.

Requires numpy, vtk, Pillow, and Node.js. This is an asset authoring tool,
not a website dependency. These previews are not screenshots of Three.js.
"""
from pathlib import Path
import json
import math
import struct
import subprocess
import numpy as np
from PIL import Image, ImageFilter
import vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray

ROOT = Path(__file__).resolve().parents[1]
settings = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', 'import { CONFIG, FLOWERS } from "./static/js/config.js"; console.log(JSON.stringify({CONFIG,FLOWERS}));'], cwd=ROOT))
FLOWERS, CONFIG = settings['FLOWERS'], settings['CONFIG']


def read_glb(path):
    raw = path.read_bytes()
    json_len = struct.unpack_from('<I', raw, 12)[0]
    data = json.loads(raw[20:20 + json_len])
    binary = raw[28 + json_len:]

    def accessor(index):
        item = data['accessors'][index]
        if 'sparse' in item:
            raise ValueError('Export with sparse accessors disabled for preview rendering.')
        view = data['bufferViews'][item['bufferView']]
        width = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'SCALAR': 1}[item['type']]
        dtype = np.dtype({5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[item['componentType']])
        offset = view.get('byteOffset', 0) + item.get('byteOffset', 0)
        stride = view.get('byteStride', width * dtype.itemsize)
        result = np.ndarray((item['count'], width), dtype=dtype, buffer=binary, offset=offset, strides=(stride, dtype.itemsize)).copy()
        if item.get('normalized') and np.issubdtype(dtype, np.integer):
            result = np.maximum(result.astype(float) / np.iinfo(dtype).max, -1)
        return result

    def local_matrix(node):
        if 'matrix' in node:
            return np.asarray(node['matrix'], dtype=float).reshape(4, 4, order='F')
        x, y, z, w = node.get('rotation', [0, 0, 0, 1])
        rotation = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        matrix = np.eye(4)
        matrix[:3, :3] = rotation @ np.diag(node.get('scale', [1, 1, 1]))
        matrix[:3, 3] = node.get('translation', [0, 0, 0])
        return matrix

    parts = []
    def visit(index, parent):
        node = data['nodes'][index]
        transform = parent @ local_matrix(node)
        if 'mesh' in node:
            for primitive in data['meshes'][node['mesh']]['primitives']:
                if primitive.get('mode', 4) != 4:
                    raise ValueError('Preview renderer expects triangle primitives.')
                positions = accessor(primitive['attributes']['POSITION'])
                colors = accessor(primitive['attributes']['COLOR_0'])[:, :3]
                faces = accessor(primitive['indices']).reshape(-1, 3) if 'indices' in primitive else np.arange(len(positions)).reshape(-1, 3)
                positions = (np.column_stack((positions, np.ones(len(positions)))) @ transform.T)[:, :3]
                parts.append((positions, faces, colors, node['extras']['part']))
        for child in node.get('children', []):
            visit(child, transform)
    for root in data['scenes'][data.get('scene', 0)]['nodes']:
        visit(root, np.eye(4))
    flower_root = next(node for node in data['nodes'] if node.get('name') == 'Flower')
    return parts, flower_root['extras']['height']


def linear(hex_color):
    rgb = np.array([int(hex_color[i:i+2], 16) / 255 for i in (1,3,5)])
    return np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)


def make_actor(vertices, faces, colors):
    points = vtk.vtkPoints(); points.SetData(numpy_to_vtk(np.ascontiguousarray(vertices), deep=True))
    cells = np.column_stack((np.full(len(faces), 3), faces)).astype(np.int64).ravel()
    polygons = vtk.vtkCellArray(); polygons.SetCells(len(faces), numpy_to_vtkIdTypeArray(cells, deep=True))
    mesh = vtk.vtkPolyData(); mesh.SetPoints(points); mesh.SetPolys(polygons)
    srgb = np.where(colors <= .0031308, colors * 12.92, 1.055 * np.maximum(colors, 0) ** (1 / 2.4) - .055)
    c = numpy_to_vtk(np.clip(srgb * 255, 0, 255).astype(np.uint8), deep=True, array_type=vtk.VTK_UNSIGNED_CHAR)
    c.SetName('Color'); mesh.GetPointData().SetScalars(c)
    normals = vtk.vtkPolyDataNormals(); normals.SetInputData(mesh); normals.SplittingOff(); normals.ConsistencyOn(); normals.ComputePointNormalsOn()
    mapper = vtk.vtkPolyDataMapper(); mapper.SetInputConnection(normals.GetOutputPort()); mapper.SetColorModeToDirectScalars(); mapper.SetScalarModeToUsePointData()
    actor = vtk.vtkActor(); actor.SetMapper(mapper)
    prop = actor.GetProperty(); prop.SetInterpolationToPhong(); prop.SetAmbient(.31); prop.SetDiffuse(.69); prop.SetSpecular(.20); prop.SetSpecularPower(23)
    return actor


def root_transform(flower):
    y, z = flower['yaw'], flower['lean']
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return ry @ rz * flower['scale'], np.array([flower['x'], CONFIG['groundY'], flower['z']])


def render(width, height, mobile=False):
    renderer = vtk.vtkRenderer()
    renderer.SetBackground(7/255, 14/255, 17/255)
    renderer.SetUseFXAA(False)
    renderer.AutomaticLightCreationOff()
    window = vtk.vtkRenderWindow(); window.SetOffScreenRendering(1); window.SetSize(width, height); window.SetMultiSamples(0); window.AddRenderer(renderer)
    assets = {kind: read_glb(ROOT / path.lstrip('/')) for kind, path in CONFIG['modelPaths'].items()}
    targets = []
    for flower in FLOWERS:
        parts, h = assets[flower['model']]
        matrix, translation = root_transform(flower)
        tint = linear(flower['tint'])
        for positions, faces, colors, part in parts:
            if part >= 2: colors = colors * tint
            positions = positions @ matrix.T + translation
            actor = make_actor(positions, faces, colors)
            if part == 3: actor.GetProperty().SetAmbient(.55)
            renderer.AddActor(actor)
        targets.append((flower, np.array([0, h, 0]) @ matrix.T + translation))
    rng = np.random.default_rng(2050)
    for i in range(90):
        length = rng.uniform(.35, 1.35)
        x, z = rng.uniform(-6, 6), rng.uniform(-2, 2)
        lean = rng.uniform(-.26,.26)
        v, faces = [], []
        for j in range(11):
            t = j / 10
            w = .018 * (1-t) + .0001
            v.extend([[x + lean*t*t-w, CONFIG['groundY']+length*t, z], [x + lean*t*t+w, CONFIG['groundY']+length*t, z]])
            if j<10: faces.extend([[j*2,j*2+2,j*2+1],[j*2+1,j*2+2,j*2+3]])
        c = np.array([.025,.064,.035]) * rng.uniform(.6,1.5)
        renderer.AddActor(make_actor(np.array(v), np.array(faces), np.tile(c,(len(v),1))))
    for position, color, intensity in [((-3,6,6),(1,.90,.82),1.0), ((4,5,-4),(.55,.76,.91),.8), ((1,3,7),(.92,.79,.87),.35)]:
        light = vtk.vtkLight(); light.SetLightTypeToSceneLight(); light.SetPosition(*position); light.SetFocalPoint(0,1,0); light.SetColor(*color); light.SetIntensity(intensity); light.PositionalOff(); renderer.AddLight(light)
    camera = renderer.GetActiveCamera()
    camera.SetPosition(CONFIG['camera']['x'],CONFIG['camera']['y'],CONFIG['camera']['z'])
    camera.SetFocalPoint(0,CONFIG['camera']['targetY'],0)
    camera.SetViewUp(0,1,0)
    camera.SetViewAngle(56 if mobile else CONFIG['camera']['fov'])
    camera.SetClippingRange(.1,80)
    window.Render()
    result = []
    for flower, point in targets:
        renderer.SetWorldPoint(*point,1); renderer.WorldToDisplay(); p=renderer.GetDisplayPoint()
        radius = (.43 if flower['model']=='tulip' else .73) * flower['scale']
        renderer.SetWorldPoint(*(point+np.array([radius,0,0])),1); renderer.WorldToDisplay(); edge=renderer.GetDisplayPoint()
        result.append({'id':flower['id'],'trigger':flower.get('trigger',False),'x':round(p[0],3),'y':round(height-p[1],3),'radius':round(abs(edge[0]-p[0]),3)})
    capture=vtk.vtkWindowToImageFilter(); capture.SetInput(window); capture.SetInputBufferTypeToRGB(); capture.ReadFrontBufferOn(); capture.Update()
    raw_path=ROOT/'static'/'textures'/('garden-mobile.png' if mobile else 'garden-desktop.png')
    writer=vtk.vtkPNGWriter(); writer.SetFileName(str(raw_path)); writer.SetInputConnection(capture.GetOutputPort()); writer.Write()
    image=Image.open(raw_path).convert('RGB')
    pix=np.asarray(image).astype(np.float32)
    yy,xx=np.mgrid[0:height,0:width]
    # A quiet haze behind the garden, kept away from the typography.
    lightness=np.maximum(pix.max(axis=2)-20,0)/235
    haze=np.exp(-(((xx/width-.5)/.42)**2+((yy/height-.64)/.31)**2)*2)
    background_mask=np.clip(1-lightness*8,0,1)
    pix+=haze[:,:,None]*background_mask[:,:,None]*np.array([4,7,7])
    image=Image.fromarray(np.clip(pix,0,255).astype('uint8'))
    from PIL import ImageDraw
    draw=ImageDraw.Draw(image,'RGBA')
    for _ in range(135 if not mobile else 70):
        x=int(rng.uniform(0,width)); y=int(rng.uniform(.13,.86)*height); rad=float(rng.uniform(.4,1.3))
        draw.ellipse((x-rad,y-rad,x+rad,y+rad),fill=(211,216,193,int(rng.uniform(30,85))))
    image.save(raw_path.with_suffix('.webp'),quality=92,method=6)
    raw_path.unlink()
    window.Finalize()
    return {'width':width,'height':height,'flowers':result}


if __name__=='__main__':
    presets={'desktop':render(1600,1000),'mobile':render(900,1600,True)}
    (ROOT/'static'/'models'/'fallback-positions.json').write_text(json.dumps(presets,indent=2))
    print('Local fallback artwork and matching flower click regions created.')
