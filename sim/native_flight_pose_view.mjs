// Read-only native flight presentation from the EXISTING 1 kHz PhysicsModel.
// The simulator stores adjacent Box3D snapshots as plain numeric arrays;
// no Three vectors, second dynamics integration, or graphics side effects.
export const NATIVE_FLIGHT_POSE_VIEW_VERSION="box3d-1khz-native-pose-v1";
const vec=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function qNormalize(q){
 const l=Math.hypot(...q);
 if(!(l>1e-8))throw Error("invalid flight quaternion");
 return q.map(v=>v/l);
}
export function interpolateNativeQuaternion(before,after,alpha){
 if(!vec(before,4)||!vec(after,4)||!Number.isFinite(alpha))throw Error("invalid flight quaternion snapshots");
 const a=qNormalize(before),b=qNormalize(after);let dot=a.reduce((sum,v,i)=>sum+v*b[i],0);
 if(dot<0){dot=-dot;for(let i=0;i<4;i++)b[i]=-b[i];}
 dot=clamp(dot,-1,1);
 const t=clamp(alpha,0,1);
 if(dot>.9995)return qNormalize(a.map((v,i)=>v+(b[i]-v)*t));
 const theta=Math.acos(dot),denom=Math.sin(theta);
 const left=Math.sin((1-t)*theta)/denom,right=Math.sin(t*theta)/denom;
 return qNormalize(a.map((v,i)=>v*left+b[i]*right));
}
export function nativeFlightPoseView(model,{alpha=()=>1}={}){
 if(typeof alpha!=="function"||!model?.p
  ||!vec(model.renderPreviousPosition,3)||!vec(model.renderCurrentPosition,3)
  ||!vec(model.renderPreviousRotation,4)||!vec(model.renderCurrentRotation,4)
  ||!vec(model.renderPreviousVelocity,3)||!vec(model.renderCurrentVelocity,3)
  ||!vec(model.motorOmega,4))throw Error("native flight requires existing 1 kHz PhysicsModel snapshots");
 return Object.freeze({
  get p(){return model.p;},
  get motorOmega(){return model.motorOmega;},
  presentationPose(){
   const t=Number(alpha());
   if(!Number.isFinite(t))throw Error("invalid 1 kHz presentation interpolation");
   const fraction=clamp(t,0,1),lerp=(a,b)=>a.map((v,i)=>v+(b[i]-v)*fraction);
   return {
    position:lerp(model.renderPreviousPosition,model.renderCurrentPosition),
    quaternion:interpolateNativeQuaternion(model.renderPreviousRotation,model.renderCurrentRotation,fraction),
    velocity:lerp(model.renderPreviousVelocity,model.renderCurrentVelocity)
   };
  }
 });
}
