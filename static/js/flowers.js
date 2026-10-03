import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fetchBinaryAsset } from "./loaders.js";
import { CONFIG, FLOWERS, QUALITY } from "./config.js";
import { seededRandom, windOffset, visibleFlowerIds } from "./utils.js";

const vertexPrelude = /* glsl */ `
  attribute vec3 aBudPosition;
  attribute vec3 aBudNormal;
  attribute vec3 aPivot;
  attribute float aPart;
  attribute float aGlow;
  uniform float uTime;
  uniform float uPhase;
  uniform float uWind;
  uniform float uHeight;
  uniform float uStem;
  uniform float uLeaves;
  uniform float uBloom;
  uniform vec3 uPetalTint;
  varying float vFlowerGlow;

  vec2 flowerWind() {
    float a = sin(uTime * 0.68 + uPhase) + 0.34 * sin(uTime * 1.07 + uPhase * 1.8);
    float b = sin(uTime * 0.47 + uPhase * 0.8) + 0.18 * sin(uTime * 0.91 + uPhase);
    return vec2(a, b * 0.4) * uWind;
  }
  vec3 grownPosition(vec3 original) {
    vec3 p = original;
    if (aPart < 0.5) {
      p.y *= uStem;
      p.xz *= mix(0.4, 1.0, uStem);
    } else {
      if (aPart > 1.5 && aPart < 2.5) p = mix(aBudPosition, original, uBloom);
      float leafGrowth = smoothstep(0.0, 1.0, uLeaves * 1.22 - aPivot.y / uHeight * 0.22);
      float headGrowth = smoothstep(0.35, 0.94, uStem);
      float amount = aPart < 1.5 ? leafGrowth : headGrowth;
      p = aPivot + (p - aPivot) * max(0.0001, amount);
      p.y -= aPivot.y * (1.0 - uStem);
    }
    return p;
  }
`;

/** Bake glTF parts to one mesh; keep morphs, pivots and part IDs as vertex data. */
function combineParts(root) {
  root.updateMatrixWorld(true);
  const flowerRoot = root.getObjectByName("Flower");
  if (!flowerRoot || !Number.isFinite(flowerRoot.userData.height) || flowerRoot.userData.height <= 0) {
    throw new Error("The model needs a Flower root with a positive height property. See docs/BLENDER_GUIDE.md.");
  }
  const data = { position: [], normal: [], color: [], aBudPosition: [], aBudNormal: [], aPivot: [], aPart: [], aGlow: [] };
  const indices = [];
  let offset = 0;
  root.traverse(node => {
    if (!node.isMesh) return;
    const source = node.geometry;
    const positions = source.getAttribute("position");
    const normals = source.getAttribute("normal");
    const colors = source.getAttribute("color");
    const morph = source.morphAttributes.position?.[0];
    const morphNormal = source.morphAttributes.normal?.[0];
    const part = Number(node.userData.part);
    if (!positions || !normals || !colors || ![0, 1, 2, 3].includes(part) || !Array.isArray(node.userData.pivot)) {
      throw new Error(`Invalid flower part ${node.name}: keep normals, vertex colors, part, and pivot metadata.`);
    }
    if (part === 2 && !morph) throw new Error(`Petal ${node.name} is missing its Closed morph target.`);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
    const pivot = new THREE.Vector3(...(node.userData.pivot ?? [0, 0, 0])).applyMatrix4(node.matrixWorld);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const bud = new THREE.Vector3();
    const budN = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 1) {
      p.fromBufferAttribute(positions, i);
      n.fromBufferAttribute(normals, i);
      bud.copy(p);
      budN.copy(n);
      if (morph) {
        bud.fromBufferAttribute(morph, i);
        if (source.morphTargetsRelative) bud.add(p);
      }
      if (morphNormal) {
        budN.fromBufferAttribute(morphNormal, i);
        if (source.morphTargetsRelative) budN.add(n);
      }
      p.applyMatrix4(node.matrixWorld);
      bud.applyMatrix4(node.matrixWorld);
      n.applyNormalMatrix(normalMatrix);
      budN.applyNormalMatrix(normalMatrix);
      data.position.push(p.x, p.y, p.z);
      data.normal.push(n.x, n.y, n.z);
      data.aBudPosition.push(bud.x, bud.y, bud.z);
      data.aBudNormal.push(budN.x, budN.y, budN.z);
      data.color.push(colors?.getX(i) ?? 1, colors?.getY(i) ?? 1, colors?.getZ(i) ?? 1);
      data.aPivot.push(pivot.x, pivot.y, pivot.z);
      data.aPart.push(part);
      data.aGlow.push(Number(node.userData.emission ?? 0));
    }
    if (source.index) {
      for (let i = 0; i < source.index.count; i += 1) indices.push(source.index.getX(i) + offset);
    } else {
      for (let i = 0; i < positions.count; i += 1) indices.push(i + offset);
    }
    offset += positions.count;
  });
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(data)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, name === "aPart" || name === "aGlow" ? 1 : 3));
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 1;
  if (offset === 0) throw new Error("The flower model has no mesh geometry.");
  const height = flowerRoot.userData.height;
  return { geometry, height };
}

function createFlowerMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.46, metalness: 0.035, side: THREE.DoubleSide, transparent: true });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexPrelude + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", `
      #include <color_vertex>
      vColor *= mix(vec3(1.0), uPetalTint, step(1.5, aPart));
      vFlowerGlow = aGlow;
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `
      #include <beginnormal_vertex>
      if (aPart > 1.5 && aPart < 2.5) objectNormal = normalize(mix(aBudNormal, normal, uBloom));
      vec3 unbent = grownPosition(position);
      vec2 derivative = 2.0 * max(0.0, unbent.y) / uHeight * flowerWind();
      objectNormal.y -= derivative.x * objectNormal.x + derivative.y * objectNormal.z;
      objectNormal = normalize(objectNormal);
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      vec3 transformed = grownPosition(position);
      float h = max(0.0, transformed.y / uHeight);
      transformed.xz += h * h * uHeight * flowerWind();
    `);
    shader.fragmentShader = `uniform float uHover; uniform float uVisibility; varying float vFlowerGlow;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += vColor * (vFlowerGlow + uHover * 0.12);
      diffuseColor.a *= uVisibility;
      if (diffuseColor.a < 0.002) discard;
    `);
  };
  material.customProgramCacheKey = () => "flowers-for-you-v1";
  return material;
}

export class FlowerGarden {
  constructor(scene, templates, quality, reducedMotion) {
    this.scene = scene;
    this.templates = templates;
    this.reducedMotion = reducedMotion;
    this.wind = { multiplier: 1 };
    this.time = { value: 0 };
    this.flowers = [];
    this.pickTargets = [];
    this.random = seededRandom(4412);
    this.quality = quality;
    this.visibleIds = visibleFlowerIds(FLOWERS, QUALITY[quality].flowers);
    this.pickGeometry = new THREE.SphereGeometry(1, 12, 8);
    this.pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
    FLOWERS.forEach((definition, index) => this.addFlower(definition, index));
  }

