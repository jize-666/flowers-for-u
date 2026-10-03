import * as THREE from "three";
import { CONFIG, QUALITY } from "./config.js";
import { seededRandom } from "./utils.js";

export class Atmosphere {
  constructor(scene, quality) {
    this.scene = scene;
    this.random = seededRandom(2007);
    this.uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 }, uFocus: { value: 1 }, uDpr: { value: 1 } };
    this.createParticles();
    this.createGrass();
    this.setQuality(quality);
  }

  createParticles() {
    const count = QUALITY.high.particles;
    const positions = [], seeds = [];
    for (let i = 0; i < count; i += 1) {
      positions.push((this.random() - 0.5) * 20, this.random() * 9 - 2, (this.random() - 0.5) * 14 - 2);
      seeds.push(this.random());
    }
    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uDpr;
        varying float vSeed;
        void main() {
          vSeed = aSeed;
          vec3 p = position;
          p.x += sin(uTime * 0.12 + aSeed * 30.0) * 0.35;
          p.y = mod(p.y + 2.0 + uTime * (0.016 + aSeed * 0.012), 9.0) - 2.0;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp((0.8 + aSeed * 1.7) * 11.0 / -mvPosition.z, 0.7, 3.5) * uDpr;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uFocus;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float alpha = (1.0 - smoothstep(0.05, 0.5, d)) * (0.33 + 0.16 * sin(uTime * 0.5 + vSeed * 50.0));
          vec3 color = mix(vec3(0.63, 0.75, 0.75), vec3(1.0, 0.85, 0.65), vSeed);
          gl_FragColor = vec4(color, alpha * uOpacity * uFocus);
        }
      `,
    });
    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  createGrass() {
    const positions = [], indices = [];
    const rows = 11;
    for (let i = 0; i < rows; i += 1) {
      const t = i / (rows - 1);
      const width = 0.018 * (1 - t) + 0.0001;
      positions.push(-width + t * t * 0.15, t, 0, t * t * 0.15, t, 0.014 * Math.sin(t * Math.PI), width + t * t * 0.15, t, 0);
      if (i < rows - 1) {
        for (let col = 0; col < 2; col += 1) {
          const a = i * 3 + col;
          indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        }
      }
    }
    this.grassGeometry = new THREE.BufferGeometry();
    this.grassGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.grassGeometry.setIndex(indices);
    this.grassGeometry.computeVertexNormals();
    this.grassGrowth = { value: 0.001 };
    this.grassTime = { value: 0 };
    this.grassMaterial = new THREE.MeshStandardMaterial({ color: 0x829c79, roughness: 0.63, side: THREE.DoubleSide });
    this.grassMaterial.onBeforeCompile = shader => {
      shader.uniforms.uGrowth = this.grassGrowth;
      shader.uniforms.uTime = this.grassTime;
      shader.vertexShader = `uniform float uGrowth; uniform float uTime;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        transformed.y *= uGrowth;
        transformed.x += position.y * position.y * sin(uTime * 0.55 + instanceMatrix[3].x * 0.8) * 0.04;
      `);
    };
    this.grass = new THREE.InstancedMesh(this.grassGeometry, this.grassMaterial, QUALITY.high.grass);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < QUALITY.high.grass; i += 1) {
      dummy.position.set((this.random() - 0.5) * 12, CONFIG.groundY - 0.035, (this.random() - 0.5) * 4);
      dummy.rotation.set(0, this.random() * Math.PI, (this.random() - 0.5) * 0.50);
      dummy.scale.set(0.8 + this.random() * 0.9, 0.35 + this.random() * 1.1, 1);
      dummy.updateMatrix();
      this.grass.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.30 + this.random() * 0.08, 0.23, 0.17 + this.random() * 0.12);
      this.grass.setColorAt(i, color);
    }
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);
  }

  setQuality(name) {
    const profile = QUALITY[name];
    this.particleGeometry.setDrawRange(0, profile.particles);
    this.grass.count = profile.grass;
    this.uniforms.uDpr.value = Math.min(devicePixelRatio || 1, profile.dpr);
  }

  update(time, reducedMotion) {
    this.uniforms.uTime.value = reducedMotion ? 0 : time;
    this.grassTime.value = reducedMotion ? 0 : time;
  }

  dispose() {
    this.scene.remove(this.particles, this.grass);
    [this.particleGeometry, this.particleMaterial, this.grassGeometry, this.grassMaterial].forEach(resource => resource.dispose());
  }
}
