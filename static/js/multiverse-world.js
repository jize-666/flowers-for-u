import * as THREE from "three";
import { CONFIG } from "./config.js";
import { sphereVisible } from "./render-budget.js";

/** One instanced draw for all volumetric universe surfaces and their branch possibilities. */
export class MultiverseWorld {
  constructor(model,lineage){
    this.model=model;this.root=new THREE.Group();this.root.name="multiverse-derived-matter";this.root.visible=false;
    this.frustum=new THREE.Frustum();this.viewProjection=new THREE.Matrix4();this.cullPlanes=Array.from({length:6},()=>[0,0,0,0]);
    this.uniforms={uTime:{value:0},uReveal:{value:0},uCamera:{value:new THREE.Vector3()}};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:true,
      vertexShader:`attribute float aEnergy;attribute float aCollapse;attribute float aSeed;attribute float aVisibility;
      uniform vec3 uCamera;uniform float uTime;varying vec3 vLocal;varying vec3 vCamera;varying float vEnergy;varying float vCollapse;varying float vSeed;varying float vVisibility;
      void main(){float q=smoothstep(0.,1.,aCollapse);float flow=sin(q*3.14159265);vec3 p=position;
      float angle=atan(p.y,p.x)+flow*(p.z*2.3+uTime*.8);float radius=length(p.xy)*(1.-.82*q);
      p.xy=vec2(cos(angle),sin(angle))*radius;p.z*=1.-.82*q;p.y+=flow*sin(position.z*4.+uTime)*.16;
      vLocal=p;vec3 relative=uCamera-instanceMatrix[3].xyz;mat3 axes=mat3(instanceMatrix);
      float s2=max(.000001,dot(axes[0],axes[0]));vCamera=vec3(dot(relative,axes[0]),dot(relative,axes[1]),dot(relative,axes[2]))/s2;
      vEnergy=aEnergy;vCollapse=q;vSeed=aSeed;vVisibility=aVisibility;
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float uTime;uniform float uReveal;varying vec3 vLocal;varying vec3 vCamera;varying float vEnergy;varying float vCollapse;varying float vSeed;varying float vVisibility;
      float field(vec3 p){return .5+.5*sin(p.x*4.+sin(p.y*5.+uTime*.11+vSeed)*1.4+sin(p.z*4.-uTime*.08));}
      void main(){if(vVisibility*uReveal<.003)discard;vec3 direction=normalize(vLocal-vCamera);float radius=1.-.82*vCollapse;
      float travel=max(.0,-2.*dot(vLocal,direction));vec3 light=vec3(0.);float opacity=0.;
      for(int i=0;i<8;i++){vec3 p=vLocal+direction*(float(i)+.5)/8.*travel;float r=length(p)/radius;
        float n=field(p/radius+vSeed);float density=pow(n,3.)*(1.-smoothstep(.1,1.,r))*.22;
        vec3 nebula=mix(vec3(.13,.09,.30),vec3(.28,.32,.55),n);
        float core=exp(-r*r*34.);float star=pow(.5+.5*sin(p.x*93.+p.y*81.+p.z*67.+vSeed),70.)*.14;
        light+=(nebula*density+vec3(.92,.54,.26)*core*.16+vec3(.54,.60,.78)*star)*(1.-opacity);opacity+=density*(1.-opacity);}
      float rim=pow(1.-abs(dot(normalize(vLocal),-direction)),3.);
      vec3 color=light*(.32+vEnergy*1.4)+vec3(.24,.20,.43)*rim*(.2+vEnergy*.5);
      color=mix(color,vec3(.009,.006,.018)+vec3(.34,.16,.07)*rim,vCollapse);
      gl_FragColor=vec4(color,(.72+rim*.2)*uReveal*vVisibility);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
    });
    this.ensureCapacity(32);
    this.dummy=new THREE.Object3D();this.veins=[];
    // Reparameterize inherited root/stem curvature between universe anchors, not a new garden layout.
    for(let i=0;i<model.orbs.length;i++){
      const orb=model.orbs[i],center=model.centers[orb.cluster],source=lineage.roots[i%lineage.roots.length];
      const points=source.map((p,j)=>{const t=j/(source.length-1);return new THREE.Vector3(center[0]+(orb.base[0]-center[0])*t+p[0]*.2,center[1]+(orb.base[1]-center[1])*t+p[1]*.15,center[2]+(orb.base[2]-center[2])*t+p[2]*.1);});
      const material=new THREE.MeshBasicMaterial({color:0x5c4677,transparent:true,opacity:0,depthWrite:false});
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),28,.012,5,false),material);this.root.add(mesh);this.veins.push({mesh,orb});
      const arcPoints=Array.from({length:41},(_,j)=>{const a=j/40*Math.PI*1.6,stem=lineage.stems[i%lineage.stems.length],bend=stem[Math.floor(j/40*(stem.length-1))];return new THREE.Vector3(orb.base[0]+Math.cos(a)*(orb.radius+1.1)+bend[0]*.3,orb.base[1]+Math.sin(a)*(orb.radius+.55)+bend[1]*.2,orb.base[2]+Math.sin(a*1.3)*.6+bend[2]*.3);});
      const arc=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints),40,.008,4,false),material);this.root.add(arc);this.veins.push({mesh:arc,orb});
    }
    this.tear=new THREE.Group();this.tear.visible=false;this.root.add(this.tear);this.tearEdges=[];
    for(const side of [-1,1]){
      const points=Array.from({length:21},(_,i)=>new THREE.Vector3(side*(.07+Math.sin(i*2.1)*.055),i/20*5-2.5,Math.sin(i*1.7)*.12));
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),60,.055,6,false),new THREE.MeshBasicMaterial({color:0x8678b0,transparent:true,opacity:0}));this.tear.add(mesh);this.tearEdges.push({mesh,side});
      const outline=points.map(p=>new THREE.Vector2(p.x,p.y));
      for(let i=points.length-1;i>=0;i--)outline.push(new THREE.Vector2(points[i].x+side*(.18+Math.sin(i*.7)*.06),points[i].y));
      const lip=new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(outline),{depth:.24,bevelEnabled:true,bevelThickness:.035,bevelSize:.025,bevelSegments:1,steps:1}),new THREE.MeshBasicMaterial({color:0x302439,transparent:true,opacity:0,side:THREE.DoubleSide}));
      this.tear.add(lip);this.tearEdges.push({mesh:lip,side});
    }
  }
  openTear(position){this.tear.position.fromArray(position);this.tear.visible=true;this.tearTime=0;}
  ensureCapacity(count){
    if(this.capacity>=count)return;
    const capacity=Math.max(32,2**Math.ceil(Math.log2(count))),geometry=new THREE.SphereGeometry(1,36,24);
    for(const name of ["aEnergy","aCollapse","aSeed","aVisibility"])geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage));
    if(this.orbs){this.orbs.removeFromParent();this.orbs.geometry.dispose();this.orbs.dispose();}
    this.orbs=new THREE.InstancedMesh(geometry,this.material,capacity);this.orbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.orbs.frustumCulled=false;this.root.add(this.orbs);this.capacity=capacity;
  }
  update(dt,camera,reveal,prewarm=false){
    this.uniforms.uTime.value=this.model.time;this.uniforms.uReveal.value=reveal;this.uniforms.uCamera.value.copy(camera.position);
    camera.updateWorldMatrix(true,false);this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.frustum.planes.forEach((p,i)=>{const out=this.cullPlanes[i];out[0]=p.normal.x;out[1]=p.normal.y;out[2]=p.normal.z;out[3]=p.constant;});
    const visible=this.model.orbs.filter(orb=>!(orb.branching&&orb.split===1)&&orb.visibility>.001&&(prewarm||sphereVisible(this.cullPlanes,orb.follow.position,orb.radius*1.3)));
    this.drawnOrbs=visible.length;
    this.ensureCapacity(visible.length);this.orbs.count=visible.length;
    const attrs=this.orbs.geometry.attributes;
    for(let index=0;index<visible.length;index++){
      const orb=visible[index],scale=orb.radius*orb.birth*(1-orb.split);
      this.dummy.position.fromArray(orb.follow.position);this.dummy.quaternion.fromArray(orb.rotation);
      this.dummy.scale.setScalar(Math.max(.00001,scale));this.dummy.updateMatrix();this.orbs.setMatrixAt(index,this.dummy.matrix);
      attrs.aEnergy.setX(index,orb.energy);attrs.aCollapse.setX(index,orb.collapse);attrs.aSeed.setX(index,orb.id*7.71);attrs.aVisibility.setX(index,orb.visibility*orb.birth*(1-orb.split));
    }
    this.orbs.instanceMatrix.needsUpdate=true;for(const key of ["aEnergy","aCollapse","aSeed","aVisibility"])attrs[key].needsUpdate=true;
    for(const {mesh,orb} of this.veins){mesh.material.opacity=reveal*(.06+orb.energy*.27)*orb.visibility;mesh.visible=prewarm||mesh.material.opacity>.001;}
    if(this.tear.visible){this.tearTime+=dt;const p=Math.min(1,this.tearTime/CONFIG.multiverse.tearDuration),opening=Math.sin(Math.PI*Math.min(1,p*1.1));
      this.tearEdges.forEach(({mesh,side})=>{mesh.position.x=side*opening*2;mesh.material.opacity=(1-p)*.8;});if(p===1)this.tear.visible=false;}
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    const geometries=new Set(),materials=new Set();this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    this.orbs.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();this.root.clear();
    this.veins=[];this.tearEdges=[];this.orbs=this.material=this.tear=null;
  }
}
