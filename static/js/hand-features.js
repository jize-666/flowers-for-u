import { classifyHand } from "./hand-gesture.js";
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const sub=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z];
const norm=v=>{const n=Math.hypot(...v);return n>1e-8?v.map(x=>x/n):null;};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function quaternion(x,y,z){
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2],trace=m00+m11+m22;
  let q;
  if(trace>0){const s=Math.sqrt(trace+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else{const s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  return norm(q);
}
export function handFeatures(points,id){
  if(!Array.isArray(points)||points.length!==21||points.some(p=>!p||![p.x,p.y,p.z].every(Number.isFinite)))return null;
  const palm=distance(points[0],points[9]),width=distance(points[5],points[17]);
  if(palm<.0001||width<.0001)return null;
  const mirrored=points.map(p=>({x:-p.x,y:-p.y,z:p.z}));
  const x=norm(sub(mirrored[5],mirrored[17])),up=norm(sub(mirrored[9],mirrored[0]));
  if(!x||!up)return null;
  const z=norm(cross(x,up));if(!z)return null;
  const y=norm(cross(z,x)),rotation=quaternion(x,y,z);
  if(!rotation)return null;
  const indices=[0,5,9,13,17];
  const position={x:1-indices.reduce((n,i)=>n+points[i].x,0)/5,y:1-indices.reduce((n,i)=>n+points[i].y,0)/5};
  return {id,position,width,palm,pinch:distance(points[4],points[8])/palm,pose:classifyHand(points),rotation};
}
