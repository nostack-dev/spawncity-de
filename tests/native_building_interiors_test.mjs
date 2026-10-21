// Native walkable buildings: production layout rules, 2-D wall collision,
// walkable surfaces, barricade planks and the Box3D foot hand-over, with a
// stub renderer / rigid world (no GPU, no WASM).
import assert from "node:assert/strict";
import {installNativeBuildingInteriors,tickNativeBuildingInteriors,buildInterior,facadeParams,__test} from "../sim/native_building_interiors.mjs";

const meshes=new Map(),visible=new Map();let cuts=null;
const renderer={meshes,
  upsert(id,input){const n=input.positions.length/3;assert.ok(n>0&&n%3===0,id+" triangles");assert.equal(input.normals.length,n*3);assert.equal(input.colors.length,n*3);
    if(input.uvs)assert.equal(input.uvs.length,n*2,id+" uvs");if(input.facade)assert.equal(input.facade.length,n*4,id+" facade");
    for(const v of input.positions)assert.ok(Number.isFinite(v),id+" finite");meshes.set(id,input);},
  updateInstances(id,inst){meshes.get(id).instances=inst;},remove(id){meshes.delete(id);},
  setVisible(id,v){visible.set(id,v);},setFacadeCutouts(list){cuts=list;}};
const pose={position:[0,0,.97],velocity:[0,0,0]};
let gravity=1;const body={};
const b3={b3Shape_GetFilter:()=>({categoryBits:2n,maskBits:15n,groupIndex:0}),b3Shape_SetFilter(sh,f){sh.filter=f;},
  b3Body_SetLinearVelocity(b,v){pose.velocity=[...v];},b3Body_SetAngularVelocity(){},b3Body_SetAwake(){}};
const shape={};
const rigids={b3,records:new Map([["player-foot",{body,shape,extraShapes:[],gravityScale:1}]]),
  pose:id=>id==="player-foot"?{position:[...pose.position],velocity:[...pose.velocity]}:null,
  setPose(id,{position}){pose.position=[...position];return true;},clearTarget(){},setGravityScale(id,g){gravity=g;return true;}};
const lights=[];
const game={mode:"foot",rigids,world:{renderer,terrain:{heightAt:()=>0},requestLight:(p,o)=>lights.push([p,o])}};
installNativeBuildingInteriors(game);
const api=globalThis.__buildingInteriors;
assert.equal(api.PLANKS,6);

// a 24 m x 14 m, 15 m tall block (4 storeys + roof) and a small 2-storey house
const block={key:"way/1:test",outer:[[0,0],[24,0],[24,14],[0,14]],holes:[],base:0,top:15,center:[12,7]};
const house={key:"way/2:test",outer:[[60,0],[68,0],[68,7],[60,7]],holes:[],base:0,top:7,center:[64,3.5]};
__test.setFootprints([block,house]);

const b=buildInterior(block);
assert.ok(b,"block builds");
const {floorH}=facadeParams(block.key);
assert.equal(b.levels[0],.03);
assert.equal(b.levels[1],4);
for(let k=2;k<b.levels.length;k++)assert.ok(Math.abs(b.levels[k]-b.levels[k-1]-floorH)<1e-9,"storeys follow facade floorH");
assert.ok(b.core,"stair core found");assert.ok(b.roofAccess,"roof reachable");
assert.equal(b.stairs.length,b.levels.length,"one flight per storey + the roof flight");
assert.equal(b.doors.length,2,"area > 260 m² gets a second door on the opposite side");
assert.ok(b.props.length>10,"furnished");
assert.equal(buildInterior({...block,base:3}),null,"raised parts (base > .6) are not enterable");

// stand 3 m in front of the first door: the module activates the block
const d0=b.doors[0];
pose.position=[d0.cx+d0.nx*3,d0.cy+d0.ny*3,.97];
tickNativeBuildingInteriors(1000);
assert.equal(api.active?.key,block.key);
assert.ok([...meshes.keys()].some(k=>k.startsWith("interiors/L0/lit")),"ground storey shell");
assert.ok(meshes.has("interiors/glass"),"window glass from inside");
assert.ok(meshes.get("interiors/L0/lit").facade.some(v=>v>0),"interior walls carry the facade record");
assert.equal(cuts.length,3,"two doorways + roof hatch cut into the exterior");
assert.ok(meshes.has("interiors/door-frames"),"closed doors drawn");

