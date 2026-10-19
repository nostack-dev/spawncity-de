// The native engine is a closed, Three-free graph. The live game is not.
// A later migration may import sim/native_engine.mjs only. Pulling simulator.mjs,
// real_world_bootstrap.mjs or any remaining Three module into that graph fails here.
import assert from "node:assert/strict";
import {readFileSync,existsSync,readdirSync} from "node:fs";
import {dirname,join,resolve,relative} from "node:path";
import {auditRuntime} from "./renderer_acceptance_gate.mjs";

const root=resolve("sim");
const entry=join(root,"native_engine.mjs");
const engine=readFileSync(entry,"utf8");
assert.match(engine,/NATIVE_ENGINE_VERSION="spawncity-native-engine-v1"/);
assert.doesNotMatch(engine,/from\s+["']three|simulator\.mjs|real_world_bootstrap\.mjs/);

function strip(src){
 let out="",i=0,q=null;
 while(i<src.length){
  const c=src[i],n=src[i+1];
  if(q){
   out+=c;
   if(c==="\\"&&i+1<src.length){out+=n;i+=2;continue;}
   if(c===q)q=null;
   i++;continue;
  }
  if(c==="/"&&n==="/"){while(i<src.length&&src[i]!=="\n")i++;continue;}
  if(c==="/"&&n==="*"){i+=2;while(i<src.length&&!(src[i]==="*"&&src[i+1]==="/"))i++;i+=2;continue;}
  if(c==="\""||c==="'"||c==="`")q=c;
  out+=c;i++;
 }
 return out;
}
const fromRe=/from\s*["']([^"']+)["']/g;
const sideRe=/import\s*["']([^"']+)["']/g;
function specs(src){
 const code=strip(src),found=[];
 for(const re of [fromRe,sideRe]){
  re.lastIndex=0;
  let m;while((m=re.exec(code)))found.push(m[1]);
 }
 return found;
}
const seen=new Set();
const stack=[entry];
const external=[];
while(stack.length){
 const file=stack.pop();
 if(seen.has(file))continue;
 seen.add(file);
 if(!existsSync(file)){
  assert.match(relative(".",file),/^generated\/.+\.mjs$/,"missing engine file "+file);
  continue;
 }
 for(const spec of specs(readFileSync(file,"utf8"))){
  if(spec==="three"||spec.startsWith("three/"))assert.fail(file+" imports Three.js");
  if(spec.startsWith(".")){
   let next=resolve(dirname(file),spec);
   if(!next.endsWith(".mjs"))next+=".mjs";
   stack.push(next);
  }else{
   assert.match(spec,/^box3d\.js\//,file+" reached outside the engine: "+spec);
   external.push(spec);
  }
 }
}
const inside=new Set([...seen].map(file=>relative(root,file)));
for(const banned of ["simulator.mjs","real_world_bootstrap.mjs","drone_simulator.html"])
 assert.equal(inside.has(banned),false,banned+" must stay outside the sealed engine");
const threeRe=/(?:from\s*["']three(?:\/[^"']*)?["']|import\s*["']three(?:\/[^"']*)?["'])/;
const legacy=[];
for(const name of readdirSync(root)){
 if(!name.endsWith(".mjs"))continue;
 const src=readFileSync(join(root,name),"utf8");
 if(!threeRe.test(src))continue;
 legacy.push(name);
 assert.equal(inside.has(name),false,"legacy Three module leaked into the engine: "+name);
}
assert.ok(inside.has("native_scene_renderer.mjs"));
assert.ok(inside.has("native_world_presenter.mjs"));
assert.ok(inside.has("native_game_runtime.mjs"));
assert.ok(inside.size>=40,"engine closure collapsed: "+inside.size);

assert.doesNotMatch(engine,/THREE\.WebGLRenderer|three\.module\.js|@vite|unpkg|cdnjs/i,
 "the sealed engine is bundled into /native/ and must not carry legacy loader names");
const targets=[
 ["native_scene_renderer.mjs","class NativeSceneRenderer"],
 ["native_scene_graph.mjs","class NativeSceneGraph"],
 ["native_world_presenter.mjs","setCamera("],
 ["native_world_presenter.mjs","pick(x,y,options)"],
 ["native_world_presenter.mjs","pickGameplay(x,y"],
 ["native_world_presenter.mjs","requestLight(position,opts)"],
 ["native_scene_renderer.mjs","upsert(id,input)"],
 ["native_effects.mjs","emit({kind"],
 ["native_scene_graph.mjs","add(id,"],
 ["native_game_runtime.mjs","class NativeGameRuntime"]
];
for(const [file,needle] of targets)
 assert.ok(readFileSync(join(root,file),"utf8").includes(needle),"engine surface missing "+file+" "+needle);
const boot=readFileSync(join(root,"native_game_bootstrap.mjs"),"utf8");
assert.match(boot,/from "\.\/native_engine\.mjs"/);
assert.doesNotMatch(boot,/from "\.\/native_game_runtime\.mjs"|from "\.\/native_game_input\.mjs"|from "\.\/native_osm_source\.mjs"/);
const audit=auditRuntime();
assert.equal(audit.nativeOnly,false,"sealing the engine must not pretend the live game is already native");
assert.ok(audit.threeImportCount===legacy.length&&legacy.length>0,"legacy Three game modules remain for a later migration");
console.log(JSON.stringify({
 engine:"sealed",
 contract:"spawncity-native-engine-v1",
 closure:inside.size,
 legacyThreeModules:legacy.length,
 productionCutover:"blocked"
}));
