import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditRuntime} from "./renderer_acceptance_gate.mjs";

// Three.js was explicitly deleted from the production dependency list.
// The legacy game may still publish. --gate fails closed only for a claimed
// native cutover that lacks the 15 real-device proofs, or if Three.js is
// bundled again. Never hide a missing import with an alias, fallback CDN,
// or a silent shim.
const deploy=readFileSync(".github/workflows/deploy.yml","utf8");
const guard="node tests/renderer_acceptance_gate.mjs --gate";
const original="Compile and validate exact Erin Catto Box3D for production";
const bundle="Bundle self-contained Pages";
const release=deploy.indexOf("Publish built site to the sole canonical repository");
assert.ok(deploy.includes(guard),"production must enforce the actual full-native release gate");
assert.ok(deploy.indexOf(guard)<deploy.indexOf(original),"fail closed before expensive WASM compilation");
assert.ok(deploy.indexOf(guard)<deploy.indexOf(bundle),"a half-ported game must never bundle");
assert.ok(deploy.indexOf(guard)<release,"a half-ported game must never publish");
const production=deploy.slice(deploy.indexOf("- name: Bundle self-contained Pages"),release);
assert.doesNotMatch(production,/\bthree(?:@[\w.\-]+|\s)|\balias:three\b|\bcdn\b/i,
 "production must not install, alias or fetch the deleted Three.js dependency");
const audit=auditRuntime();
assert.equal(audit.bundlesThree,false,"Three.js may not re-enter the production dependency list");
assert.ok(Number.isInteger(audit.threeImportCount),"every remaining source import must be audited");
console.log(JSON.stringify({
 productionThreeDependency:"deleted",
 remainingLegacyImports:audit.threeImportCount,
 nativeEngineReady:audit.nativeOnly,
 releasePolicy:"legacy-may-publish; native-cutover-blocked-until-15-real-device-proofs"
}));
