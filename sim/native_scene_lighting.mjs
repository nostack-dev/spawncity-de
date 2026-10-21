// Production scene_lighting.mjs on the native light pool (street lamps are
// native_street_lamps): your car's headlights light the road after dark, every
// round you fire flashes the surroundings, blasts light up the block with a
// fast decay, rockets in flight light what they pass and a burning jetpack
// throws orange light on the ground. Same colours, ranges and timings;
// intensities on the native lamp scale (production lamp 46 = native 16).
export const NATIVE_SCENE_LIGHTING_VERSION="scene-lighting-v1-native";
const K=16/46;
let game=null,installed=false,flashUntil=0;const blasts=[],tracers=[];
const night=()=>Number(globalThis.__dayNight?.state?.night)||0;
function req(p,o){try{game?.world?.requestLight?.(p,{...o,intensity:o.intensity*K});}catch{}}
export function tickNativeSceneLighting(now=performance.now()){
  if(!game?.world)return;const cam=game.world.camera;if(!cam?.eye)return;
  const glow=Math.max(0,Math.min(1,(night()-.15)/.5));
  if(glow>.05&&game.mode==="car"){const p=game.rigids?.pose?.("player-car");if(p?.position){const yaw=Number(p.yaw)||0;req([p.position[0]+Math.cos(yaw)*7,p.position[1]+Math.sin(yaw)*7,p.position[2]+.9],{color:0xfff2d8,intensity:60*glow,distance:22});}}
  if(now<flashUntil){const e=cam.eye,t=cam.target,d=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],l=Math.hypot(...d)||1;req([e[0]+d[0]/l*.9,e[1]+d[1]/l*.9,e[2]+d[2]/l*.9-.1],{color:0xffc272,intensity:22,distance:13});}
  for(let i=blasts.length-1;i>=0;i--){const b=blasts[i],t=(now-b.at)/b.ms;if(t>=1){blasts.splice(i,1);continue;}req(b.p,{color:0xffa04a,intensity:b.peak*(1-t)*(1-t),distance:b.r});}
  for(let i=tracers.length-1;i>=0;i--){const t=tracers[i],u=(now-t.at)/45;if(u>=1){tracers.splice(i,1);continue;}req([t.a[0]+(t.b[0]-t.a[0])*u,t.a[1]+(t.b[1]-t.a[1])*u,t.a[2]+(t.b[2]-t.a[2])*u],{color:0xffd27a,intensity:7*(1-u),distance:6});}
  let k=0;for(const r of globalThis.__nativeOrdnanceRounds?.()||[]){if(k>=2)break;if(Math.hypot(r[0]-cam.eye[0],r[1]-cam.eye[1])>90)continue;req(r,{color:0xff9a40,intensity:16,distance:10});k++;}
  const J=globalThis.__arondightJetpack,W=globalThis.__arondightWalkMode,P=W?.position;
  if(J?.thrusting&&P&&game.mode==="foot")req([P.x,P.y,P.z-1.6+.7],{color:0xff8a2a,intensity:14,distance:9});
}
export function nativeTracerGlint(a,b){if(!a||!b)return;const L=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);if(L<2)return;if(tracers.length>=3)tracers.shift();tracers.push({a:a.slice(0,3),b:b.slice(0,3),at:performance.now()});}
export function installNativeSceneLighting(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  addEventListener("arondight:weapon-fired",e=>{const d=e?.detail||{};if(d.mode!=="foot"||d.weapon==="fists"||d.weapon==="knife"||d.weapon==="hand-grenade")return;flashUntil=performance.now()+(d.weapon==="sniper"?90:55);});
  addEventListener("arondight:world-explosion",e=>{const d=e?.detail||{},p=d.position;if(!Array.isArray(p))return;const r=Math.max(6,Number(d.radiusM)||8);if(blasts.length>=4)blasts.shift();blasts.push({p:[p[0],p[1],(Number(p[2])||0)+1.5],at:performance.now(),ms:420,peak:220+r*18,r:r*4});});
  addEventListener("arondight:foot-tracer",e=>{const d=e?.detail||{};if(Array.isArray(d.start)&&Array.isArray(d.end))nativeTracerGlint(d.start,d.end);});
  addEventListener("arondight:world-reset",()=>{blasts.length=0;flashUntil=0;tracers.length=0;});
  globalThis.__arondightSceneLighting={version:NATIVE_SCENE_LIGHTING_VERSION};
}