// planks
const doors=api.doors();assert.equal(doors.length,2);assert.equal(doors[0].planks,6);
assert.ok(api.damagePlank(0));assert.equal(api.doors()[0].planks,5);
assert.ok(api.repairPlank(0));assert.ok(!api.repairPlank(0),"never more than PLANKS");

// walking: far from the doors the module does not interfere
assert.equal(api.resolveMove({x:12,y:-10},{x:12,y:-9.9},0),null);
// walk straight in through the door with the native foot hand-over
const walkTo=(tx,ty,steps=400,speed=1.4)=>{let n=0;for(;n<steps;n++){const p=pose.position,dx=tx-p[0],dy=ty-p[1],l=Math.hypot(dx,dy);if(l<.1)break;
  const v=[dx/l*speed,dy/l*speed],took=api.footStep(game,{position:[...p]},v,1/60);if(!took){pose.position=[p[0]+v[0]/60,p[1]+v[1]/60,.97];continue;}
  pose.position=[p[0]+pose.velocity[0]/60,p[1]+pose.velocity[1]/60,p[2]+pose.velocity[2]/60];}return n;};
const inside=[d0.cx-d0.nx*3,d0.cy-d0.ny*3];
walkTo(inside[0],inside[1]);
assert.ok(Math.hypot(pose.position[0]-inside[0],pose.position[1]-inside[1])<.2,"walked through the door");
assert.ok(api.playerInside(),"inside");assert.ok(api.engaged,"physics handed over");
assert.equal(gravity,0);assert.equal(shape.filter.maskBits&1n,0n,"no static-world contacts inside");
assert.ok(Math.abs(pose.position[2]-.97-b.levels[0])<.01,"feet on the lobby floor");
// walls hold: walking into the inner wall far from any door stops at R_PLAYER
const startX=pose.position[0];
const wallTarget=d0.ny>.5||d0.ny<-.5?[pose.position[0],d0.cy-d0.ny*30]:[d0.cx-d0.nx*30,pose.position[1]];
walkTo(wallTarget[0],wallTarget[1],2000);
assert.ok(__test.region(b,pose.position[0],pose.position[1])==="in","never leaves through a wall");
tickNativeBuildingInteriors(1300);
assert.ok(lights.length>0,"ceiling light indoors");

// stairs: the first flight climbs half a storey, feet follow the ramp
const c=api._debug.core,P=(u,v)=>c.P(u,v);
const s0=P(.6,.6);pose.position=[s0[0],s0[1],api._debug.levels[0]+.97];
const top=P(.6,1.3+3.6+.3);walkTo(top[0],top[1],2000,1.4);
const feet=pose.position[2]-.97,R=api._debug.stairs[0].R;
assert.ok(Math.abs(feet-(api._debug.levels[0]+R/2))<.06,`on the half landing (feet ${feet.toFixed(2)})`);
assert.ok(api.feetHeightAt(...P(.6,1.3+1.8),api._debug.levels[0]+R/4)>api._debug.levels[0]+.1,"ramp height");

// leaving: back outside past the door hands the body back to Box3D physics
pose.position=[inside[0],inside[1],api._debug.levels[0]+.97];
walkTo(d0.cx+d0.nx*6,d0.cy+d0.ny*6,2000);
assert.ok(!api.engaged,"physics restored outside");assert.equal(gravity,1);assert.equal(shape.filter.maskBits,15n);

// placePlayer diagnostics + not on foot disposes
assert.ok(api.placePlayer("roof"));
game.mode="drone";tickNativeBuildingInteriors(3000);
assert.equal(api.active,null);assert.ok(!meshes.has("interiors/L0/lit"));assert.equal(cuts.length,0);
console.log("native building interiors ok",{levels:b.levels.length,props:b.props.length,doors:b.doors.length});
