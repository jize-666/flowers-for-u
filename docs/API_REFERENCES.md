# API references

Primary documentation consulted for this implementation:

- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- GSAP Timeline: https://gsap.com/docs/v3/GSAP/Timeline/
- Blender glTF export operator: https://docs.blender.org/api/current/bpy.ops.export_scene.html
- Flask installation: https://flask.palletsprojects.com/en/stable/installation/

Runtime versions are intentionally pinned to Three.js 0.180.0 and GSAP 3.13.0.
The current documentation can show APIs from newer releases; upgrade pinned
packages only after rerunning browser_full.py and the manual QA checklist.
These references are not evidence that live Three.js/GSAP or Blender ran in the
restricted build environment. See QA.md for the actual test coverage.
