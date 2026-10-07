import * as THREE from "three";
import { CONFIG } from "./config.js";
import { seededRandom } from "./utils.js";
import { partitionFlower, bakeFlowerVertex } from "./fracture-data.js";

export class GardenFragments {
  constructor(garden, atmosphere, uniforms) {
    this.garden = garden; this.atmosphere = atmosphere; this.uniforms = uniforms;
    this.random = seededRandom(618);
    this.entries = []; this.vertexCount = 0; this.indices = [];
    const vector = new THREE.Vector3();
    const add = (geometry, source, indices, kind, matrix, flower = null, grass = false) => {
      const offset = this.vertexCount;
      const entry = { geometry, source, indices, kind, matrix, flower, grass, offset, seed: this.random(), delay: this.random() * 0.52 };
      this.entries.push(entry);
      this.vertexCount += source.length;
      for (const index of indices) this.indices.push(index + offset);
      return entry;
    };
    for (const flower of garden.flowers) {
      const geometry = flower.mesh.geometry;
      const groups = partitionFlower({ positions: geometry.attributes.position.array, parts: geometry.attributes.aPart.array, pivots: geometry.attributes.aPivot.array, indices: geometry.index.array, height: flower.height });
      for (const group of groups) add(geometry, group.source, group.indices, group.kind, flower.root.matrixWorld, flower);
    }
    const grassGeo = atmosphere.grassGeometry;
    for (let i = 0; i < atmosphere.grass.count; i++) {
      const matrix = new THREE.Matrix4(); atmosphere.grass.getMatrixAt(i, matrix);
      const entry = add(grassGeo, Array.from({ length: grassGeo.attributes.position.count }, (_, j) => j), [...grassGeo.index.array], 1, matrix, null, true);
      entry.grassColor = new THREE.Color(); atmosphere.grass.getColorAt(i, entry.grassColor);
    }
    // Soil: closed triangular wedges; top edge cracks before the pieces spiral away.
    // New procedural geometry is restricted to the ground/root elements approved in A9-A10.
    this.owned = [];
    for (let x = -7; x < 7; x += 1.4) for (let z = -5; z < 4; z += 1.5) {
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1.36, 0.03); shape.lineTo(0.95, 1.42); shape.lineTo(0.02, 1.46); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.owned.push(geo);
      add(geo, Array.from({ length: geo.attributes.position.count }, (_, j) => j), Array.from({ length: geo.attributes.position.count }, (_, j) => j), 4, new THREE.Matrix4().makeTranslation(x, CONFIG.groundY - 0.18, z));
    }
    for (const flower of garden.flowers) {
      for (let branch = 0; branch < 2; branch++) {
        const angle = flower.index * 1.7 + branch * 2.3;
        const base = new THREE.Vector3(flower.definition.x, CONFIG.groundY - 0.03, flower.definition.z);
        const curve = new THREE.CatmullRomCurve3([base, base.clone().add(vector.set(Math.cos(angle) * 0.45, -0.10, Math.sin(angle) * 0.5)), base.clone().add(new THREE.Vector3(Math.cos(angle) * 1.5, -0.07, Math.sin(angle) * 1.6))]);
        const geo = new THREE.TubeGeometry(curve, 10, 0.025, 5, false); this.owned.push(geo);
        add(geo, Array.from({ length: geo.attributes.position.count }, (_, j) => j), [...geo.index.array], 5, new THREE.Matrix4());
      }
    }
    const arrays = { position: 3, normal: 3, color: 3, aCenter: 3, aMotion: 3, aKind: 1, aActive: 1, aGlow: 1 };
    this.geometry = new THREE.BufferGeometry();
    for (const [name, size] of Object.entries(arrays)) this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(this.vertexCount * size), size));
    this.geometry.setIndex(this.indices);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.035, side: THREE.DoubleSide, transparent: true });
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = /* glsl */ `
        attribute vec3 aCenter; attribute vec3 aMotion; attribute float aKind; attribute float aActive; attribute float aGlow;
        uniform float uTime; uniform float uBreak; uniform float uPull; uniform float uVoid;
        uniform float uTravel; uniform vec3 uHole; uniform float uCameraZ;
        varying float vKind; varying float vQ; varying float vActive; varying float vGlow;
        mat3 spin(float a) { float c=cos(a),s=sin(a); return mat3(c,0.,s, 0.,1.,0., -s,0.,c); }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `
        #include <beginnormal_vertex>
        float qn = smoothstep(0.,1.,clamp((uBreak-aMotion.y)/(1.-aMotion.y),0.,1.));
        objectNormal = spin(qn * (uTime * .55 + aMotion.x * 9.)) * objectNormal;
      `);
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", /* glsl */ `
        float q = smoothstep(0.,1.,clamp((uBreak-aMotion.y)/(1.-aMotion.y),0.,1.));
        vKind=aKind; vQ=q; vActive=aActive; vGlow=aGlow;
        vec3 local = position - aCenter;
        // Petals and leaves sharpen into dimensional shards; centers become compact cores.
        float crystal = smoothstep(.35,.92,q);
        if (aKind > .5 && aKind < 2.5) {
          vec3 facets = floor(local*9.+.5)/9.;
          local = mix(local, facets * vec3(.72,1.5,.46), crystal);
        }
        if (aKind > 2.5 && aKind < 3.5) local = mix(local, normalize(local+vec3(.0001))*.13,crystal);
        // Curved stem sections inherit their GLB shape and bend further into orbital arcs.
        if (aKind < .5) local.x += sin(local.y*3.)*.32*crystal;
        vec3 offset = aCenter-uHole;
        float theta = atan(offset.y,offset.x)+q*(uTime*.58+aMotion.x*6.);
        float radius = mix(length(offset.xy), .8+aMotion.x*2.7,q);
        vec3 orbit = uHole + vec3(cos(theta)*radius,sin(theta)*radius*.68,mix(offset.z,0.,q));
        vec3 origin = mix(aCenter,orbit,q);
        // Continuous final pull into a long 3D debris corridor (same geometry in void).
        float travelMix = smoothstep(0.,.3,uTravel);
        float tubeRadius = .35+aMotion.x*5.2;
        vec3 downstream = uHole + vec3(cos(theta)*tubeRadius,sin(theta)*tubeRadius,
          uCameraZ-uHole.z - 1.2-aMotion.z*18.);
        origin = mix(origin,downstream,travelMix);
        vec3 transformed = origin + spin(q*(uTime*.55+aMotion.x*9.))*local;
      `);
      shader.fragmentShader = /* glsl */ `
        uniform float uShowGarden; uniform float uFreeze; uniform float uTime;
        varying float vKind; varying float vQ; varying float vActive; varying float vGlow;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
        #include <color_fragment>
        if(vActive < .5 || (vKind < 3.5 && uShowGarden < .5)) discard;
        if(vKind > 3.5) diffuseColor.a *= uFreeze;
        vec3 shardColor = mix(vec3(.24,.18,.37),vec3(.65,.53,.69),clamp(vKind*.18,0.,1.));
        diffuseColor.rgb=mix(diffuseColor.rgb,shardColor,smoothstep(.45,1.,vQ)*.8);
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vColor*(vGlow+.036*uFreeze)*(1.-vQ);
        float vein = step(4.5,vKind);
        float core = step(2.5,vKind)*(1.-step(3.5,vKind));
        totalEmissiveRadiance += (vec3(.21,.10,.32)*vein+vec3(.48,.25,.10)*core)*vQ;
      `);
    };
    this.material.customProgramCacheKey = () => "garden-structural-fragments-v2";
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false;
    this.mesh.name = "garden-derived-fragments";
    this.capture();
  }
  capture() {
    const attributes = this.geometry.attributes;
    const p = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3(), color = new THREE.Color();
    this.garden.scene.updateMatrixWorld(true);
    for (const entry of this.entries) {
      const { geometry, source, offset, flower, kind } = entry;
      const matrix = flower ? flower.root.matrixWorld : entry.matrix;
      normalMatrix.getNormalMatrix(matrix);
      const center = new THREE.Vector3();
      for (let j = 0; j < source.length; j++) {
        const sourceIndex = source[j], index = offset + j;
        p.fromBufferAttribute(geometry.attributes.position, sourceIndex);
        n.fromBufferAttribute(geometry.attributes.normal, sourceIndex);
        if (flower) {
          const read = name => { const a=geometry.attributes[name]; return [a.getX(sourceIndex),a.getY(sourceIndex),a.getZ(sourceIndex)]; };
          p.fromArray(bakeFlowerVertex(p.toArray(),read("aBudPosition"),read("aPivot"),kind,flower.height,flower.uniforms.uStem.value,flower.uniforms.uLeaves.value,flower.uniforms.uBloom.value));
          if (kind===2) n.lerp(new THREE.Vector3().fromArray(read("aBudNormal")),1-flower.uniforms.uBloom.value).normalize();
          color.fromBufferAttribute(geometry.attributes.color, sourceIndex);
          if (kind >= 2) color.multiply(flower.uniforms.uPetalTint.value);
        } else if (entry.grass) {
          const originalY=p.y;
          p.y *= this.atmosphere.grassGrowth.value;
          p.x += originalY*originalY*Math.sin(this.atmosphere.grassTime.value*.55+matrix.elements[12]*.8)*.04;
          color.copy(entry.grassColor).multiply(this.atmosphere.grassMaterial.color);
        } else color.set(kind===4 ? 0x15131b : 0x342439);
        p.applyMatrix4(matrix); n.applyNormalMatrix(normalMatrix); center.add(p);
        attributes.position.setXYZ(index,p.x,p.y,p.z); attributes.normal.setXYZ(index,n.x,n.y,n.z);
        attributes.color.setXYZ(index,color.r,color.g,color.b);
        attributes.aKind.setX(index,kind);
        attributes.aGlow.setX(index,flower ? geometry.attributes.aGlow.getX(sourceIndex) : 0);
        attributes.aActive.setX(index,flower && !flower.mesh.visible ? 0 : 1);
      }
      center.multiplyScalar(1/source.length);
      for(let j=0;j<source.length;j++) {
        const index=offset+j;
        attributes.aCenter.setXYZ(index,center.x,center.y,center.z);
        attributes.aMotion.setXYZ(index,entry.seed,entry.delay,(entry.seed*13.37)%1);
      }
    }
    Object.values(attributes).forEach(a=>{a.needsUpdate=true;});
    this.geometry.computeBoundingSphere();
  }
  releaseSources() { this.entries.length=0; this.garden=null; this.atmosphere=null; this.owned.forEach(g=>g.dispose()); this.owned=[]; }
  dispose() { if(this.disposed)return;this.disposed=true;this.geometry.dispose();this.material.dispose();this.releaseSources();this.mesh.removeFromParent();this.geometry=this.material=this.mesh=null;this.indices=[]; }
}
