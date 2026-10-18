import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {NativeGameRuntime} from "../sim/native_game_runtime.mjs";

const [boxFile,flightFile]=process.argv.slice(2);
if(!boxFile||!flightFile)throw Error("usage: node tests/native_game_runtime_box3d_test.mjs <box3d.inline.mjs> <flight_core_node.mjs>");
const b3=await (await import(pathToFileURL(resolve(boxFile)).href)).default();
const factory=(await import(pathToFileURL(resolve(flightFile)).href)).default;
let frameClock=1000,disposed=false,drawn=0,osmFrames=0,impacts=0;
let nextFrame=null;
let captured=null;
const game=new NativeGameRuntime({id:"native-game"},{
 b3,flightCoreFactory:factory,clock:()=>frameClock+=.05,frameBudgetMs:25,
 requestFrame:fn=>(nextFrame=fn,1),
 cancelFrame:()=>nextFrame=null,
 presenterFactory:(canvas,options)=>{
  assert.equal(canvas.id,"native-game");
  assert.ok(options.worldPhysics?.records instanceof Map,"actual Box3D world not shared with GPU");
  assert.ok(typeof options.flight?.presentationPose==="function","actual flight snapshots not supplied");
  assert.ok(options.gameplayState?.mode==="drone");
  captured=options;
  return {
   camera:{eye:[0,0,10]},draw(now){
    const pose=options.flight.presentationPose();
    assert.ok(pose.position.every(Number.isFinite));
    assert.ok(options.worldPhysics.records.has("player-foot"));
    drawn++;
    return {renderer:"native-webgl2-only",drawCalls:8,time:now};
   },
   async updateOsmFeatures(s){osmFrames++;return {origin:s.origin,city:{built:0}};},
   emitEffect(e){impacts++;return 1;},
   dispose(){disposed=true;}
  };
 }
});
assert.equal(game.mode,"drone");
assert.equal(game.gameplayState.mode,"drone");
assert.deepEqual([...game.rigids.records.keys()].sort(),["player-car","player-foot","player-jet"]);
assert.ok(game.jetAirframe.spec.massKg>10000);
assert.ok(captured.worldPhysics===game.rigids);
assert.equal(game.setMode("foot"),"foot");
assert.equal(game.gameplayState.walk.mode,"foot");
assert.throws(()=>game.setMode("multiplayer"),/unavailable/);
game.setControls({foot:{forward:.6,strafe:0,yaw:0,pitch:.12}});
assert.equal(game.setMode("car"),"car");
game.setControls({car:{pedal:.6,steer:.2,handbrake:false}});
assert.equal(game.gameplayState.car.active,true);
assert.equal(game.setMode("jet"),"jet");
game.setControls({jet:{lift:.2,yawIn:.1,pitchIn:.2,rollIn:0,brake:0}});
assert.equal(game.gameplayState.jet.active,true);
game.setMode("drone");
await game.start();
assert.ok(nextFrame,"single native RAF loop must start");
assert.equal(game.running,true);
const all=new Set();
for(const mode of ["foot","car","jet","drone"]){
 game.setMode(mode);
 for(let step=0;step<16;step++){
  const progress=game.stepBudget(8,100);
  assert.ok(progress.ticks>=8,"genuine 1 kHz scheduler must preserve time");
 }
 const view=game.draw(frameClock);
 assert.equal(view.renderer,"native-webgl2-only");
 all.add(mode);
 const p=game.flight.position();
 assert.ok(p.every(Number.isFinite));
 assert.ok(game.rigids.pose("player-car")?.position.every(Number.isFinite));
 assert.ok(game.rigids.pose("player-jet")?.position.every(Number.isFinite));
}
assert.equal(all.size,4);
assert.ok(game.simulatedTicks>=512);
assert.ok(game.rigidSteps>=30,"60Hz rigid cars and jet must step alongside 1kHz flight");
const pose=game.flightView.presentationPose();
assert.ok(pose.position.every(Number.isFinite)&&pose.quaternion.every(Number.isFinite));
assert.equal(game.rigids.records.size,3,"never create duplicate actor bodies per mode switch");
assert.equal(game.worldPhysics,undefined,"there may be no shadow second Box3D game world");
const scenery={origin:{lon:9.17,lat:47.66},buildings:[],roads:[],center:[0,0]};
assert.equal((await game.updateOsmFeatures(scenery)).city.built,0);
assert.equal(osmFrames,1);
const lon=(x)=>9.17+x/(6378137*Math.PI/180*Math.cos(47.66*Math.PI/180));
const lat=(y)=>47.66+y/(6378137*Math.PI/180);
const city={...scenery,buildings:[{id:"building-with-real-physics",properties:{height:15},
 geometry:{type:"Polygon",coordinates:[[
 [lon(20),lat(0)],[lon(30),lat(0)],[lon(30),lat(12)],[lon(20),lat(12)],[lon(20),lat(0)]
 ]]}}]};
const loaded=await game.updateOsmFeatures(city);
assert.ok(loaded.collision.prismCount>=1,"no synthetic geometry: genuine OSM polygon needed");
assert.ok(game.flight.worldBuildingCollisionState?.shapeCount>=1,
 "real 1 kHz drone must collide with buildings visible in native WebGL2");
assert.ok(game.rigids.buildingState?.shapeCount>=1,
 "real 60 Hz car and jet must collide with the SAME buildings");
assert.equal(game.flight.worldBuildingCollisionSnapshot.hash,game.rigids.buildingSnapshot.hash);
const repeated=await game.updateOsmFeatures(city);
assert.equal(repeated.collision.flightChanged,false,"identical OSM scene cannot rebuild drone hulls");
assert.equal(repeated.collision.rigidChanged,false,"identical OSM scene cannot rebuild car hulls");
assert.equal(osmFrames,3);
const before=game.simulatedTicks;
game.stepBudget(3200,100);
assert.ok(game.discontinuityMs>=1200,"scheduler reports physical time missed beyond 2-second backlog");
assert.ok(game.simulatedTicks>before);
// Regression: 1kHz physics running behind MUST NOT stall the GPU/mouselook.
// Slow CPUs were previously allowed to skip every render while backlog >12ms.
game.backlogMs=200;game.frameBudgetMs=.01;
const framesBefore=drawn;
nextFrame(5000); // first draw, only initializes scheduler clock
const afterInitial=drawn;
assert.equal(afterInitial,framesBefore+1);
nextFrame(5016); // physics budget expires while backlog is still high
assert.ok(game.backlogMs>=12,"ensure test genuinely exercises physics catch-up");
assert.equal(drawn,afterInitial+1,"GPU must draw once per RAF even with pending physics");
assert.equal(game.stop(),true);
assert.equal(game.stop(),false);
await game.dispose();
assert.equal(disposed,true,"renderer WebGL resources must be disposed exactly once");
assert.equal(game.rigids.world,null,"Box3D world must be released");
assert.equal(game.flight.world,null,"1kHz flight Box3D world must be released");
assert.throws(()=>game.stepBudget(10),/disposed/);
assert.throws(()=>game.setMode("car"),/disposed/);
console.log(JSON.stringify({nativeGame:"one-1kHz-flightcore-one-60Hz-vehiclejet-world-one-webgl2",
 modes:[...all],frames:drawn,flightTicks:game.simulatedTicks,rigidSteps:game.rigidSteps,discontinuity:game.discontinuityMs}));
