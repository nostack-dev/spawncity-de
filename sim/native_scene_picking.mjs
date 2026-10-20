// Native-only screen aiming and scene triangle picking (metres, Z-up).
// Operates on the same indexed/instanced Float32Array meshes the WebGL2
// renderer draws. No THREE.Raycaster, no second graphics backend.
// Intended for user-triggered hit tests, not every frame on all world meshes.
import {multiply4,perspective,lookAt} from "./native_render_math.mjs";
import {nativeBvhTriangles} from "./native_scene_bvh.mjs";
export const NATIVE_PICKING_VERSION="native-only-screen-ray-triangle-v1";
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=x=>{const l=Math.hypot(...x);if(!Number.isFinite(l)||l<1e-12)throw Error("invalid ray direction");return x.map(v=>v/l);};
function invert4(m){
 if(m?.length!==16)throw Error("inverse requires 4x4");
 const a=new Float64Array(32);
 for(let r=0;r<4;r++){for(let c=0;c<4;c++)a[r*8+c]=m[c*4+r];a[r*8+r+4]=1;}
 for(let k=0;k<4;k++){
  let pivot=k;
  for(let j=k+1;j<4;j++)if(Math.abs(a[j*8+k])>Math.abs(a[pivot*8+k]))pivot=j;
  if(Math.abs(a[pivot*8+k])<1e-14)throw Error("singular view projection");
  if(k!==pivot)for(let c=0;c<8;c++){const q=a[k*8+c];a[k*8+c]=a[pivot*8+c];a[pivot*8+c]=q;}
  const factor=a[k*8+k];for(let c=0;c<8;c++)a[k*8+c]/=factor;
  for(let j=0;j<4;j++)if(j!==k){const f=a[j*8+k];for(let c=0;c<8;c++)a[j*8+c]-=f*a[k*8+c];}
 }
 const output=new Float64Array(16);
 for(let r=0;r<4;r++)for(let c=0;c<4;c++)output[c*4+r]=a[r*8+c+4];
 return output;
}
function transformPoint(m,v,w=1){
 return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*w,
  m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*w,
  m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*w,
  m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*w];
}
export function screenRay(camera,screenX,screenY,width,height){
 if(!(width>0&&height>0)||!Number.isFinite(screenX)||!Number.isFinite(screenY))throw Error("invalid viewport coordinates");
 const {eye,target,up=[0,0,1],fov=Math.PI/3,near=.1,far=1500}=camera;
 const pv=multiply4(perspective(fov,width/height,near,far),lookAt(eye,target,up));
 const inv=invert4(pv),x=screenX/width*2-1,y=1-screenY/height*2;
 const a=transformPoint(inv,[x,y,-1]),b=transformPoint(inv,[x,y,1]);
 const start=a.slice(0,3).map(v=>v/a[3]),end=b.slice(0,3).map(v=>v/b[3]);
 const direction=norm(sub(end,start));
 return {origin:[...eye],direction,near,far};
}
function sphereIntersectsRay(origin,direction,bounds,limit){
 if(!bounds)return true;
 const v=sub(bounds.center,origin),t=dot(v,direction),d2=dot(v,v)-t*t,r2=bounds.radius*bounds.radius;
 return !(t+bounds.radius<0||t-bounds.radius>limit||d2>r2);
}
function triangleRay(origin,direction,a,b,c,maxDistance,doubleSided){
 const e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);
 if(doubleSided?Math.abs(det)<1e-9:det<=1e-9)return null;
 const inv=1/det,s=sub(origin,a),u=dot(s,p)*inv;
 if(u<0||u>1)return null;
 const q=cross(s,e1),v=dot(direction,q)*inv;
 if(v<0||u+v>1)return null;
 const distance=dot(e2,q)*inv;
 if(distance<0||distance>maxDistance)return null;
 const normal=norm(cross(e1,e2));
 return {distance,normal,barycentric:[1-u-v,u,v]};
}
function readVertex(values,index){return [values[index*3],values[index*3+1],values[index*3+2]];}
function worldVertex(local,m){const p=transformPoint(m,local);return [p[0],p[1],p[2]];}
function posedVertex(data,vertex){
 const local=readVertex(data.p,vertex),skin=data.skin;
 if(!skin)return local;
 const i=vertex*4,out=[0,0,0];
 for(let k=0;k<4;k++){
  const weight=skin.weights[i+k];if(weight===0)continue;
  const joint=skin.joints[i+k],offset=joint*16;
  const m=skin.bones.subarray(offset,offset+16);
  const p=transformPoint(m,local);
  for(let axis=0;axis<3;axis++)out[axis]+=p[axis]*weight;
 }
 return out;
}
export function pickNativeMeshes(meshes,ray,{maxDistance=1500,includeInvisible=false,ignoreId=null}={}){
 if(!ray||ray.origin?.length!==3||ray.direction?.length!==3||!(maxDistance>0))throw Error("invalid native pick ray");
 const direction=norm(ray.direction),origin=ray.origin;
 let nearest=null,trianglesExamined=0,boundsRejected=0,skippedSkinned=0;
 const nodes=meshes instanceof Map?meshes.values():meshes;
 for(const node of nodes){
  if(!node||(!includeInvisible&&node.visible===false)||node.id===ignoreId)continue;
  const d=node.data;
  if(!d?.p||!d?.transforms?.length)continue;
  // A skinned character's pose may exceed the undeformed mesh's bounds:
  // never cull it from the static bounding sphere. Pick its CURRENT bones.
  if(!d.skin&&!sphereIntersectsRay(origin,direction,node.worldBounds,maxDistance)){boundsRejected++;continue;}
  const indices=d.indices,faceCount=(indices?indices.length:d.p.length/3)/3,instanceCount=d.count??d.transforms.length/16;
  for(let instance=0;instance<instanceCount;instance++){
   const matrix=d.transforms.subarray(instance*16,instance*16+16);
   const candidates=node.bvh&&instance===0
     ?nativeBvhTriangles(node.bvh,origin,direction,nearest?.distance??maxDistance)
     :null;
   const limit=candidates?candidates.length:faceCount;
   for(let n=0;n<limit;n++){
    const f=candidates?candidates[n].face:n,ids=candidates?candidates[n].ids:null,k=f*3;
    const ia=ids?ids[0]:indices?indices[k]:k,ib=ids?ids[1]:indices?indices[k+1]:k+1,ic=ids?ids[2]:indices?indices[k+2]:k+2;
    const a=worldVertex(posedVertex(d,ia),matrix),b=worldVertex(posedVertex(d,ib),matrix),
     c=worldVertex(posedVertex(d,ic),matrix);
    trianglesExamined++;
    const found=triangleRay(origin,direction,a,b,c,nearest?.distance??maxDistance,node.material?.doubleSided!==false);
    if(found)nearest={id:node.id,instance,triangle:f,...found,point:origin.map((v,i)=>v+found.distance*direction[i])};
   }
  }
 }
 return {hit:nearest,trianglesExamined,boundsRejected,skippedSkinned};
}
