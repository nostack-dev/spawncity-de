import assert from "node:assert/strict";
import {NativeSceneRenderer} from "../sim/native_scene_renderer.mjs";

const renderer=Object.create(NativeSceneRenderer.prototype);
renderer.meshes=new Map([
 ["flight/airframe",{id:"flight/airframe",visible:true,material:{alphaMode:"opaque",castShadow:true}}],
 ["flight/rotors",{id:"flight/rotors",visible:true,material:{alphaMode:"opaque",castShadow:false}}],
 ["hud",{id:"hud",visible:true,material:{alphaMode:"blend",castShadow:false}}]
]);
renderer.sceneRevision=12;renderer.shadowRevision=7;
assert.equal(renderer.setVisible("absent",false),false);
assert.equal(renderer.sceneRevision,12);
assert.equal(renderer.setVisible("flight/rotors",false),true);
assert.equal(renderer.meshes.get("flight/rotors").visible,false);
assert.equal(renderer.sceneRevision,13);
assert.equal(renderer.shadowRevision,7,"blade visibility must not invalidate sun depth");
assert.equal(renderer.setVisible("flight/rotors",false),false,"no repeated per-frame GPU/sun redraw");
assert.equal(renderer.sceneRevision,13);
assert.equal(renderer.setVisible("flight/airframe",false),true);
assert.equal(renderer.shadowRevision,8,"casting body requires a fresh sun depth pass");
assert.equal(renderer.setVisible("flight/airframe",true),true);
assert.equal(renderer.shadowRevision,9);
assert.equal(renderer.setVisible("hud",false),true);
assert.equal(renderer.shadowRevision,9,"transparent HUD must not invalidate sun shadows");
assert.equal(renderer.setVisible("flight/rotors",true),true);
assert.equal(renderer.sceneRevision,17);
assert.equal(renderer.shadowRevision,9);
console.log("native drone/body visibility uses one renderer and invalidates shadows only when necessary");
