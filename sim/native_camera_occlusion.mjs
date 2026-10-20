// Never put a chase camera inside a real OSM building wall, even if its
// Box3D vehicle is safely outside. This solves the intermittent 2-color car
// screenshot where the original 5m trailing eye pierced the facade.
// Uses the exact immutable footprint/roof prisms shared by Box3D and WebGL2.
import {buildingLaunchPointClear} from "./world_building_collision_physics.mjs";
export const NATIVE_CAMERA_OCCLUSION_VERSION="native-real-osm-camera-occlusion-v1";
const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
export function unobstructedNativeChaseEye(eye,target,snapshot,{clearanceM=.35,samples=24}={}){
 if(!finite3(eye)||!finite3(target))throw Error("Native chase camera needs finite Box3D position");
 if(!Array.isArray(snapshot?.prisms)||snapshot.prisms.length===0)return [...eye];
 if(!(samples>=4&&samples<=100&&Number.isInteger(samples)))
  throw Error("Native camera ray steps invalid");
 const dx=eye[0]-target[0],dy=eye[1]-target[1],dz=eye[2]-target[2];
 const blocked=(p)=>{
  // Keep the camera clear of any OSM collision hull at its actual height.
  // Buildings below an airborne camera are not occluders.
  const subset=snapshot.prisms.filter(prism=>p[2]>=prism.base-.2&&p[2]<=prism.top+.35);
  return subset.length&&!buildingLaunchPointClear({prisms:subset},p.slice(0,2),{clearanceM});
 };
 let far=1;
 for(let i=1;i<=samples;i++){
  const t=i/samples,p=[target[0]+dx*t,target[1]+dy*t,target[2]+dz*t];
  if(blocked(p)){far=(i-1)/samples;break;}
 }
 if(far===1)return [...eye];
 // If a facade is immediately behind the vehicle, move above the roofline
 // of the CAR (not above any building). The local chassis stays in frame,
 // and this still uses one camera, one GPU, and exactly the Box3D pose.
 const planarDistance=Math.hypot(dx*far,dy*far);
 let next;
 if(planarDistance<2.1){
  const offset=Math.hypot(dx,dy);
  const horizontal=offset>1e-6?Math.min(1.15,offset)*.5/offset:0;
  next=[target[0]+dx*horizontal,target[1]+dy*horizontal,
   Math.max(target[2]+3.4,eye[2])];
 }else{
  const t=Math.max(.05,far-1/samples);
  next=[target[0]+dx*t,target[1]+dy*t,target[2]+dz*t];
 }
 // A car parked inside a footprint still has its chase eye inside that
 // volume. Climbing 3.4 m is not enough for an 8–18 m OSM roof.
 let z=next[2];
 for(let n=0;n<4;n++){
  const cover=snapshot.prisms.filter(prism=>z>=prism.base-.2&&z<=prism.top+.35
   &&!buildingLaunchPointClear({prisms:[prism]},next.slice(0,2),{clearanceM}));
  if(!cover.length)break;
  z=Math.max(...cover.map(prism=>Number(prism.top)||0))+1.8;
 }
 return [next[0],next[1],z];
}
