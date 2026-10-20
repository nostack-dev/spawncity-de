import assert from "node:assert/strict";
import {installNativeWeapons} from "../sim/native_weapons.mjs";
const effects=[],impulses=[],rays=[];
const game={mode:"foot",rigids:{
  raycast(origin,direction,max){rays.push(max);return {id:"walker",point:[origin[0],origin[1]+4,origin[2]],distanceM:4};},
  applyImpulse(id,impulse){impulses.push([id,impulse]);return true;},
  pose(){return {position:[4,8,1]};}
 },world:{camera:{eye:[0,0,2],target:[0,10,2]},effects:{emit(e){effects.push(e.kind);return 1;}}}};
const weapons=installNativeWeapons(game,{armed:()=>true});
assert.equal(globalThis.__arondightFootWeapons.fireAt({}),true);
assert.equal(globalThis.__arondightFootWeapons.fireAt({}),false);
assert.ok(effects.includes("muzzle")&&effects.includes("tracer"));
assert.equal(impulses[0][0],"walker");
assert.equal(globalThis.__arondightFootWeapons.toggle(),"glock");
game.mode="drone";
assert.equal(globalThis.__arondightDroneWeapons.setMode("missile"),"missile");
assert.equal(globalThis.__arondightDroneWeapons.fireMissile(),true);
weapons.tick(performance.now()+20);
assert.ok(effects.includes("blast")||effects.includes("smoke")||effects.includes("muzzle"));
console.log("native weapons use the live rates, a Box3D ray and the native effects");