  static async load(onProgress = () => {}) {
    const loader = new GLTFLoader();
    const entries = Object.entries(CONFIG.modelPaths);
    const progress = entries.map(() => 0);
    const templates = {};
    await Promise.all(entries.map(async ([kind, url], index) => {
      const binary = await fetchBinaryAsset(url, ratio => {
        progress[index] = ratio;
        onProgress(progress.reduce((a, b) => a + b, 0) / entries.length);
      });
      const asset = await loader.parseAsync(binary, new URL(".", new URL(url, location.href)).href);
      templates[kind] = combineParts(asset.scene);
      progress[index] = 1;
      onProgress(progress.reduce((a, b) => a + b, 0) / entries.length);
      asset.scene.traverse(node => {
        if (node.isMesh) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(material => material.dispose());
        }
      });
    }));
    return templates;
  }

  addFlower(definition, index) {
    const template = this.templates[definition.model];
    const root = new THREE.Group();
    root.position.set(definition.x, CONFIG.groundY, definition.z);
    root.rotation.set(0, definition.yaw, definition.lean);
    root.scale.setScalar(definition.scale);
    root.userData.isLetterTrigger = Boolean(definition.trigger);
    root.userData.flowerId = definition.id;
    const visible = this.visibleIds.has(definition.id);
    const phase = this.random() * Math.PI * 2;
    const amplitude = CONFIG.wind.strength * (0.75 + this.random() * 0.5);
    const uniforms = {
      uTime: this.time, uPhase: { value: phase }, uHeight: { value: template.height },
      uWind: { value: amplitude }, uStem: { value: 0.0001 }, uLeaves: { value: 0 },
      uBloom: { value: 0 }, uHover: { value: 0 }, uVisibility: { value: visible ? 1 : 0 },
      uPetalTint: { value: new THREE.Color(definition.tint) },
    };
    const material = createFlowerMaterial(uniforms);
    const mesh = new THREE.Mesh(template.geometry, material);
    mesh.visible = visible;
    // Vertex deformation extends outside the original, closed bud bounds.
    mesh.frustumCulled = false;
    root.add(mesh);
    const proxy = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    proxy.scale.setScalar(definition.model === "tulip" ? 0.43 : 0.73);
    root.add(proxy);
    this.scene.add(root);
    const flower = { definition, root, mesh, proxy, uniforms, phase, amplitude, height: template.height, visible, index };
    proxy.userData.flower = flower;
    this.flowers.push(flower);
    this.pickTargets.push(proxy);
  }

  grow(timeline, start = 0) {
    for (const flower of this.flowers) {
      const at = start + flower.definition.delay;
      const { uStem, uLeaves, uBloom } = flower.uniforms;
      timeline.to(uStem, { value: 1, duration: CONFIG.growth.duration, ease: "power2.inOut" }, at);
      timeline.to(uLeaves, { value: 1, duration: 2.5, ease: "sine.inOut" }, at + CONFIG.growth.leafDelay);
      timeline.to(uBloom, { value: 1, duration: 2.6, ease: "sine.inOut" }, at + CONFIG.growth.bloomDelay);
    }
  }

  finishGrowth() {
    this.flowers.forEach(({ uniforms }) => {
      uniforms.uStem.value = 1;
      uniforms.uLeaves.value = 1;
      uniforms.uBloom.value = 1;
    });
  }

  hover(flower, gsap) {
    this.flowers.forEach(item => {
      gsap.to(item.uniforms.uHover, { value: item === flower ? 1 : 0, duration: 0.55, ease: "sine.out", overwrite: true });
    });
  }

  update(time) {
    this.time.value = time * CONFIG.wind.speed / 0.68;
    for (const flower of this.flowers) {
      const { uniforms, height } = flower;
      const amplitude = this.reducedMotion ? 0 : flower.amplitude * this.wind.multiplier;
      uniforms.uWind.value = amplitude;
      const growth = uniforms.uStem.value;
      const offset = windOffset(this.time.value, flower.phase, amplitude, height, growth);
      flower.proxy.position.set(offset.x, height * growth, offset.z);
      flower.proxy.userData.pickable = flower.mesh.visible && growth > 0.97 && uniforms.uVisibility.value > 0.9;
    }
  }

  setQuality(name, gsap) {
    this.quality = name;
    this.visibleIds = visibleFlowerIds(FLOWERS, QUALITY[name].flowers);
    this.flowers.forEach(flower => {
      const visible = this.visibleIds.has(flower.definition.id);
      if (visible) flower.mesh.visible = true;
      gsap.to(flower.uniforms.uVisibility, {
        value: visible ? 1 : 0, duration: 0.65, overwrite: true,
        onComplete: () => { flower.mesh.visible = visible; },
      });
    });
  }

  dispose() {
    Object.values(this.templates).forEach(template => template.geometry.dispose());
    this.flowers.forEach(flower => { flower.mesh.material.dispose(); this.scene.remove(flower.root); });
    this.pickGeometry.dispose();
    this.pickMaterial.dispose();
  }
}
