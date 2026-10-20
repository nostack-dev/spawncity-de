// Native renderer release acceptance. Fail closed: a static microbenchmark,
// a reduced DPR preset, or software-rendered Chrome are NOT proof of a complete
// Three-free game with better on-device performance and equivalent visuals.
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";

export const REQUIRED_DEVICES=["desktop","android-chrome","iphone-safari"];
export const REQUIRED_MODES=["drone","foot","car","jet","multiplayer"];
const VALID_RENDERER="native-webgl2";

export function auditRuntime(root="."){
  const folder=resolve(root,"sim"),files=readdirSync(folder).filter(f=>f.endsWith(".mjs"));
  const reports=[],imports=[];
  let symbols=0,shaderHooks=0,rendererConstructors=0;
  for(const name of files){
    const src=readFileSync(join(folder,name),"utf8");
    const imported=/(?:from\s*["']three(?:\/[^"']*)?["']|import\s*["']three(?:\/[^"']*)?["'])/.test(src);
    const usages=(src.match(/\bTHREE\./g)||[]).length;
    const hooks=(src.match(/\.onBeforeCompile\b|ShaderChunk|ShaderMaterial|WebGLRenderTarget|PMREMGenerator|EffectComposer|InstancedMesh|SkinnedMesh/g)||[]).length;
    const old=(src.match(/new\s+THREE\.WebGLRenderer\s*\(/g)||[]).length;
    symbols+=usages;shaderHooks+=hooks;rendererConstructors+=old;
    if(imported)imports.push(name);
    if(imported||usages||hooks||old)reports.push({path:"sim/"+name,importsThree:imported,threeCalls:usages,shaderHooks:hooks,threeRendererConstructors:old});
  }
  const workflow=readFileSync(join(root,".github/workflows/deploy.yml"),"utf8");
  const bundlesThree=/(?:npm\s+install|pnpm\s+add)[^\n]*\bthree@|^\s+three@[0-9]/m.test(workflow);
  return {files:files.length,threeImportCount:imports.length,threeImports:imports,threeCalls:symbols,shaderHooks,threeRendererConstructors:rendererConstructors,bundlesThree,modules:reports,nativeOnly:!imports.length&&!rendererConstructors&&!bundlesThree};
}

const numeric=(n,k)=>{if(!Number.isFinite(n))throw Error("Missing/invalid "+k);return n;};

export function verifyRendererEvidence(report){
  const failures=[];
  const fail=x=>failures.push(x);
  if(report?.schema!=="spawncity-native-renderer-proof-v1")fail("missing renderer proof schema");
  if(report?.productionRenderer!==VALID_RENDERER)fail("production path must be native-webgl2; an experimental static batch is not the game renderer");
  const groups=Array.isArray(report?.scenarios)?report.scenarios:[];
  for(const device of REQUIRED_DEVICES)for(const mode of REQUIRED_MODES){
    const key=device+"/"+mode,matching=groups.filter(x=>x.device===device&&x.mode===mode);
    if(matching.length!==1){fail(key+": expected exactly one real-game scenario");continue;}
    const {baseline:a,candidate:b,visual:v}=matching[0];
    if(!a||!b||!v){fail(key+": missing baseline/candidate/visual");continue;}
    if(b.renderer!==VALID_RENDERER){fail(key+": candidate is not native-webgl2");continue;}
    if(/swiftshader|llvmpipe|software/i.test(String(a.gpuVendor)+" "+String(b.gpuVendor)))fail(key+": software renderer is not device performance proof");
    if(!a.gpuVendor||!b.gpuVendor)fail(key+": missing device GPU");
    if(a.width!==b.width||a.height!==b.height||a.dpr!==b.dpr||a.width<300||a.dpr<.5)fail(key+": unequal pixel count/DPR");
    if(!matching[0].sameCameraTimeAndScene||!matching[0].gameplayReadabilityPreserved)fail(key+": scene/camera or gameplay readability changed");
    if(!v.screenshotBaseline||!v.screenshotCandidate)fail(key+": both image artifact IDs required");
    try{
      // A deliberate restyle may have low SSIM and still be objectively clearer.
      // Two acceptable routes: equivalent reference image OR reviewed improved
      // art direction with no loss of silhouettes, HUD, targets or scene content.
      const equivalent=numeric(v.ssim,key+" SSIM")>=.97
        &&numeric(v.meanAbsoluteRgbError,key+" RGB MAE")<=7.5;
      const redesigned=v.restyleReviewed===true&&v.noMissingGeometry===true
        &&v.hudReadabilityPreserved===true&&v.motionLegibilityPreserved===true
        &&typeof v.reviewNotes==="string"&&v.reviewNotes.length>=24;
      if(!equivalent&&!redesigned)fail(key+": neither image equivalence nor reviewed higher-quality redesign demonstrated");
      if(numeric(a.frames,key+" baseline frames")<240||numeric(b.frames,key+" native frames")<240)fail(key+": need >=240 frames per path");
      if(numeric(a.durationMs,key+" baseline duration")<10000||numeric(b.durationMs,key+" native duration")<10000)fail(key+": need >=10s per path");
      const baseFPS=numeric(a.fps,key+" baseline FPS"),nativeFPS=numeric(b.fps,key+" native FPS"),baseP95=numeric(a.p95FrameMs,key+" baseline p95"),nativeP95=numeric(b.p95FrameMs,key+" native p95");
      if(nativeFPS+1<baseFPS)fail(key+": native FPS regressed");
      if(nativeP95>baseP95*1.03)fail(key+": native frame pacing regressed");
      const baseGpu=numeric(a.gpuTimeP95Ms,key+" baseline GPU p95"),nativeGpu=numeric(b.gpuTimeP95Ms,key+" native GPU p95");
      if(baseGpu<=0||nativeGpu<=0||nativeGpu>baseGpu*.85)fail(key+": need >=15% improvement in GPU p95 at same visuals/resolution");
    }catch(e){fail(String(e.message));}
  }
  return {pass:failures.length===0,failures,scenarios:groups.length,required:REQUIRED_DEVICES.length*REQUIRED_MODES.length};
}

// Legacy SpawnCity may publish. A native cutover may not, until sim/ no longer
// imports Three and the 15 real-device proofs pass. Missing proofs are not a
// failure of the legacy game, and a software-renderer report cannot unlock
// the cutover.
export function releaseDecision(audit,proof){
  if(audit?.bundlesThree)return {pass:false,mode:"rejected",nativeCutover:false,reason:"three-package-bundled"};
  if(!audit?.nativeOnly)return {pass:true,mode:"legacy-production",nativeCutover:false,reason:"legacy game may publish; native cutover is not claimed"};
  const accepted=proof?.pass===true;
  return {pass:accepted,mode:"native-cutover",nativeCutover:accepted,reason:accepted?"native cutover accepted":"native cutover blocked until 15 real-device proofs pass"};
}

if(process.argv[1]?.endsWith("/renderer_acceptance_gate.mjs")){
  const reportPath=process.env.NATIVE_RENDERER_EVIDENCE||"artifacts/renderer-acceptance.json";
  const audit=auditRuntime();
  let evidence=null;
  if(existsSync(reportPath))try{evidence=JSON.parse(readFileSync(reportPath,"utf8"));}catch(e){evidence={error:String(e)};}
  const proof=verifyRendererEvidence(evidence);
  const decision=releaseDecision(audit,proof);
  const result={audit,proof,decision,pass:decision.pass};
  mkdirSync("artifacts/renderer-gate",{recursive:true});
  writeFileSync("artifacts/renderer-gate/readiness.json",JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({mode:decision.mode,nativeCutover:decision.nativeCutover,reason:decision.reason,nativeOnly:audit.nativeOnly,threeImports:audit.threeImportCount,threeCalls:audit.threeCalls,shaderHooks:audit.shaderHooks,threeRendererConstructors:audit.threeRendererConstructors,bundlesThree:audit.bundlesThree,requiredScenarios:proof.required,providedScenarios:proof.scenarios,failures:proof.failures.slice(0,18)},null,2));
  if(process.argv.includes("--gate")&&!decision.pass){console.error("Native render engine release gate NOT MET: do not deploy a claimed Three-free renderer.");process.exitCode=1;}
}
