// Original hero viewmodels, baked from weapon_models.mjs, drawn in camera space.
// The renderer clears depth before anything marked viewmodel, which is the
// native form of viewmodel_pass.mjs.
import {NATIVE_VIEWMODEL_MESHES} from "./native_viewmodel_meshes.mjs";

const ID="viewmodel/weapon";
const decoded=new Map();
let shown=null;
function bytes(b64){
  const bin=atob(b64),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return new Float32Array(out.buffer);
}
function geometry(name){
  const src=NATIVE_VIEWMODEL_MESHES[name]||NATIVE_VIEWMODEL_MESHES.smg;
  if(!decoded.has(src))decoded.set(src,{positions:bytes(src.positions),normals:bytes(src.normals),colors:bytes(src.colors)});
  return decoded.get(src);
}
function unit(v){const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
export function syncNativeViewmodel(game){
  const renderer=game?.world?.renderer,cam=game?.world?.camera;
  const onFoot=game?.mode==="foot"&&!globalThis.__arondightPlayerDamageModel?.dead&&cam?.eye&&cam?.target;
  if(!renderer||!onFoot){if(shown){renderer?.remove?.(ID);shown=null;}return;}
  const name=String(globalThis.__arondightFootWeapons?.mode||"smg");
  const key=NATIVE_VIEWMODEL_MESHES[name]?name:"smg";
  if(shown!==key){
    const geo=geometry(key);
    renderer.upsert(ID,{...geo,material:{color:[1,1,1,1],unlit:false,doubleSided:true,castShadow:false,frustumCulled:false,viewmodel:true}});
    shown=key;
  }
  const eye=cam.eye,forward=unit([cam.target[0]-eye[0],cam.target[1]-eye[1],cam.target[2]-eye[2]]);
  const right=unit(cross(forward,cam.up||[0,0,1]));
  const lift=unit(cross(right,forward));
  const back=[-forward[0],-forward[1],-forward[2]];
  const transforms=new Float32Array([
    right[0],right[1],right[2],0,
    lift[0],lift[1],lift[2],0,
    back[0],back[1],back[2],0,
    eye[0],eye[1],eye[2],1
  ]);
  renderer.updateInstances(ID,{transforms,tints:new Float32Array([1,1,1,1])});
}
