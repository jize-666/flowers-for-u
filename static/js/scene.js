// COLLAPSE INTEGRATION: existing garden retained; transition ownership and cleanup added.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CONFIG, QUALITY } from "./config.js";
import { damp } from "./utils.js";
import { RenderBudget } from "./render-budget.js";

export class GardenScene {
  constructor(canvas, quality, reducedMotion) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.pointer = { x: 0, y: 0 };
    this.parallax = { value: 1 };
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.background);
    this.scene.fog = new THREE.FogExp2(CONFIG.background, 0.035);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 80);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.camera.position.set(CONFIG.camera.x, CONFIG.camera.y, CONFIG.camera.z);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, CONFIG.camera.targetY, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.30;
    this.controls.zoomSpeed = 0.50;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 19;
    this.controls.minPolarAngle = 1.18;
    this.controls.maxPolarAngle = 1.63;
    this.controls.minAzimuthAngle = -0.38;
    this.controls.maxAzimuthAngle = 0.38;
    this.controls.enabled = false;
    this.controls.update();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.setClearColor(CONFIG.background);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.addLights();
    this.setQuality(quality);
    this.resize();
    this.controls.saveState();
    this.saved = null;
    this.budget = new RenderBudget();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xc4dedb, 0x0e1e18, 1.8));
    const key = new THREE.DirectionalLight(0xffeadd, 3.6);
    key.position.set(-3, 6, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x81b8cc, 2.4);
    rim.position.set(4, 5, -4);
    this.scene.add(rim);
    const rose = new THREE.PointLight(0xed9eba, 13, 11, 2);
    rose.position.set(1.8, 3.4, 2.8);
    this.scene.add(rose);
    const fill = new THREE.DirectionalLight(0x95a981, 0.6);
    fill.position.set(-5, 1, 1);
    this.scene.add(fill);
  }

  setQuality(name) {
    this.quality = name;
    const quality = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.dpr));
    this.bloom.enabled = quality.bloom;
    this.resize();
  }

  resize() {
    const width = innerWidth;
    const height = innerHeight;
    this.camera.aspect = width / height;
    // Preserve the central composition on portrait screens without narrowing the garden.
    this.camera.fov = width / height < 0.85 ? 56 : CONFIG.camera.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.resizeBloom();
  }

  resizeBloom() {
    // COLLAPSE INTEGRATION: retain native garden bloom resolution until commit.
    const scale=this.cinematic?CONFIG.performance.bloomByQuality[this.quality]*(this.budget?.scale??1):1,dpr=this.renderer.getPixelRatio();
    // Composer output/scene DPR stays intact. Only bloom's internal mip chain is resized.
    this.bloom.setSize(Math.max(1,Math.round(innerWidth*dpr*scale)),Math.max(1,Math.round(innerHeight*dpr*scale)));
    this.bloomScale=scale;
  }

  observeFrame(ms,now,state) {
    if(this.budget.observe(ms,now,state,!document.hidden)!==null&&this.bloom.enabled)this.resizeBloom();
  }

  performanceSnapshot() {
    return {quality:this.quality,sceneDpr:this.renderer.getPixelRatio(),bloomEnabled:this.bloom.enabled,bloomScale:this.bloomScale,
      bloomTarget:[this.bloom.renderTargetBright.width,this.bloom.renderTargetBright.height],resolutionHistory:[...this.budget.history],
      memory:{...this.renderer.info.memory},render:{...this.renderer.info.render}};
  }

  update(delta, motionEnabled) {
    if (this.cinematic) { this.scene.updateMatrixWorld(); return; }
    if (this.controls.enabled) this.controls.update(delta);
    const active = motionEnabled && !this.reducedMotion && matchMedia("(pointer: fine)").matches;
    const strength = active ? CONFIG.camera.parallax * this.parallax.value : 0;
    this.rig.position.x = damp(this.rig.position.x, this.pointer.x * strength, 2.4, delta);
    this.rig.position.y = damp(this.rig.position.y, this.pointer.y * strength * 0.42, 2.4, delta);
    this.scene.updateMatrixWorld();
  }

  focus(timeline, position) {
    this.controls.enabled = false;
    this.saved = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    const target = this.controls.target.clone().lerp(position, 0.18);
    timeline.to(this.parallax, { value: 0, duration: 0.6 }, 0);
    if (!this.reducedMotion) {
      timeline.to(this.camera.position, { x: this.saved.position.x * 0.88 + position.x * 0.10, z: this.saved.position.z * 0.96, duration: 1.0, ease: "power2.inOut", onUpdate: () => this.camera.lookAt(this.controls.target) }, 0);
      timeline.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: 1.0, ease: "power2.inOut", onUpdate: () => this.camera.lookAt(this.controls.target) }, 0);
    }
  }

  restore(timeline) {
    if (!this.saved) return;
    const { position, target } = this.saved;
    const duration = this.reducedMotion ? 0.12 : 0.8;
    timeline.to(this.camera.position, { x: position.x, y: position.y, z: position.z, duration, ease: "power2.inOut", onUpdate: () => this.camera.lookAt(this.controls.target) }, 0);
    timeline.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration, ease: "power2.inOut", onUpdate: () => this.camera.lookAt(this.controls.target) }, 0);
    timeline.to(this.parallax, { value: 1, duration }, 0);
  }

  render(delta) { this.renderer.info.autoReset=false;this.renderer.info.reset();this.composer.render(delta); }

  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.controls.dispose();
    this.composer.passes.forEach(pass=>pass.dispose?.());
    this.composer.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}
