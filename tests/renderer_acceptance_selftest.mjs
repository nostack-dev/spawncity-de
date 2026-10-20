import assert from "node:assert/strict";
import {auditRuntime,verifyRendererEvidence,releaseDecision,REQUIRED_DEVICES,REQUIRED_MODES} from "./renderer_acceptance_gate.mjs";

const make=()=>({
  schema:"spawncity-native-renderer-proof-v1",
  productionRenderer:"native-webgl2",
  scenarios:REQUIRED_DEVICES.flatMap(device=>REQUIRED_MODES.map(mode=>({
    device,mode,sameCameraTimeAndScene:true,gameplayReadabilityPreserved:true,
    baseline:{renderer:"three-webgl",gpuVendor:"Real hardware",width:960,height:540,dpr:1.5,frames:600,durationMs:15000,fps:58,p95FrameMs:17.1,gpuTimeP95Ms:12},
    candidate:{renderer:"native-webgl2",gpuVendor:"Real hardware",width:960,height:540,dpr:1.5,frames:600,durationMs:15000,fps:60,p95FrameMs:16.5,gpuTimeP95Ms:9.5},
    visual:{ssim:.985,meanAbsoluteRgbError:3.2,screenshotBaseline:"proof-a.png",screenshotCandidate:"proof-b.png"}
  })))
});
assert.equal(verifyRendererEvidence(make()).pass,true,"acceptance rules must have a satisfiable (synthetic) contract");
const newArt=make();
for(const row of newArt.scenarios){row.visual.ssim=.80;row.visual.meanAbsoluteRgbError=31;row.visual.restyleReviewed=true;row.visual.noMissingGeometry=true;row.visual.hudReadabilityPreserved=true;row.visual.motionLegibilityPreserved=true;row.visual.reviewNotes="Reviewed side-by-side; improved facades, silhouettes, HUD contrast.";}
assert.equal(verifyRendererEvidence(newArt).pass,true,"a reviewed prettier restyle may replace the old art direction");
newArt.scenarios[0].visual.noMissingGeometry=false;
assert.equal(verifyRendererEvidence(newArt).pass,false,"missing geometry must fail even if art direction approved");
for(const mut of [
  a=>a.scenarios.pop(),
  a=>a.scenarios[0].candidate.dpr=1,
  a=>a.scenarios[0].candidate.gpuVendor="ANGLE SwiftShader",
  a=>a.scenarios[0].candidate.p95FrameMs=22,
  a=>a.scenarios[0].candidate.gpuTimeP95Ms=11,
  a=>a.scenarios[0].visual.ssim=.95,
  a=>a.scenarios[0].gameplayReadabilityPreserved=false,
  a=>a.scenarios[0].candidate.renderer="three-webgl",
  a=>a.productionRenderer="three-webgl",
]){
 const sample=make();mut(sample);
 assert.equal(verifyRendererEvidence(sample).pass,false,"incomplete or regressed native comparison must be rejected");
}
const audit=auditRuntime();
assert.equal(audit.nativeOnly,false,"existing Three-dependent main game must NOT be incorrectly released as Three-free");
assert.ok(audit.threeImportCount>20&&audit.threeCalls>200,"runtime source inspection should cover whole sim directory");
assert.ok(audit.threeRendererConstructors>=1,"detect the remaining legacy production WebGLRenderer");
assert.equal(audit.bundlesThree,false,"deleted production dependency must stay deleted");
assert.equal(audit.nativeOnly,false,"removing npm Three without porting imports never qualifies as a native release");
const legacy=releaseDecision(audit,verifyRendererEvidence(null));
assert.equal(legacy.mode,"legacy-production");
assert.equal(legacy.pass,true,"the legacy game may publish while the native cutover is not claimed");
assert.equal(legacy.nativeCutover,false);
const blocked=releaseDecision({nativeOnly:true,bundlesThree:false},verifyRendererEvidence(null));
assert.equal(blocked.mode,"native-cutover");
assert.equal(blocked.pass,false,"a Three-free tree without 15 real-device proofs must not ship");
assert.equal(releaseDecision({nativeOnly:true,bundlesThree:false},verifyRendererEvidence(make())).pass,true);
assert.equal(releaseDecision({nativeOnly:false,bundlesThree:true},verifyRendererEvidence(make())).pass,false,"reinstalling Three.js must fail closed");
console.log("Native renderer acceptance selftest passed: static legacy engine and reduced-visual/GPU fake wins rejected.");
