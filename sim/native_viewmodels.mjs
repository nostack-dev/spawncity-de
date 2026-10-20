// Original hero viewmodels, baked from weapon_models.mjs, drawn in camera space.
// The live walk pose is right .245, down .225, forward .445. The native mesh
// origin is the grip, so the forward offset also clears the stock past the
// near plane. Scoped, the rifle is hidden, same as the live scope.
import {NATIVE_VIEWMODEL_MESHES} from "./native_viewmodel_meshes.mjs";

const ID="viewmodel/weapon";
const HOLD={
  smg:{right:.245,down:.225,forward:.62},
  glock:{right:.22,down:.20,forward:.58},
  sniper:{right:.16,down:.10,forward:.78},
  fists:{right:.08,down:.18,forward:.55},
  knife:{right:.18,down:.16,forward:.58},
  rocket:{right:.22,down:.18,forward:.70},
  grenade:{right:.20,down:.20,forward:.62}
};
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
function add(a,b,s=1){return [a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];}
export function syncNativeViewmodel(game){
  const renderer=game?.world?.renderer,cam=game?.world?.camera;
  const scoped=Boolean(globalThis.__arondightAds?.scoped)||document.body.classList.contains("scope-active");
  const onFoot=game?.mode==="foot"&&!globalThis.__arondightPlayerDamageModel?.dead&&cam?.eye&&cam?.target&&!scoped;
  if(!renderer||!onFoot){if(shown){renderer?.remove?.(ID);shown=null;}return;}
  const name=String(globalThis.__arondightFootWeapons?.mode||"smg");
  const key=NATIVE_VIEWMODEL_MESHES[name]?name:"smg";
  if(shown!==key){
    const geo=geometry(key);
    renderer.upsert(ID,{...geo,material:{color:[1,1,1,1],unlit:false,doubleSided:true,castShadow:false,frustumCulled:false,viewmodel:true}});
    shown=key;
  }
  const hold=HOLD[key]||HOLD.smg;
  globalThis.__nativeViewmodelHold=hold;
  const ads=Math.max(0,Math.min(1,Number(globalThis.__arondightAds?.t)||0));
  const shotAge=performance.now()-(Number(globalThis.__nativeLastShotAt)||-1e9);
  const recoil=shotAge>=0&&shotAge<90?Math.sin(shotAge/90*Math.PI):0;
  const eye=cam.eye,forward=unit([cam.target[0]-eye[0],cam.target[1]-eye[1],cam.target[2]-eye[2]]);
  const right=unit(cross(forward,cam.up||[0,0,1]));
  const lift=unit(cross(right,forward));
  const back=[-forward[0],-forward[1],-forward[2]];
  const rightM=hold.right*(1-ads*.85);
  const downM=hold.down*(1-ads*.7);
  const forwardM=hold.forward-recoil*.06+ads*.08;
  const pos=add(add(add(eye,right,rightM),lift,-downM),forward,forwardM);
  const transforms=new Float32Array([
    right[0],right[1],right[2],0,
    lift[0],lift[1],lift[2],0,
    back[0],back[1],back[2],0,
    pos[0],pos[1],pos[2],1
  ]);
  renderer.updateInstances(ID,{transforms,tints:new Float32Array([1,1,1,1])});
}
