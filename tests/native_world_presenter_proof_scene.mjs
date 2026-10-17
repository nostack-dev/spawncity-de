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
const population={people:()=>[{id:"npc1",x:-5,y:1,z:1.1,yaw:.7},{id:"npc2",x:1,y:12,z:1.3,yaw:1.2}]};
const world=new NativeWorldPresenter(canvas,{
 physics,population,heightAt:(x,y)=>Math.sin(x/14)*.32+Math.cos(y/20)*.48,
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
const gl=world.renderer.gl;
gl.finish();
const pixels=new Uint8Array(canvas.width*canvas.height*4);
gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
const glError=gl.getError();
let nonBlank=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>25||pixels[i+1]>25||pixels[i+2]>40)nonBlank++;
globalThis.__nativeWorldProof={
 renderer:"webgl2-only",sources:{box3d:2,buildings:16,terrain:world.terrain.stats.chunks,roads:world.roads.live.size,people:world.people?.update().visible},
 drawCalls:firstDraws,updatedDrawCalls:next.gpu.drawCalls,drawnTriangles:first.gpu.triangles,
 nonBlank,glError,hasThreeImport:false,
 context:String(gl.getParameter(gl.RENDERER))
};
world.dispose();

})().catch(error=>{globalThis.__nativeWorldProof={error:String(error?.stack||error)};});
