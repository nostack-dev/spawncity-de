import {NativeWorldPresenter} from "../sim/native_world_presenter.mjs";
import {VsPoseTimeline} from "../sim/vs_pose_sync.mjs";
(async()=>{
const canvas=document.getElementById("native-world");
const p=new Map([
 ["taxi", {position:[8,-4,1],rotation:[0,0,0,1],wheels:[]}],
 ["police-drone", {position:[-7,-6,7],rotation:[0,0,0,1],wheels:null}]
]);
const bodies=[
 {id:"taxi",kind:"car",halfExtents:[2,.85,.6]},
 {id:"police-drone",kind:"drone",halfExtents:[.8,.8,.22],drone:true}
];
const physics={bodies:()=>bodies,renderPose:id=>p.get(id)};
const playerFlight={p:{span:.25,propD:.11},motorOmega:[140,142,138,140],
 presentationPose:()=>({position:{x:0,y:-20,z:10},
 quaternion:{x:0,y:0,z:0,w:1},velocity:{x:0,y:0,z:0}})};

const population={people:()=>[{id:"npc1",x:-5,y:1,z:1.1,yaw:.7},{id:"npc2",x:1,y:12,z:1.3,yaw:1.2}]};
const timeline=new VsPoseTimeline({delayMs:0});
const peerNow=performance.now();
timeline.push({p:[5,2,8],q:[0,0,0,1],v:[0,0,0],t:peerNow},peerNow);
const world=new NativeWorldPresenter(canvas,{
 physics,population,flight:playerFlight,peer:{timeline,connected:()=>true,mode:()=>"drone"},heightAt:(x,y)=>Math.sin(x/14)*.32+Math.cos(y/20)*.48,
 rendererOptions:{width:960,height:540,shadows:{resolution:256,extent:130}},
 terrainOptions:{radius:100,maxTiles:4,cells:16,step:5,listenPhysics:false,uploadsPerFrame:2},
 cityOptions:{buildingsPerStep:2,chunkSize:100}
});
world.setCamera({eye:[33,-75,40],target:[0,0,3],fov:1,near:.1,far:700});
const ring=(x,y)=>[[x,y],[x+8,y],[x+8,y+8],[x,y+8]];
const buildings=[];
for(let i=0;i<16;i++)buildings.push({key:"building-"+i,center:[-34+(i%4)*19,10+Math.floor(i/4)*19],
 outer:ring(-34+(i%4)*19,10+Math.floor(i/4)*19),holes:[],base:0,top:8+i%5*3});
await world.updateCityFootprints(buildings,{yieldFrame:()=>Promise.resolve()});
const streets=[
 {properties:{class:"primary"},geometry:{type:"LineString",coordinates:[[-55,1],[65,1]]}},
 {properties:{class:"secondary"},geometry:{type:"LineString",coordinates:[[2,-55],[2,95]]}}
];
await world.updateRoadFeatures(streets,{center:[0,0],revision:"native-roads",yieldFrame:()=>Promise.resolve()});
world.draw(performance.now());
await world.terrainPromise;
const first=world.draw(performance.now()+300);
const firstDraws=first.gpu.drawCalls;
const stableSun=world.draw(performance.now()+325);
if(!stableSun.gpu.shadowReused)
 throw Error("rotor animation or unchanged crowds incorrectly invalidated expensive sunlight depth pass");
if(!world.renderer.meshes.has("vs/airframe")||!world.renderer.meshes.has("vs/rotors"))
 throw Error("existing VsPoseTimeline did not reach sole native multiplayer GPU meshes");
p.get("taxi").position[0]=15;
const next=world.draw(performance.now()+350);
if(!world.renderer.meshes.has("box3d/car")||world.renderer.meshes.get("box3d/car").data.transforms[12]!==15)
 throw Error("Box3D pose update did not reach native GPU instance buffer");
// Validate the REAL flight presentationPose API in the sole WebGL2 world:
// FPV rigid optical mount and third-person camera use one native renderer.
world.setFlightCameraMode("fpv",{fpvFovDeg:105,fpvTiltDeg:0});
const fpv=world.draw(performance.now()+400);
if(!world.renderer.meshes.has("flight/airframe")||!world.renderer.meshes.has("flight/rotors"))
 throw Error("Box3D flight pose did not create native drone/rotor GPU geometry");
const fpvEye=world.renderer.eye;
if(Math.abs(world.renderer.fov-105*Math.PI/180)>1e-6||Math.abs(world.renderer.near-.02)>1e-7)throw Error("Native FPV lens silently overwritten by world presenter");
if(Math.abs(fpvEye[0]+.102)>1e-5||Math.abs(fpvEye[1]+20)>1e-5||Math.abs(fpvEye[2]-10.028)>1e-5)
 throw Error("Native FPV optical mount drifted from simulator contract: "+fpvEye);
world.setFlightCameraMode("third",{thirdDistanceM:2.48});
const third=world.draw(performance.now()+410);
if(Math.abs(world.renderer.fov-62*Math.PI/180)>1e-6||Math.abs(world.renderer.near-.06)>1e-7)throw Error("Native third camera FOV/near silently overwritten");
if(!(world.renderer.eye[0]>1.8&&world.renderer.eye[2]>10.7))
 throw Error("Native third camera did not follow Box3D airframe");
world.setCamera({eye:[33,-75,40],target:[0,0,3],fov:1,near:.1,far:700});
world.draw(performance.now()+420);
// Full-screen PWA drawing MUST preserve physical pixel density. CSS touch
// positions must map into the same raster used by the camera ray projection.
const originalDpr=Object.getOwnPropertyDescriptor(globalThis,"devicePixelRatio");
Object.defineProperty(globalThis,"devicePixelRatio",{configurable:true,value:2});
const hidpi=world.draw(performance.now()+430);
if(hidpi.drawingWidth!==1920||hidpi.drawingHeight!==1080||hidpi.drawingDpr!==2)
 throw Error("native HiDPI PWA was rendered at an artificially reduced resolution");
const cssCenter=world.pick(480,270),gpuCenter=world.renderer.pick(960,540);
if(cssCenter.hit?.id!==gpuCenter.hit?.id||Math.abs((cssCenter.hit?.distance||0)-(gpuCenter.hit?.distance||0))>1e-5)
 throw Error("touch target differs from actual GPU center ray at DPR=2");
if(originalDpr)Object.defineProperty(globalThis,"devicePixelRatio",originalDpr);
else delete globalThis.devicePixelRatio;
const normalDpr=world.draw(performance.now()+431);
if(normalDpr.drawingWidth!==960||normalDpr.drawingHeight!==540)
 throw Error("native renderer failed to restore normal PWA backbuffer resolution");
const gl=world.renderer.gl;
gl.finish();
const pixels=new Uint8Array(canvas.width*canvas.height*4);
gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
const glError=gl.getError();
// A lost phone GPU context is NOT a reason to switch back to Three or
// permanently stop rendering: the same native WebGL2 presenter must resume.
const contextExtension=gl.getExtension("WEBGL_lose_context");
let contextRestored=false;
if(contextExtension){
 const eventWithin=(name)=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error("Timed out: "+name+"; lost="+gl.isContextLost())),12000);
   canvas.addEventListener(name,()=>{clearTimeout(timeout);resolve();},{once:true});
 });
 const lost=eventWithin("webglcontextlost");contextExtension.loseContext();await lost;
 const paused=world.draw(performance.now()+435);
 if(!paused.paused||paused.renderer!=="native-webgl2-only")throw Error("Native GPU context loss must pause without fallback or halt");
 // Chromium/ANGLE may defer manual restoration until after a GPU service turn.
 await new Promise(resolve=>setTimeout(resolve,250));
 const restored=eventWithin("webglcontextrestored");contextExtension.restoreContext();await restored;
 const resumed=world.draw(performance.now()+455);
 if(resumed.paused||resumed.gpu?.drawCalls<5)throw Error("Native GPU scene failed to recover its VAOs after context restore");
 contextRestored=true;
}
let nonBlank=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>25||pixels[i+1]>25||pixels[i+2]>40)nonBlank++;
globalThis.__nativeWorldProof={
 renderer:"webgl2-only",sources:{box3d:2,flight:1,buildings:16,terrain:world.terrain.stats.chunks,roads:world.roads.live.size,people:world.people?.update().visible,peer:world.peer?.live?1:0},
 drawCalls:firstDraws,shadowDrawCalls:first.gpu.shadowDrawCalls,updatedDrawCalls:next.gpu.drawCalls,drawnTriangles:first.gpu.triangles,
 nonBlank,glError,contextLossExtension:Boolean(contextExtension),contextRestored,shadowRestored:Boolean(world.renderer.shadow?.depth),hasThreeImport:false,
 hiDpiVerified:true,touchPickingVerified:true,
 context:String(gl.getParameter(gl.RENDERER))
};
world.dispose();

})().catch(error=>{globalThis.__nativeWorldProof={error:String(error?.stack||error)};});
