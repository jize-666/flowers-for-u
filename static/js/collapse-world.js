import * as THREE from "three";
import { CONFIG, QUALITY } from "./config.js";
import { seededRandom } from "./utils.js";
import { smooth } from "./collapse-core.js";

const surfaceVertex = `varying vec3 vPosition; varying vec3 vNormal; varying vec2 vUv;
void main(){vPosition=position;vNormal=normal;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const output = `\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n`;

export class CollapseWorld {
  constructor(uniforms, atmosphere, quality) {
    this.uniforms=uniforms; this.random=seededRandom(1618); this.resources=[];
    this.root=new THREE.Group(); this.root.name="collapse-and-void";
    this.hole=new THREE.Group(); this.root.add(this.hole);
    const h=CONFIG.collapse.hole; this.hole.position.set(h.x,h.y,h.z);
    this.buildSlash(); this.buildHole(); this.buildVoid(); this.buildMatter(atmosphere);
    const shaders=new Set();
    this.root.traverse(object=>{if(object.material?.isShaderMaterial)shaders.add(object.material);});
    shaders.forEach(material=>{
      material.fragmentShader="uniform float uArrivalFade;\n"+material.fragmentShader.replace("#include <tonemapping_fragment>","gl_FragColor.a *= uArrivalFade;\n#include <tonemapping_fragment>");
    });
    this.setQuality(quality);
  }
  mesh(geometry,material,parent=this.root) {
    this.resources.push(geometry,material); const mesh=new THREE.Mesh(geometry,material); parent.add(mesh); return mesh;
  }
  buildSlash() {
    const c=CONFIG.collapse;
    this.slash=new THREE.Group(); this.slash.position.set(c.hole.x-.5,c.hole.y+.3,c.hole.z-1.5); this.slash.rotation.set(.13,-.16,-.53); this.root.add(this.slash);
    const points=[]; const steps=30;
    for(let i=0;i<=steps;i++) { const t=i/steps; const edge=Math.sin(t*Math.PI)*c.slashWidth*(.65+this.random()*.55); points.push(new THREE.Vector2((t-.5)*c.slashLength,edge)); }
    for(let i=steps;i>=0;i--) { const t=i/steps; const edge=-Math.sin(t*Math.PI)*c.slashWidth*(.7+this.random()*.45); points.push(new THREE.Vector2((t-.5)*c.slashLength,edge)); }
    const shape=new THREE.Shape(points);
    const cut=new THREE.ExtrudeGeometry(shape,{depth:c.slashDepth,bevelEnabled:true,bevelSize:.055,bevelThickness:.07,bevelSegments:2,steps:1});
    const black=new THREE.MeshBasicMaterial({color:0x010103,toneMapped:false,fog:false,transparent:true});
    this.mesh(cut,black,this.slash);
    const edgePoints=points.map((p,i)=>new THREE.Vector3(p.x,p.y,c.slashDepth+.04+Math.sin(i*2.1)*.05)); edgePoints.push(edgePoints[0].clone());
    for(let layer=0;layer<3;layer++) {
      const edgeCurve=new THREE.CatmullRomCurve3(edgePoints,true,"catmullrom",.1);
      const material=new THREE.MeshBasicMaterial({color:layer===0?0x8b78b7:0x3a426b,transparent:true,opacity:layer===0?.85:.4});
      material.color.multiplyScalar(layer===0?1.8:1.2);
      const mesh=this.mesh(new THREE.TubeGeometry(edgeCurve,180,.018+layer*.012,5,true),material,this.slash);
      mesh.scale.set(1+layer*.012,1+layer*.11,1); mesh.position.z=-layer*.12;
    }
    this.slash.scale.y=.001;
  }
  buildHole() {
    this.coreMaterial=new THREE.MeshBasicMaterial({color:0x000001,fog:false,toneMapped:false,transparent:true,opacity:1,depthWrite:true});
    this.core=this.mesh(new THREE.SphereGeometry(1,64,40),this.coreMaterial,this.hole);
    this.disk=new THREE.Group(); this.disk.rotation.set(1.05,.16,-.36); this.hole.add(this.disk);
    // Thick toroidal geometry carries local swirling emission; the core occludes its rear side.
    this.ringMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,
      vertexShader:surfaceVertex,
      fragmentShader:`uniform float uTime;uniform float uAccretion;varying vec3 vPosition;varying vec3 vNormal;varying vec2 vUv;
      void main(){float angle=atan(vPosition.y,vPosition.x);float r=length(vPosition.xy);
      float bands=.55+.25*sin(r*87.-uTime*2.+sin(angle*7.+uTime)*2.);
      float filaments=pow(.5+.5*sin(angle*32.-uTime*4.+r*9.),5.);
      float energy=(bands+filaments*.65)*(.6+.4*sin(angle+uTime*.24));
      vec3 gold=vec3(1.5,.58,.16);vec3 magenta=vec3(.58,.12,.33);
      vec3 color=mix(magenta,gold,.5+.5*sin(angle+1.1))*energy;
      gl_FragColor=vec4(color,uAccretion*.87);${output}}
    `});
    const ring=this.mesh(new THREE.TorusGeometry(1.45,.31,14,160),this.ringMaterial,this.disk); ring.scale.z=.2;
    const outer=this.mesh(new THREE.TorusGeometry(1.98,.12,8,160),this.ringMaterial,this.disk); outer.scale.z=.22;
    const inner=this.mesh(new THREE.TorusGeometry(1.04,.035,8,160),new THREE.MeshBasicMaterial({color:new THREE.Color(1.5,.68,.28),transparent:true,opacity:.9}),this.hole);
    this.photon=inner;
    // Geometric lensing: light trajectories curve in three dimensions around the opaque core.
    this.lensed=[];
    for(let j=0;j<12;j++) {
      const path=[];
      for(let i=0;i<=72;i++) {
        const a=i/72*Math.PI*2, r=1.12+j*.055;
        path.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r*.8,Math.sin(a*2+j)*.28));
      }
      const material=new THREE.MeshBasicMaterial({color:j%3===0?0xc38552:0x695887,transparent:true,opacity:.18});
      this.lensed.push(this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path,true),72,.006,4,true),material,this.hole));
    }
    this.light=new THREE.PointLight(0xe3a073,0,25,2);this.hole.add(this.light);
  }
  buildVoid() {
    const h=CONFIG.collapse.hole, depth=CONFIG.collapse.voidDepth;
    this.voidGroup=new THREE.Group(); this.voidGroup.position.set(h.x,h.y,h.z); this.root.add(this.voidGroup);
    const path=[];
    for(let i=0;i<=16;i++) path.push(new THREE.Vector3(Math.sin(i*.28)*.6,Math.sin(i*.4)*.3,-i/16*(depth+35)));
    const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),160,CONFIG.collapse.voidRadius,40,false);
    this.tunnelMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,side:THREE.BackSide,depthWrite:false,vertexShader:surfaceVertex,
      fragmentShader:`uniform float uTime;uniform float uTunnel;varying vec3 vPosition;varying vec2 vUv;varying vec3 vNormal;
      void main(){float a=atan(vPosition.y,vPosition.x);float z=vPosition.z;
      float flow=.5+.5*sin(a*9.+z*.65+uTime*.65+sin(a*4.-z*.13));
      float wisps=pow(flow,7.);float ribs=pow(.5+.5*sin(z*1.8+sin(a*3.+uTime*.15)),20.);
      vec3 color=mix(vec3(.042,.035,.063),vec3(.16,.13,.28),flow)+vec3(.22,.17,.35)*wisps+vec3(.20,.22,.34)*ribs*.35;
      gl_FragColor=vec4(color,uTunnel*.94);${output}}
    `});
    this.mesh(tube,this.tunnelMaterial,this.voidGroup);
    this.voidRings=[];
    for(let i=0;i<18;i++) {
      const mat=new THREE.MeshBasicMaterial({color:i%3?0x5d507e:0x707e9c,transparent:true,opacity:0});
      const ring=this.mesh(new THREE.TorusGeometry(4.7+Math.sin(i)*.5,.012,5,96),mat,this.voidGroup);
      ring.position.set(Math.sin(i*.4)*.3,0,-i*4.3);ring.rotation.set(Math.sin(i)*.1,Math.cos(i)*.08,i*.37);this.voidRings.push(ring);
    }
    // Low fog is a set of world-space volumes, never a screen overlay.
    this.fog=[];
    for(let i=0;i<12;i++) {
      const mat=new THREE.MeshBasicMaterial({color:0x282133,transparent:true,opacity:0,depthWrite:false,side:THREE.BackSide});
      const fog=this.mesh(new THREE.SphereGeometry(1,18,12),mat,this.voidGroup);
      fog.position.set(Math.sin(i*1.7)*4,Math.cos(i*1.3)*2.4,-i*5);fog.scale.set(5.5,2,5);this.fog.push(fog);
    }
  }
  buildMatter(atmosphere) {
    const count=QUALITY.high.collapse.dust;
    const positions=[],seeds=[];
    const origin=atmosphere.particleGeometry.attributes.position;
    for(let i=0;i<count;i++) {
      const source=i%origin.count;
      positions.push(origin.getX(source),origin.getY(source),origin.getZ(source));seeds.push(this.random());
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("aSeed",new THREE.Float32BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float aSeed;uniform float uTime;uniform float uBreak;uniform float uTravel;uniform vec3 uHole;varying float vSeed;
      void main(){vSeed=aSeed;float a=aSeed*62.8+uTime*(.12+aSeed*.08);float r=2.+aSeed*7.;vec3 orbit=uHole+vec3(cos(a)*r,sin(a)*r*.7,(aSeed-.5)*12.);
      vec3 p=mix(position,orbit,smoothstep(0.,1.,uBreak));p.z-=uTravel*${CONFIG.collapse.voidDepth.toFixed(1)};
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(12./max(.3,-mv.z),1.,3.);}`,
      fragmentShader:`uniform float uBreak;uniform float uTunnel;varying float vSeed;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.03,.5,d))*.65*max(uBreak,uTunnel);gl_FragColor=vec4(mix(vec3(.36,.31,.55),vec3(.75,.54,.32),vSeed),a);${output}}`
    });
    this.resources.push(geometry,material);this.matter=new THREE.Points(geometry,material);this.matter.frustumCulled=false;this.root.add(this.matter);
    this.debris=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.1),new THREE.MeshStandardMaterial({color:0x47354f,roughness:.62,metalness:.12,transparent:true}),QUALITY.high.collapse.distantDebris);
    this.resources.push(this.debris.geometry,this.debris.material);this.root.add(this.debris);this.debris.frustumCulled=false;
    this.dummy=new THREE.Object3D();
  }
  setQuality(name) {
    this.quality=name;this.budget=QUALITY[name].collapse;
    this.matter.geometry.setDrawRange(0,this.budget.dust);this.debris.count=this.budget.distantDebris;
    this.lensed.forEach((mesh,i)=>{mesh.visible=i<this.budget.secondaryArcs;});
    this.fog.forEach((mesh,i)=>{mesh.visible=i<this.budget.fog;});
  }
  update(time,b) {
    const c=CONFIG.collapse;
    this.slash.visible=b.slash>0;this.slash.scale.y=Math.max(.001,b.slash*(1-b.pull*.95));
    this.hole.visible=b.sphere>0 && b.void<.3;
    const radius=(.10+.10*b.sphere)+(c.hole.radius-.2)*b.expansion;
    this.hole.scale.setScalar(radius);this.hole.position.z=c.hole.z+(1-b.sphere)*-1.2;
    this.disk.rotation.z=-.36+time*.035;this.photon.rotation.z=time*.05;
    const disappear=1-smooth((b.pull-.90)/.10);
    this.coreMaterial.opacity=disappear;this.core.visible=disappear>.002;
    this.photon.material.opacity=.88*b.sphere*disappear;
    this.uniforms.uAccretion.value=b.sphere*disappear;
    this.light.intensity=22*b.expansion*disappear;
    this.lensed.forEach((mesh,i)=>{mesh.rotation.z=time*(.025+i*.003);mesh.material.opacity=.17*disappear;});
    this.voidGroup.visible=this.uniforms.uTunnel.value>0;
    this.voidRings.forEach((ring,i)=>{ring.material.opacity=this.uniforms.uTunnel.value*(.12+.08*Math.sin(time*.7+i));ring.rotation.z=i*.37+time*.03;});
    this.fog.forEach(fog=>{fog.material.opacity=this.uniforms.uTunnel.value*.055;});
    const travel=this.uniforms.uTravel.value;
    for(let i=0;i<this.debris.count;i++) {
      const f=i/this.debris.count,angle=i*2.399+time*.25;
      const r=2+f*6;
      this.dummy.position.set(c.hole.x+Math.cos(angle)*r,c.hole.y+Math.sin(angle)*r*.75,c.hole.z+(f-.5)*16-travel*c.voidDepth);
      this.dummy.rotation.set(time*(.1+f),i,time*.2);this.dummy.scale.setScalar((.3+f*1.4)*Math.max(.001,b.slash));this.dummy.updateMatrix();this.debris.setMatrixAt(i,this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate=true;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.debris.dispose();[...new Set(this.resources)].forEach(r=>r.dispose());this.resources.length=0;
    this.disk.clear();this.slash.clear();this.hole.clear();this.voidGroup.clear();this.root.clear();
    this.fog=[];this.voidRings=[];this.lensed=[];this.matter=this.debris=this.core=this.photon=null;
  }
}
