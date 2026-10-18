// World-space camera sensing used by audio, markers and gameplay overlays.
// Both the existing presented camera and the sole native renderer expose
// matrices/poses, but none of these consumers needs THREE.Vector3.
import {lookAt,perspective} from "./native_render_math.mjs";
export const WORLD_CAMERA_PROJECTION_VERSION="renderer-independent-world-camera-v1";
const finite3=v=>v?.length===3&&Array.from(v).every(Number.isFinite);
const xyz=v=>Array.isArray(v)||ArrayBuffer.isView(v)?Array.from(v).slice(0,3):
 [Number(v?.x),Number(v?.y),Number(v?.z)];
const vec4=(m,v)=>[
 m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
 m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
 m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
 m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]
];
const normalize=v=>{
 const n=Math.hypot(...v);
 return n>1e-10?v.map(x=>x/n):null;
};
export function worldCameraPose(camera){
 if(!camera)return null;
 if(finite3(camera.eye)&&finite3(camera.target)){
  const eye=Array.from(camera.eye),direction=normalize(camera.target.map((v,i)=>v-eye[i]));
  return direction?{position:eye,direction}:null;
 }
 // The existing Three camera owns the same world transform. Read its matrix
 // numerically instead of importing another THREE namespace into the HUD/audio.
 camera.updateWorldMatrix?.(true,false);
 const position=xyz(camera.position),m=camera.matrixWorld?.elements;
 if(!finite3(position)||m?.length!==16)return null;
 const direction=normalize([-m[8],-m[9],-m[10]]);
 return direction?{position,direction}:null;
}
export function projectWorldPoint(point,camera){
 const p=xyz(point);
 if(!finite3(p)||!camera)return null;
 let view,projection;
 if(finite3(camera.eye)&&finite3(camera.target)){
  const aspect=Number(camera.aspect)||Number(camera.width)/Number(camera.height)||16/9;
  try{
   view=lookAt(camera.eye,camera.target,camera.up??[0,0,1]);
   projection=perspective(camera.fov,aspect,camera.near,camera.far);
  }catch{return null;}
 }else{
  camera.updateWorldMatrix?.(true,false);
  view=camera.matrixWorldInverse?.elements;
  projection=camera.projectionMatrix?.elements;
 }
 if(view?.length!==16||projection?.length!==16)return null;
 const clip=vec4(projection,vec4(view,[...p,1]));
 if(!Number.isFinite(clip[3])||clip[3]<=1e-9)return null;
 const ndc=clip.slice(0,3).map(v=>v/clip[3]);
 if(!finite3(ndc))return null;
 return {x:ndc[0],y:ndc[1],z:ndc[2],inFront:ndc[2]>=-1&&ndc[2]<=1};
}
