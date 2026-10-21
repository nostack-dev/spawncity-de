// Production day / night cycle on the native renderer (stylized_world_style.mjs
// updateDayNight): ~5 min of day, ~3 min of moonlit night, ?time=day|night|dusk
// pins it. Same sun path, moon, light colours and intensities, fog, IBL
// intensity and exposure, the same globalThis.__dayNight API and the same
// "arondight:day-night" event, so lamps, zombies and multiplayer sync follow.
export const NATIVE_DAY_NIGHT_VERSION="native-day-night-prod-v1";
export const DAY_S=300,NIGHT_S=180,CYCLE_S=DAY_S+NIGHT_S;
const FOG_DENSITY=.00085;
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const hex=h=>[(h>>16)&255,(h>>8)&255,h&255].map(v=>lin(v/255));
const C={sunNoon:hex(0xfff2e0),sunLow:hex(0xff9a52),moon:hex(0xa9c0ff),hemiDay:hex(0xc4dcff),hemiNight:hex(0x40557e),
 gndDay:hex(0x6b5e48),gndNight:hex(0x1a1d26),fogDay:hex(0xb7c9dc),fogDusk:hex(0xc79a7a),fogNight:hex(0x101828)};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const scale=(a,k)=>a.map(v=>v*k);
const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const state={phase:.18,night:0,sunUp:1,isNight:false,clock:"",dayNumber:1,toNight:0,toDay:0};
let cycleStart=(typeof performance!=="undefined"?performance.now():0)-.18*DAY_S*1000,pinned=null,wasNight=false;
try{const q=new URLSearchParams(location.search).get("time");if(q==="night")pinned=DAY_S/CYCLE_S+.25*NIGHT_S/CYCLE_S;else if(q==="dusk")pinned=DAY_S/CYCLE_S-.02;else if(q==="day")pinned=.28;}catch{}
function cyclePhase(now){if(pinned!==null)return pinned;const t=((now-cycleStart)/1000)%CYCLE_S;return(t<0?t+CYCLE_S:t)/CYCLE_S;}
export function nativeDayNightLight(now){
  const ph=cyclePhase(now),dayFrac=DAY_S/CYCLE_S;
  const theta=ph<dayFrac?ph/dayFrac*Math.PI:Math.PI+(ph-dayFrac)/(1-dayFrac)*Math.PI;
  const sx=Math.cos(theta),sz=Math.sin(theta);
  const sun=norm([-sx*.8,-.42-.2*sx,sz*.9+.02]),moon=norm([sx*.7,.38,Math.max(.32,-sz*.85)]);
  const h=sun[2],sunUp=smooth(-.06,.10,h),night=1-smooth(-.16,.04,h);
  let key,keyColor;
  if(sunUp>.02){const low=1-smooth(.05,.45,h);key=sun;keyColor=scale(mix(C.sunNoon,C.sunLow,low),2.8*sunUp*(1-.35*low));}
  else{key=moon;keyColor=scale(C.moon,.62*night);}
  const hemiI=.85-.45*night,dusk=Math.max(0,1-Math.abs(h)*4)*(1-night*.6);
  const fog=mix(mix(C.fogDay,C.fogDusk,dusk*.7),C.fogNight,night);
  const hours=(theta/(2*Math.PI)*24+6)%24;
  state.phase=ph;state.night=night;state.sunUp=sunUp;state.isNight=night>.5;
  state.clock=`${String(Math.floor(hours)).padStart(2,"0")}:${String(Math.floor(hours%1*60)).padStart(2,"0")}`;
  state.toNight=Math.max(0,(dayFrac-.012-ph)*CYCLE_S);state.toDay=ph>dayFrac?Math.max(0,(1-ph)*CYCLE_S):0;
  if(state.isNight!==wasNight){
    wasNight=state.isNight;if(!wasNight)state.dayNumber++;
    try{window.dispatchEvent(new CustomEvent("arondight:day-night",{detail:{night:wasNight,day:state.dayNumber}}));}catch{}
  }
  return {sun,moon,key,keyColor,sky:scale(mix(C.hemiDay,C.hemiNight,night),hemiI),ground:scale(mix(C.gndDay,C.gndNight,night),hemiI),
    fog,fogDensity:FOG_DENSITY*(1+.6*night)*(Number(globalThis.__arondightFogScale)||1),envIntensity:.9-.72*night,exposure:1+.38*night,night,sunUp};
}
export function applyNativeDayNight(renderer,now=performance.now()){
  if(!renderer)return null;
  const l=nativeDayNightLight(now);
  // The shadow-casting key light moves in 0.5 degree steps (production), so
  // the sun shadow map is not redrawn every frame and does not crawl.
  const k=renderer.sunDirection;
  if(!Array.isArray(k)||k[0]*l.key[0]+k[1]*l.key[1]+k[2]*l.key[2]<.99996)renderer.sunDirection=l.key;
  renderer.sunColor=l.keyColor;renderer.skyColor=l.sky;renderer.groundColor=l.ground;
  renderer.fogColor=l.fog;renderer.fogDensity=l.fogDensity;renderer.envIntensity=l.envIntensity;renderer.exposure=l.exposure;
  renderer.night=l.night;renderer.skySun=l.sun;renderer.skyMoon=l.moon;
  const v=typeof document!=="undefined"?document.getElementById("viewport"):null;
  if(v){const st=`${state.clock}${state.isNight?" night":" day"}`;if(v.dataset.dayNight!==st)v.dataset.dayNight=st;}
  return l;
}
globalThis.__dayNight={get state(){return state;},set(phase){pinned=Number.isFinite(phase)?((phase%1)+1)%1:null;},
  night(){pinned=DAY_S/CYCLE_S+.3*NIGHT_S/CYCLE_S;},day(){pinned=null;cycleStart=performance.now()-.18*DAY_S*1000;},
  skipTo(phase){pinned=null;cycleStart=performance.now()-phase*CYCLE_S*1000;},version:NATIVE_DAY_NIGHT_VERSION};
