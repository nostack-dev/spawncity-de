import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditRuntime} from "./renderer_acceptance_gate.mjs";

// Unlike adding another unused native adapter, this test enforces that
// existing gameplay/HUD/audio production modules STOP importing Three.
const migrated=[
 "jogger_chain.mjs","street_voices.mjs","mp_fun_hud.mjs",
 "player_runtime_hotfix.mjs","start_pose_guard.mjs"
];
for(const file of migrated){
 const source=readFileSync("sim/"+file,"utf8");
 assert.doesNotMatch(source,/(?:from\s*["']three(?:\/[^"']*)?["']|import\s*["']three(?:\/[^"']*)?["'])/,
  "production module reintroduced legacy renderer import: "+file);
 assert.doesNotMatch(source,/\bTHREE\./,"old geometry classes must be replaced: "+file);
}
const audit=auditRuntime();
assert.ok(audit.threeImportCount<=70,
 "the codebase must have at least five fewer Three-importing production modules; actual="+audit.threeImportCount);
assert.equal(audit.nativeOnly,false,"this PR must never imply the whole engine is already native");
console.log("real production Three imports:",audit.threeImportCount,
 "(five migrated gameplay/audio/HUD modules; full native release gate stays closed)");
