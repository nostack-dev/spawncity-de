// SpawnCity Box3D flight pose -> exclusively native WebGL2 camera/airframe.
// Implements the CURRENT simulator's quad body axis (-X forward), its 4
// motor spacing, FPV rigid optical mount, follow/third stabilized camera.
// No THREE scene, no graphics fallback or secondary physics state.
import {fromTRS,multiply4,identity4} from "./native_render_math.mjs";
import {StabilizedExternalCameraRig,externalCameraFrame} from "./camera_stabilization.mjs";
export const NATIVE_AIRFRAME_PRESENTATION_VERSION="box3d-native-airframe-v2-225mm";
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const vec3=x=>Array.isArray(x)||ArrayBuffer.isView(x)?[Number(x[0]),Number(x[1]),Number(x[2])]:
  [Number(x?.x),Number(x?.y),Number(x?.z)];
const quat4=x=>Array.isArray(x)||ArrayBuffer.isView(x)?[Number(x[0]),Number(x[1]),Number(x[2]),Number(x[3])]:
  [Number(x?.x),Number(x?.y),Number(x?.z),Number(x?.w)];
const finite=v=>v.every(Number.isFinite);
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
const normalize=q=>{const n=Math.hypot(...q);if(!(n>1e-8)||!finite(q))throw Error("invalid Box3D quaternion");return q.map(x=>x/n);};
export function rotateByQuaternion(v,q){
 const [x,y,z,w]=normalize(q),[vx,vy,vz]=v;
 const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
 return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];
}
export function flightPresentationPose(state){
 const position=vec3(state?.position??(state?.x!==undefined?[state.x,state.y,state.z]:null));
 let quaternion;
 if(state?.quaternion!==undefined)quaternion=normalize(quat4(state.quaternion));
 else if(Array.isArray(state?.attitude)&&state.attitude.length===3){
  // Exact Box3D PhysicsModel eulerToQuat convention (degrees, XYZ).
  const [r,p,y]=state.attitude.map(v=>v*Math.PI/360);
  const cr=Math.cos(r),sr=Math.sin(r),cp=Math.cos(p),sp=Math.sin(p),cy=Math.cos(y),sy=Math.sin(y);
  quaternion=normalize([sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy,cr*cp*cy+sr*sp*sy]);
 }else throw Error("missing Box3D airframe quaternion/attitude");
 const velocity=vec3(state?.velocity??[state?.vx??0,state?.vy??0,state?.vz??0]);
 if(!finite(position)||!finite(velocity))throw Error("non-finite Box3D flight pose");
 return {position,quaternion,velocity};
}
function bodyGeometry(span){
 // Same 225 mm quad as the old peer model: carbon plate, colour canopy,
 // diagonal arms, motor bells, skids, red nose, FPV camera. Nose is -X.
 // Sizes come from that mesh; motor positions follow the live span.
 const k=span/.225;
 const p=[],n=[],c=[];
 const tri=(a,b,d,normal,color)=>{for(const v of[a,b,d]){p.push(...v);n.push(...normal);c.push(...color);}};
 const quad=(a,b,d,e,normal,color)=>{tri(a,b,d,normal,color);tri(a,d,e,normal,color);};
 const box=(center,half,color)=>{
  const [x,y,z]=center,[u,v,w]=half;
  const a=[x-u,y-v,z-w],b=[x+u,y-v,z-w],d=[x+u,y+v,z-w],e=[x-u,y+v,z-w];
  const A=[x-u,y-v,z+w],B=[x+u,y-v,z+w],D=[x+u,y+v,z+w],E=[x-u,y+v,z+w];
  quad(e,d,b,a,[0,0,-1],color);quad(A,B,D,E,[0,0,1],color);
  quad(a,b,B,A,[0,-1,0],color);quad(b,d,D,B,[1,0,0],color);
  quad(d,e,E,D,[0,1,0],color);quad(e,a,A,E,[-1,0,0],color);
 };
 const armBox=(cx,cy,z,len,yaw,hy,hz,color)=>{
  const cs=Math.cos(yaw),sn=Math.sin(yaw),hx=len/2;
  const corner=(sx,sy,sz)=>[cx+(sx*hx)*cs-(sy*hy)*sn,cy+(sx*hx)*sn+(sy*hy)*cs,z+sz*hz];
  const a=corner(-1,-1,-1),b=corner(1,-1,-1),d=corner(1,1,-1),e=corner(-1,1,-1);
  const A=corner(-1,-1,1),B=corner(1,-1,1),D=corner(1,1,1),E=corner(-1,1,1);
  const up=[0,0,1],side=[-sn,cs,0],fwd=[cs,sn,0];
  quad(e,d,b,a,up.map(v=>-v),color);quad(A,B,D,E,up,color);
  quad(a,b,B,A,side.map(v=>-v),color);quad(b,d,D,B,fwd,color);
  quad(d,e,E,D,side,color);quad(e,a,A,E,fwd.map(v=>-v),color);
 };
 const carbon=[.133,.153,.180],dark=[.078,.094,.114],accent=[.212,.902,1],nose=[1,.310,.396];
 box([0,0,0],[.055*k,.0375*k,.015*k],carbon);
 box([.005*k,0,.027*k],[.0425*k,.03*k,.013*k],accent);
 const arm=span/(2*Math.sqrt(2));
 for(const sx of[-1,1])for(const sy of[-1,1]){
  const x=sx*arm,y=sy*arm;
  armBox(x/2,y/2,0,Math.hypot(x,y),Math.atan2(y,x),.007*k,.004*k,carbon);
  box([x,y,.012*k],[.016*k,.016*k,.011*k],dark);
  box([x,y,.026*k],[.011*k,.011*k,.004*k],accent);
 }
 for(const y of[-.03,.03])box([0,y*k,-.03*k],[.06*k,.004*k,.004*k],dark);
 box([-.072*k,0,.004*k],[.02*k,.012*k,.012*k],nose);
 box([-.05*k,0,.022*k],[.014*k,.013*k,.011*k],dark);
 return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
function rotorGeometry(blades=2){
 // Unscaled length is the 0.11 m reference. The live 0.127 m prop is the instance scale.
 const p=[],n=[],c=[];
 for(let blade=0;blade<blades;blade++){
  const angle=blade*Math.PI/blades,cs=Math.cos(angle),sn=Math.sin(angle),l=.055,w=.005,z=.032;
  const corners=[[-l,-w],[l,-w],[l,w],[-l,w]].map(([x,y])=>[x*cs-y*sn,x*sn+y*cs,z]);
  for(const i of[0,1,2,0,2,3]){p.push(...corners[i]);n.push(0,0,1);c.push(.06,.07,.08);}
 }
 return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
export class NativeAirframePresentation{
 constructor(renderer,{span=.25,propD=.11}={}){
  if(!renderer?.upsert||!renderer?.updateInstances||!renderer?.setCamera)throw Error("native renderer required");
  if(!(span>.05&&span<4)||!(propD>.02&&propD<2))throw Error("invalid airframe dimensions");
  this.renderer=renderer;this.span=span;this.propD=propD;this.arm=span/(2*Math.sqrt(2));
  this.cameraRig=new StabilizedExternalCameraRig();
  this.mode="follow";this.phases=[0,0,0,0];this.initialized=false;
  renderer.upsert("flight/airframe",{...bodyGeometry(span),material:{color:[1,1,1,1],doubleSided:true}});
  renderer.upsert("flight/rotors",{...rotorGeometry(),instances:{transforms:new Float32Array([...identity4(),...identity4(),...identity4(),...identity4()])},
    material:{color:[.85,.91,1,1],doubleSided:true,castShadow:false}});
 }
 update(pose,{dt=1/60,mode=this.mode,fpvTiltDeg=0,fpvFovDeg=105,thirdDistanceM=2.48,
   motors=null,collisionResolve=null}={}){
  if(!["fpv","follow","third"].includes(mode))throw Error("unknown native drone camera mode");
  const {position,quaternion:q,velocity}=flightPresentationPose(pose);
  if(!this.initialized||this.mode!==mode){this.cameraRig.invalidate();this.mode=mode;this.initialized=true;}
  dt=clamp(Number(dt)||0,0,0.1);
  const model=fromTRS(position,q),fwd=rotateByQuaternion([-1,0,0],q),up=rotateByQuaternion([0,0,1],q);
  this.renderer.updateInstances("flight/airframe",{transforms:model});
  const spin=new Float32Array(4*16),tints=new Float32Array(16);
  let i=0;
  for(const sx of[-1,1])for(const sy of[-1,1]){
   const speed=Number(motors?.[i]??0);
   this.phases[i]+=dt*(Number.isFinite(speed)?Math.max(0,speed):0)*(i%2?-1:1);
   const phi=this.phases[i]*.5,local=fromTRS([sx*this.arm,sy*this.arm,0],
     [0,0,Math.sin(phi),Math.cos(phi)],[this.propD/.11,this.propD/.11,1]);
   spin.set(multiply4(model,local),i*16);
   tints.set(i<2?[.9,.95,1,1]:[1,.76,.58,1],i*4);i++;
  }
  this.renderer.updateInstances("flight/rotors",{transforms:spin,tints});
  let eye,target,cameraUp=[0,0,1],fov,near;
  if(mode==="fpv"){
   const tilt=clamp(fpvTiltDeg,-75,75)*Math.PI/180,cs=Math.cos(tilt),sn=Math.sin(tilt);
   const dir=fwd.map((v,i)=>v*cs+up[i]*sn),camUp=up.map((v,i)=>v*cs-fwd[i]*sn);
   eye=add(add(position,fwd,.102),up,.028);
   target=add(eye,dir,4);cameraUp=camUp;
   this.cameraRig.invalidate();fov=clamp(fpvFovDeg,35,140);near=.02;
  }else{
   const horizontal=[fwd[0],fwd[1],0],mag=Math.hypot(...horizontal),heading=mag>.2?
     horizontal.map(v=>v/mag):this.cameraRig.initialized?[...this.cameraRig.heading]:[-1,0,0];
   const rig=this.cameraRig.update({position,velocity,heading,mode,dt});
   const third=mode==="third",scale=thirdDistanceM/Math.hypot(2.25,1.05);
   // Keep the original real-physics stabilized anchor. A camera pressed
   // against the flat Box3D ground stared only at a single olive pixel
   // color, despite 21 GPU draw calls and green browser tests. Compose the
   // chase shot above the physical aircraft and include the horizon.
   const frame=externalCameraFrame(rig.anchor,rig.heading,third?
     {back:3.2*scale,up:1.40*scale,lookAhead:.55,lookUp:.35}:
     {back:2.65,up:1.36,lookAhead:.38,lookUp:.32});
   eye=frame.position;target=frame.target;
   fov=third?clamp(62*fpvFovDeg/105,35,100):clamp(52*fpvFovDeg/105,30,90);
   near=.06;
  }
  if(typeof collisionResolve==="function"){
    const corrected=collisionResolve([...position],[...eye]);
    if(corrected?.position?.length===3&&finite(corrected.position))eye=[...corrected.position];
  }
  this.renderer.setCamera({eye,target,up:cameraUp,fov:fov*Math.PI/180,near,far:1500});
  return {mode,eye,target,up:cameraUp,fov:fov*Math.PI/180,near,far:1500,position,quaternion:q,model};
 }
 dispose(){if(this.renderer){this.renderer.remove("flight/airframe");this.renderer.remove("flight/rotors");this.renderer=null;}}
}

// Share the exact airframe mesh with native multiplayer peer presentation.
export {bodyGeometry as nativeAirframeBodyGeometry,rotorGeometry as nativeAirframeRotorGeometry};
