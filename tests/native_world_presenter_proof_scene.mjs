import {NativeWorldPresenter} from "../sim/native_world_presenter.mjs";
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
const world=new NativeWorldPresenter(canvas,{
 physics,population,flight:playerFlight,heightAt:(x,y)=>Math.sin(x/14)*.32+Math.cos(y/20)*.48,
 rendererOptions:{width:960,height:540},
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
const gl=world.renderer.gl;
gl.finish();
const pixels=new Uint8Array(canvas.width*canvas.height*4);
gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
const glError=gl.getError();
let nonBlank=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>25||pixels[i+1]>25||pixels[i+2]>40)nonBlank++;
globalThis.__nativeWorldProof={
 renderer:"webgl2-only",sources:{box3d:2,flight:1,buildings:16,terrain:world.terrain.stats.chunks,roads:world.roads.live.size,people:world.people?.update().visible},
 drawCalls:firstDraws,updatedDrawCalls:next.gpu.drawCalls,drawnTriangles:first.gpu.triangles,
 nonBlank,glError,hasThreeImport:false,
 context:String(gl.getParameter(gl.RENDERER))
};
world.dispose();

})().catch(error=>{globalThis.__nativeWorldProof={error:String(error?.stack||error)};});
