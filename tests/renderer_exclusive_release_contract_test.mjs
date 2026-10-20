// All-or-nothing rendering rule: never ship two presentation pipelines.
// Current legacy engine may remain *only* until a complete native replacement
// passes independent device/image/performance acceptance. No auto-fallback,
// debug toggle or half-migrated Three/native city overlay in a published build.
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const bootPath=existsSync("sim/real_world_bootstrap.mjs")?"sim/real_world_bootstrap.mjs":"legacy-three/sim/real_world_bootstrap.mjs";
const simPath=existsSync("sim/simulator.mjs")?"sim/simulator.mjs":"legacy-three/sim/simulator.mjs";
const bootstrap=read(bootPath);
const simulator=read(simPath);
const runtime=bootstrap+"\n"+simulator;
for(const pattern of [
  /NativeCitySlice|nativeCityFallback|nativeCityRequested/,
  /get\(["']render["']\)\s*===\s*["']native-city["']/,
  /renderer\.render\(scene,camera\)[\s\S]{0,600}(?:nativeCitySlice|native\.render)/,
  /nativeCityError[\s\S]{0,400}renderer\.render\(scene,camera\)/,
])assert.doesNotMatch(runtime,pattern,"hybrid/fallback must never ship");

const imports=(readdirSync("sim").filter(x=>x.endsWith(".mjs")).flatMap(file=>{
 const src=read("sim/"+file);
 return /from ["']three(?:\/[^"']*)?["']|import ["']three(?:\/[^"']*)?["']/.test(src)?[file]:[];
}));
const hasNativeRuntime=/(?:from ["']\.\/native_[^"']+["']|new Native\w+Renderer|new WebGL2Renderer)/.test(runtime);
if(hasNativeRuntime){
 assert.deepEqual(imports,[],"no legacy Three.js imports may ship in the native engine");
 assert.doesNotMatch(runtime,/THREE\.WebGLRenderer|new WebGLRenderer/,"native engine must be the ONLY presentation renderer");
 const deploy=read(".github/workflows/deploy.yml");
 assert.doesNotMatch(deploy,/(?:npm install|npm i)[^\n]*\bthree@/,"native production must not bundle Three.js");
 assert.ok(existsSync("tests/renderer_acceptance_gate.mjs"),"full native engine needs real-device GPU/quality release gate");
}
console.log(JSON.stringify({rendererPolicy:"exclusive-or",mode:hasNativeRuntime?"native-only":"legacy-until-full-native",threeImportModules:imports.length,hybridForbidden:true}));
