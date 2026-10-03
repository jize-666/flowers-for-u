"""Flask endpoint checks; skipped explicitly if Flask is not installed."""
from pathlib import Path
import importlib.util
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
HAS_FLASK = importlib.util.find_spec('flask') is not None


@unittest.skipUnless(HAS_FLASK, 'Flask is not installed; run pip install -r requirements.txt')
class ServerTests(unittest.TestCase):
    def setUp(self):
        from app import app
        self.client = app.test_client()

    def test_home_and_health(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'id="letter-dialog"', response.data)
        self.assertEqual(self.client.get('/health').json['status'], 'ok')

    def test_asset_mime_types_and_missing_asset(self):
        for url, content_type in [('/static/js/main.js', 'text/javascript'), ('/static/models/flower.glb', 'model/gltf-binary'), ('/static/audio/night-garden.ogg', 'audio/ogg')]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.content_type.startswith(content_type), response.content_type)
            self.assertEqual(response.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(self.client.get('/static/missing.glb').status_code, 404)


if __name__ == '__main__':
    unittest.main()
