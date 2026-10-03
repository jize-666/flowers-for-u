"""Validate actual bundled GLB buffers and required runtime asset references."""
from pathlib import Path
import json
import math
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AssetTests(unittest.TestCase):
    def test_glb_buffers_morphs_and_metadata(self):
        for path in (ROOT / 'static' / 'models').glob('*.glb'):
            with self.subTest(model=path.name):
                raw = path.read_bytes()
                magic, version, length = struct.unpack_from('<4sII', raw)
                self.assertEqual(magic, b'glTF'); self.assertEqual(version, 2); self.assertEqual(length, len(raw))
                json_size, kind = struct.unpack_from('<I4s', raw, 12)
                self.assertEqual(kind, b'JSON')
                doc = json.loads(raw[20:20+json_size])
                binary_size, kind = struct.unpack_from('<I4s', raw, 20+json_size)
                self.assertEqual(kind, b'BIN\0')
                binary = raw[28+json_size:]
                self.assertEqual(binary_size, len(binary))
                self.assertEqual(doc['nodes'][0]['name'], 'Flower')
                self.assertGreater(doc['nodes'][0]['extras']['height'], 0)
                parts = {n['extras']['part'] for n in doc['nodes'] if 'mesh' in n}
                self.assertEqual(parts, {0,1,2,3})
                morph_count=0
                for node in doc['nodes']:
                    if 'mesh' not in node: continue
                    primitive=doc['meshes'][node['mesh']]['primitives'][0]
                    if node['extras']['part']==2:
                        self.assertIn('targets',primitive); morph_count+=1
                    for key in ['POSITION','NORMAL','COLOR_0']:
                        accessor=doc['accessors'][primitive['attributes'][key]]
                        view=doc['bufferViews'][accessor['bufferView']]
                        start=view.get('byteOffset',0)+accessor.get('byteOffset',0)
                        size=accessor['count']*3*4
                        self.assertLessEqual(start+size,len(binary))
                        values=struct.unpack_from('<'+'f'*(accessor['count']*3),binary,start)
                        self.assertTrue(all(math.isfinite(value) for value in values))
                    index=doc['accessors'][primitive['indices']]
                    view=doc['bufferViews'][index['bufferView']]
                    values=struct.unpack_from('<'+'I'*index['count'],binary,view.get('byteOffset',0))
                    count=doc['accessors'][primitive['attributes']['POSITION']]['count']
                    self.assertLess(max(values),count)
                self.assertGreaterEqual(morph_count,6)
                self.assertLess(len(raw),2_000_000)

    def test_required_assets_exist(self):
        for path in ['static/textures/paper.webp','static/textures/grain.png','static/textures/garden-desktop.webp','static/textures/garden-mobile.webp','static/audio/night-garden.ogg','static/audio/night-garden.mp3','static/icons/sprite.svg','static/icons/favicon.svg']:
            self.assertGreater((ROOT/path).stat().st_size,0)
        positions=json.loads((ROOT/'static/models/fallback-positions.json').read_text())
        for preset in positions.values():
            triggers=[flower for flower in preset['flowers'] if flower['trigger']]
            self.assertEqual(len(triggers),3)
            for flower in triggers:
                self.assertTrue(0<flower['x']<preset['width'])
                self.assertTrue(0<flower['y']<preset['height'])


if __name__=='__main__':
    unittest.main()
