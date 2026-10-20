// Native-only renderer shader initialization. The exclusive WebGL2 renderer
// links its GLSL programs exactly once during construction (and on context
// restoration); repeating material permutations in a permanent idle timer
// would create the very mobile stutter this module originally prevented.
// No Three.js imports, no second GPU pipeline, no legacy bloom target.
export const SHADER_PREWARM_VERSION="native-compiled-once-no-idle-trickle-v6";
let owner=null,runs=0;
function updateDiagnostics(reason,ready,start){
 if(typeof document==="undefined")return;
 const v=document.getElementById("viewport");
 if(v){v.dataset.shaderPrewarm=SHADER_PREWARM_VERSION;v.dataset.shaderPrewarmRuns=String(runs);
  v.dataset.shaderPrewarmPrograms=ready?"linked":"not-ready";v.dataset.shaderPrewarmSamples="0";
  v.dataset.shaderPrewarmMs=String(Math.round(performance.now()-start));
  v.dataset.shaderPrewarmReason=reason;}
}
async function prewarm(reason="manual"){
 const t=performance.now(),r=owner;
 const ready=Boolean(r&&!r.disposed&&!r.lost&&r.gl?.getProgramParameter?.(r.gpu?.handle,r.gl.LINK_STATUS));
 if(ready)runs++;
 updateDiagnostics(reason,ready,t);
 return ready;
}
export function installShaderPrewarm(renderer){
 if(!renderer?.gl||!renderer?.gpu?.handle||!renderer?.render)
  throw Error("shader readiness requires sole native WebGL2 renderer");
 owner=renderer;
 const API={run:prewarm,version:SHADER_PREWARM_VERSION};
 globalThis.__shaderPrewarm=API;
 // The program is already linked; this call is a read-only status check,
 // not a new shader compilation or an interval/RAF retry loop.
 void prewarm("native-init");
 return API;
}
export function disposeShaderPrewarm(renderer){
 if(owner!==renderer)return false;
 owner=null;
 if(globalThis.__shaderPrewarm?.version===SHADER_PREWARM_VERSION)delete globalThis.__shaderPrewarm;
 return true;
}
