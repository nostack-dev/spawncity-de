// Production camera_collision_guard.mjs + real_world_bootstrap applyLookCamera
// on the native presenter camera: the camera never ends up inside a wall or
// under the ground. The path from the player (foot: chest, car: roof anchor
// +0.78 m, drone: the airframe) to the eye is swept through the same Box3D
// building / terrain world (resolveBox3dCameraPath, clearance 8 cm); the eye
// stops in front of the first wall, at least 12 cm above the ground (drone
// chase 15 cm). A car chase camera pushed closer than 3.2 m by a wall rises
// over the roof and looks down at the car, like production. The jet and the
// parachute camera are free in the sky (production skips them too).
export const NATIVE_CAMERA_GUARD_VERSION="native-camera-collision-guard-v1";
let game=null,lastTelemetry=-Infinity;
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
function anchorFor(mode){
  const rig=game?.rigids;
  if(mode==="car"){const p=rig?.pose?.("player-car")?.position;return p?[p[0],p[1],Math.max(ground(p[0],p[1])+.45,p[2]+.78)]:null;}
  if(mode==="foot"){const p=rig?.pose?.("player-foot")?.position;if(!p)return null;const g=ground(p[0],p[1]);return [p[0],p[1],Math.max(g+.34,p[2]+.71-.38)];}
  if(mode==="drone"){const p=game?.flight?.position?.();if(!p)return null;const fpv=game?.world?.flightCameraMode==="fpv";return [p[0],p[1],p[2]+(fpv?0:.10)];}
  return null;
}
export function guardNativeCamera(camera,mode){
  if(!camera?.eye||!camera?.target||mode==="jet"||globalThis.__nativeCameraOverrideActive)return camera;
  // inside a walkable building the chest-to-eye path starts inside its Box3D prism
  if(mode==="foot"&&globalThis.__buildingInteriors?.engaged)return camera;
  const a=anchorFor(mode);if(!a)return camera;
  let eye=camera.eye.slice(),target=camera.target.slice(),up=camera.up,collided=false;
  try{
    const r=game.flight?.resolveCameraPath?.(a,eye);
    const p=r?.position;
    if(r?.collided&&Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)){
      // keep the view direction: move the target with the eye
      for(let i=0;i<3;i++){target[i]+=p[i]-eye[i];}eye=p.slice();collided=true;
    }
  }catch{}
  const floor=ground(eye[0],eye[1])+(mode==="drone"&&game?.world?.flightCameraMode!=="fpv"?.15:.12);
  if(eye[2]<floor){target[2]+=floor-eye[2];eye[2]=floor;collided=true;}
  if(collided&&mode==="car"&&game?.gameplayState?.carCameraMode!=="cockpit"){
    const h=Math.hypot(eye[0]-a[0],eye[1]-a[1]),MIN_H=3.2;
    if(h<MIN_H){const lift=a[2]+1.25+(MIN_H-h)*.75;if(eye[2]<lift)eye[2]=lift;target=[a[0],a[1],a[2]+.15];up=[0,0,1];}
  }
  const now=performance.now();
  if(now-lastTelemetry>=250){lastTelemetry=now;const v=document.getElementById("viewport");if(v){v.dataset.playerCameraCollisionGuard="box3d-ray+terrain-relative-floor-v4";v.dataset.playerCameraCollision=collided?"blocked":"clear";v.dataset.playerCameraFloorM=floor.toFixed(2);}}
  if(!collided)return camera;
  return {...camera,eye,target,up,near:mode==="foot"?Math.max(.045,Math.min(.08,Number(camera.near)||.06)):camera.near};
}
export function installNativeCameraGuard(runtime){game=runtime;globalThis.__nativeCameraGuard=guardNativeCamera;}
