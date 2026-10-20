import assert from "node:assert/strict";
import {clearNativeActorSpawns} from "../sim/native_spawn_clearance.mjs";
import {buildingLaunchPointClear} from "../sim/world_building_collision_physics.mjs";
const rect=(x,y,w,h,key)=>({buildingKey:key,base:0,top:20,points:[
 [x,y],[x+w,y],[x+w,y+h],[x,y+h]
]});
const snapshot={hash:"genuine-map",footprintCount:2,prismCount:2,
 prisms:[rect(-4,-4,19,19,"building-over-car-and-foot"),
         rect(-30,-5,13,13,"building-around-jet")]};
const actors=new Map([
 ["player-foot",{position:[1,0,.97],rotation:[0,0,0,1]}],
 ["player-car",{position:[8,1,1.05],rotation:[0,0,0,1]}],
 ["player-jet",{position:[-24,0,3],rotation:[0,0,0,1]}]
]);
const moves=[];
const rigids={
 pose(id){const state=actors.get(id);return state?{position:[...state.position],rotation:[...state.rotation]}:null;},
 setPose(id,update){if(!actors.has(id))return false;
  actors.set(id,{position:[...update.position],rotation:[...update.rotation]});
  moves.push(id);return true;
 }
};
const result=clearNativeActorSpawns(rigids,snapshot,{heightAt:()=>.25});
assert.equal(result.examined,3);
assert.deepEqual(new Set(moves),new Set(["player-foot","player-car","player-jet"]));
const distances={"player-foot":.95,"player-car":2.6,"player-jet":12};
for(const [id,clearanceM] of Object.entries(distances)){
 const p=actors.get(id).position;
 assert.equal(buildingLaunchPointClear(snapshot,p.slice(0,2),{clearanceM}),true,
  "real "+id+" must never start inside or within collision clearance of a building");
 assert.ok(p[2]>0,"spawn remains physically above terrain");
}
assert.ok(result.moved.every(x=>x.from.some((n,i)=>n!==x.to[i])));
assert.equal(clearNativeActorSpawns(rigids,snapshot,{heightAt:()=>.25,firstLoad:false}).moved.length,0);
assert.equal(moves.length,3,"city refresh cannot teleport an actively driven car");
actors.set("player-jet",{position:[-24,0,100],rotation:[0,0,0,1]});
const airborne=clearNativeActorSpawns(rigids,snapshot,{heightAt:()=>.25});
assert.equal(airborne.moved.length,0,"airborne jet is not teleported due to ground projection");
assert.equal(actors.get("player-jet").position[2],100);
const zero={hash:"clear",footprintCount:0,prismCount:0,prisms:[]};
assert.equal(clearNativeActorSpawns(rigids,zero).alreadyClear,true);
assert.throws(()=>clearNativeActorSpawns(null,snapshot),/Box3D/);
assert.throws(()=>clearNativeActorSpawns(rigids,null),/Box3D/);
console.log("native Box3D actual OSM city: no car/foot/jet starts inside walls; no reload or airborne teleport");
