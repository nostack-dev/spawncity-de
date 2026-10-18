// Sole native WebGL2 stereoscopy: two camera perspectives, ONE GL context.
// Cross-eye arrangement renders the RIGHT eye into the LEFT half of the
// same native canvas. No Three import, GPU context duplication or monkeypatch.
export const STEREO_SBS_VERSION="native-cross-eye-one-webgl2-v3";
export const STEREO_SETTINGS_KEY="spawnCityStereoSbsV1";
export const STEREO_SETTINGS_EVENT="spawncity-stereo-sbs-change";
export const STEREO_EYE_SEPARATION_M=.064;
let active=false,installedOn=null;
const number=(x,d)=>Number.isFinite(x)?x:d;
const normalized=x=>{const n=Math.hypot(...x);if(!(n>1e-8))throw Error("degenerate stereo camera");return x.map(v=>v/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function loadStereoSetting(){
 try{return typeof location!=="undefined"&&/[?&]sbs=1\b/.test(location.search)
   ||typeof localStorage!=="undefined"&&localStorage.getItem(STEREO_SETTINGS_KEY)==="1";}catch{return false;}
}
function syncDom(){
 if(typeof document==="undefined")return;
 let div=document.getElementById("stereoSbsDivider");
 if(active&&!div){div=document.createElement("div");div.id="stereoSbsDivider";div.setAttribute("aria-hidden","true");
  div.style.cssText="position:fixed;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:#000;z-index:5;pointer-events:none";
  document.body.appendChild(div);}
 if(div)div.style.display=active?"block":"none";
 const v=document.getElementById("viewport");if(v)v.dataset.stereoSbs=active?"cross-eye":"off";
}
export function setStereoEnabled(value){
 active=Boolean(value);
 try{if(typeof localStorage!=="undefined")localStorage.setItem(STEREO_SETTINGS_KEY,active?"1":"0");}catch{}
 syncDom();
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(STEREO_SETTINGS_EVENT,{detail:{enabled:active}}));
 return active;
}
export function nativeStereoRig(camera,{mode="drone"}={}){
 const focus=mode==="jet"?40:mode==="car"?8:mode==="foot"?4:6;
 const e=mode==="foot"?STEREO_EYE_SEPARATION_M:Math.max(STEREO_EYE_SEPARATION_M,Math.min(2,.013*focus*2*Math.tan(number(camera.fov,70*Math.PI/180)/2)));
 return {focus,eyeSep:e};
}
export function nativeStereoCameras(camera,opts={}){
 if(!camera?.eye||!camera?.target||camera.eye.length!==3||camera.target.length!==3)throw Error("native stereo requires live 3D camera");
 const forward=normalized(camera.target.map((x,i)=>x-camera.eye[i]));
 // A vertical camera must still have a valid stereo eye basis.
 const lateral=cross(forward,camera.up||[0,0,1]);
 const right=normalized(Math.hypot(...lateral)<1e-7?cross(forward,[0,1,0]):lateral);
 const {focus,eyeSep}=nativeStereoRig(camera,opts);
 const convergence=camera.eye.map((x,i)=>x+forward[i]*focus);
 const eye=(sign)=>camera.eye.map((x,i)=>x+right[i]*sign*eyeSep/2);
 const left=eye(-1),righteye=eye(1);
 return {left:{...camera,eye:left,target:convergence},right:{...camera,eye:righteye,target:convergence},eyeSep,focus};
}
export function installStereo(renderer){
 if(!renderer?.gl||!renderer?.setCamera||!renderer?.render)
  throw Error("stereo requires the sole native WebGL2 renderer");
 installedOn=renderer;syncDom();return renderer;
}
export function renderNativeStereo(renderer,camera,{mode="drone"}={}){
 if(!renderer||renderer!==installedOn)installStereo(renderer);
 if(!active)return renderer.render();
 const W=renderer.width,H=renderer.height,leftWidth=Math.floor(W/2),rightWidth=W-leftWidth;
 if(leftWidth<1||H<1)throw Error("native stereo needs a nonzero viewport");
 const cameras=nativeStereoCameras(camera,{mode});
 // Eye 1 is right eye on LEFT for cross-eyed viewing. The second pass may
 // reuse the first pass' shadow map, but clear only its own scissored half.
 let first,second;
 try{
  renderer.setCamera(cameras.right);
  first=renderer.render({viewport:{x:0,y:0,width:leftWidth,height:H}});
  renderer.setCamera(cameras.left);
  second=renderer.render({viewport:{x:leftWidth,y:0,width:rightWidth,height:H}});
 }finally{renderer.setCamera(camera);}
 return {...second,drawCalls:(first?.drawCalls||0)+(second?.drawCalls||0),
  triangles:(first?.triangles||0)+(second?.triangles||0),stereo:true,
  stereoEyeSeparationM:cameras.eyeSep};
}
active=loadStereoSetting();
globalThis.__stereoSBS={
 get active(){return active;},set active(v){setStereoEnabled(v);},
 install:installStereo,version:STEREO_SBS_VERSION
};
