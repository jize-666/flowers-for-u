"""Offline checks for dependency selection, not network download verification."""
from pathlib import Path
import importlib.util
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vendor', ROOT / 'tools/vendor_dependencies.py')
vendor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vendor)


class VendorTests(unittest.TestCase):
    def test_matching_addon_dependencies_are_recursive(self):
        files = {
            'build/main.js': b'import { Core } from "./core.js";',
            'build/core.js': b'export class Core {}',
            'addons/pass.js': b'import { Core } from "../build/core.js"; import "./helper.js";',
            'addons/helper.js': b'export const ready = true;',
        }
        selected = vendor.module_tree(files, ['build/main.js', 'addons/pass.js'])
        self.assertEqual(selected, set(files))

    def test_missing_dependency_fails(self):
        with self.assertRaises(ValueError):
            vendor.module_tree({'main.js': b'import "./missing.js";'}, ['main.js'])

    def test_path_traversal_fails(self):
        with self.assertRaises(ValueError):
            vendor.module_tree({'main.js': b'import "../outside.js";'}, ['main.js'])

    def test_cycle_terminates(self):
        selected = vendor.module_tree({'a.js': b'import "./b.js";', 'b.js': b'import "./a.js";'}, ['a.js'])
        self.assertEqual(selected, {'a.js', 'b.js'})


if __name__ == '__main__':
    unittest.main()
