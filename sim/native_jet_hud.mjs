// Production jet HUD on the native page (jet_mode.mjs ui / renderHud): speed,
// Mach, angle of attack, AGL, G, HP, flight mode, throttle bar and the
// FLUG / RAKETE / BOMBE / CAM / EJECT buttons with the live stylesheet.
// Flight data comes from the native Box3D jet and its jet_flight_dynamics
// airframe; V / Xbox LB toggle hover and flight like production.
import {setFlightMode,JET_SPEC} from "./jet_flight_dynamics.mjs";
import {lookAt,perspective,multiply4} from "./native_render_math.mjs";
export const NATIVE_JET_HUD_VERSION="native-jet-hud-prod-v1";
const CSS=`#jetHud{display:none;position:absolute;inset:0;z-index:31;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff}body.jet-mode #jetHud{display:block}
html body.jet-mode #viewport #mobileGameplayMode.hud-mode-switch,html body.jet-mode #mobileGameplayMode,html body.jet-mode #soloLeft,html body.jet-mode #soloRight,html body.jet-mode #soloClearance,html body.jet-mode .solo-action,html body.jet-mode #vehicleHud,html body.jet-mode #airStrikeButton,html body.jet-mode #enterCarButton,html body.jet-mode #zombieRepair,html body.jet-mode #viewport #footHud #footWeaponToggle,html body.jet-mode #viewport #footWeaponToggle,html body.jet-mode #droneWeaponToggle,html body.jet-mode #viewport #footHud #footJump,html body.jet-mode #viewport #mobileGameplayDock #mobileGameplayWeapon,html body.jet-mode #viewport #mobileGameplayDock #mobileGameplayMode,html body.jet-mode #playerModeButton{display:none!important}#jetHud .jet-btns [data-a=mode]{border-color:#7fd3ff}#jetHud .jet-btns [data-a=mode][data-flight="1"]{background:#1d4c6be0}
#jetHud{--hud:#7dff9a;--hud-dim:#7dff9a99}#jetHud .jet-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}#jetHud .jet-svg line,#jetHud .jet-svg circle{stroke:var(--hud);stroke-width:1.4;fill:none;vector-effect:non-scaling-stroke}#jetHud .jet-city-line{stroke-dasharray:6 7;opacity:.55}#jetHud .jet-city-dot{fill:var(--hud)!important;opacity:.8}#jetHud .jet-fpm{opacity:.85}#jetHud .jet-city{position:absolute;left:50%;top:calc(max(8px,var(--solo-safe-top,env(safe-area-inset-top))) + 50px);transform:translateX(-50%);text-align:center;color:var(--hud);text-shadow:0 0 4px #000c,0 1px 2px #000;pointer-events:none;white-space:nowrap}#jetHud .jet-city b{display:block;font:700 13px/1.1 "Barlow Condensed",Inter,system-ui,sans-serif;letter-spacing:.22em}#jetHud .jet-city small{display:block;font:600 10px/1.2 Inter,system-ui,sans-serif;letter-spacing:.12em;opacity:.75}#jetHud .jet-read{position:absolute;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3px;color:var(--hud);font:700 13px/1 "Barlow Condensed",Inter,system-ui,sans-serif;letter-spacing:.06em;text-shadow:0 0 4px #000c,0 1px 2px #000;pointer-events:none}#jetHud .jet-read b[data-k=spd],#jetHud .jet-read b[data-k=alt]{font-size:22px;padding:3px 6px;border:1.3px solid var(--hud-dim);border-radius:3px;min-width:54px;text-align:center}#jetHud .jet-read small{font:700 9px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;opacity:.7}#jetHud .jet-left{left:calc(max(12px,var(--solo-safe-left,env(safe-area-inset-left))) + min(25vw,148px) + 52px);align-items:flex-end;text-align:right}#jetHud .jet-right{right:calc(max(12px,var(--solo-safe-right,env(safe-area-inset-right))) + min(25vw,148px) + 26px);align-items:flex-start}#jetHud [data-k=mach][data-super="1"]{color:#ffd27a}#jetHud [data-k=hp][data-low="1"]{color:#ff6a5a}#jetHud [data-k=aoa][data-high="1"]{color:#ffd27a}#jetHud .jet-mode-row{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 52px);color:var(--hud);font:700 12px/1 "Barlow Condensed",Inter,system-ui,sans-serif;letter-spacing:.18em;text-shadow:0 0 4px #000c;pointer-events:none}body.jet-mode #navGuide{top:calc(max(8px,var(--solo-safe-top,env(safe-area-inset-top))) + 88px)}html body.jet-mode #viewport #worldLookHud{opacity:.8}#jetHud .jet-thr{position:absolute;left:calc(max(12px,var(--solo-safe-left,env(safe-area-inset-left))) + min(25vw,148px) + 26px);bottom:calc(max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 8px);width:12px;height:min(25vw,148px);border-radius:6px;background:#0d1118b8;border:1.5px solid #ffffff88;overflow:hidden}#jetHud .jet-thr i{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(#ff7a1a,#f4d27a 25%,#8fa0ad)}#jetHud .jet-thr span{display:none}
#jetHud .jet-btns{position:absolute;left:50%;transform:translateX(-50%);bottom:max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom)));display:flex;gap:8px;pointer-events:auto}#jetHud .jet-btns button{height:40px;min-width:60px;padding:0 10px;border-radius:10px;border:1.5px solid #7dff9a88;background:#08140cc0;color:#c9ffd6;font:900 12px/1 Inter;letter-spacing:.08em;touch-action:none}#jetHud .jet-btns [data-a=rocket][data-armed="1"]{background:#65400be8;border-color:#ffe376;color:#fff0a8;box-shadow:0 0 0 2px #ffbd5460}
#jetHud .jet-btns [data-a=rocket][data-ready="0"]{opacity:.8}
/* under the parachute there is no jet any more: no jet buttons, no jet readouts */
body.jet-chute #jetHud .jet-btns,body.jet-chute #jetHud .jet-read,body.jet-chute #jetHud .jet-thr,body.jet-chute #jetHud .jet-svg{display:none!important}
#jetHud [data-a=exit]{position:absolute;top:calc(max(8px,var(--solo-safe-top,env(safe-area-inset-top))) + 55px);left:max(8px,var(--solo-safe-left,env(safe-area-inset-left)));right:auto;height:38px;min-width:84px;z-index:40;background:#411811d9;color:#ffe5d8;border:1.5px solid #ff5a4a;border-radius:10px;pointer-events:auto;touch-action:none}
#jetHud [data-a=exit][data-holding="1"]{background:#b24927;border-color:#ffddaa;box-shadow:0 0 0 2px #ffbb8899}
body.jet-passenger :is(#footHud,#soloLeft,#soloRight,#vehicleHud,#footMove,#footFire){display:none!important}body.jet-passenger #enterJetButton{display:block!important}
#enterJetButton{position:absolute;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(max(14px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 118px);min-width:170px;height:46px;padding:0 18px;border-radius:14px;font:900 15px/1 "Nunito","Trebuchet MS",system-ui,sans-serif;letter-spacing:.06em;color:#0f2433;background:#7fd3ff;border:2.5px solid #fff;box-shadow:0 4px 0 #2d86b5;pointer-events:auto;touch-action:manipulation}body.jet-mode #enterJetButton{display:none!important}
html body.mobile-gameplay-compact.solo-flight:not(.desktop-input) #viewport #enterJetButton{
left:auto!important;right:max(12px,var(--solo-safe-right,env(safe-area-inset-right)))!important;transform:none!important;
bottom:calc(max(18px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,150px) + 56px)!important;
min-width:54px!important;width:54px!important;height:54px!important;
padding:0!important;border-radius:50%!important;font:900 24px/1 system-ui,-apple-system,sans-serif!important;
}
@media(max-height:340px){html body.mobile-gameplay-compact.solo-flight:not(.desktop-input) #viewport #enterJetButton{
bottom:calc(max(18px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,150px) + 27px)!important
}}
html body.jet-mode #viewport #footHud #footFire{display:block!important;pointer-events:auto!important}`;
const MARKUP=`<svg class="jet-svg" aria-hidden="true"><line class="jet-city-line" x1="0" y1="0" x2="0" y2="0"/><circle class="jet-city-dot" r="3.5" cx="-20" cy="-20"/><g class="jet-fpm"><circle r="7" cx="0" cy="0"/><line x1="-17" y1="0" x2="-7" y2="0"/><line x1="7" y1="0" x2="17" y2="0"/><line x1="0" y1="-7" x2="0" y2="-13"/></g></svg><div class="jet-city"><b data-k="city"></b><small data-k="cityd"></small></div><div class="jet-read jet-left"><small>SPD</small><b data-k="spd">0</b><small>KM/H</small><b data-k="mach">M 0.00</b><b data-k="aoa">α 0°</b></div><div class="jet-read jet-right"><small>ALT</small><b data-k="alt">0</b><small>M</small><b data-k="g">1.0 G</b><b data-k="hp">HP 100</b></div><div class="jet-mode-row"><b data-k="mode">HOVER</b></div><div class="jet-thr"><i></i><span>SCHUB</span></div>
<div class="jet-btns"><button type="button" data-a="mode">⇄ FLUG</button><button type="button" data-a="rocket">RAKETE</button><button type="button" data-a="bomb">BOMBE</button><button type="button" data-a="cam">CAM</button><button type="button" data-a="exit">EJECT</button></div>`;
const SOUND=340,HP_MAX=400;
let game=null,input=null,hud=null,last=0,padLB=false,padLT=false,padRT=false,padRB=false,rocketSelected=false;
// Production jet weapons: R / LT / RAKETE arms a rocket and the next gun
// trigger (LMB, SPACE, RT) launches it; B / RB / BOMBE drops a bomb.
function selectRocket(){if(!game||game.mode!=="jet")return false;rocketSelected=!rocketSelected;globalThis.__nativeJetRocketSelected=rocketSelected;render(true);return rocketSelected;}
function launchSelected(){if(!rocketSelected)return false;const fired=globalThis.__nativeJetOrdnance?.launchJet?.("rocket");if(fired){rocketSelected=false;globalThis.__nativeJetRocketSelected=false;render(true);}return fired;}
function dropBomb(){return Boolean(game?.mode==="jet"&&globalThis.__nativeJetOrdnance?.launchJet?.("bomb"));}
globalThis.__nativeJetWeapons={selectRocket,dropBomb,launchSelected,get rocketSelected(){return rocketSelected;}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const q=k=>hud?.querySelector(`[data-k=${k}]`);
const setText=(el,t)=>{if(el&&el.textContent!==t)el.textContent=t;};
export function toggleJetFlightMode(){const af=game?.jetAirframe;if(!af||game.mode!=="jet")return false;setFlightMode(af,af.mode==="hover"?"flight":"hover");render(true);return true;}
function mount(){
  const view=document.getElementById("viewport");if(!view||document.getElementById("jetHud"))return;
  hud=document.createElement("div");hud.id="jetHud";hud.innerHTML=MARKUP;view.appendChild(hud);
  const st=document.createElement("style");st.dataset.jetMode="v3";st.textContent=CSS;document.head.appendChild(st);
  const eject=hud.querySelector('[data-a="exit"]');hud.appendChild(eject);
  let ejectAt=0,ejectPointer=-1;
  eject.addEventListener("pointerdown",e=>{e.stopPropagation();if(e.pointerType==="mouse")return;e.preventDefault();ejectAt=performance.now();ejectPointer=e.pointerId;eject.dataset.holding="1";eject.setPointerCapture?.(e.pointerId);});
  const endEject=e=>{if(ejectPointer!==e.pointerId)return;e.stopPropagation();const held=performance.now()-ejectAt;ejectPointer=-1;eject.dataset.holding="0";if(e.type==="pointerup"&&held>=650)globalThis.__nativeVehicleEntry?.exitVehicle?.({eject:true});};
  for(const n of ["pointerup","pointercancel","lostpointercapture"])eject.addEventListener(n,endEject);
  eject.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(e.detail===0||document.body.classList.contains("desktop-input"))globalThis.__nativeVehicleEntry?.exitVehicle?.({eject:true});});
  for(const btn of hud.querySelectorAll(".jet-btns button")){const a=btn.dataset.a;if(a==="exit")continue;
    btn.addEventListener("pointerdown",e=>e.stopPropagation());
    btn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();
      if(a==="mode")toggleJetFlightMode();else if(a==="cam")input?.cycleCamera?.();
      else if(a==="rocket")globalThis.__nativeJetWeapons?.selectRocket?.();else if(a==="bomb")globalThis.__nativeJetWeapons?.dropBomb?.();});}
}
// ---- flight path marker and the town cue (jet_mode.mjs renderCityCue)
const R=6378137,RAD=Math.PI/180;
function origin(){const k=String(game?.world?.osmOriginKey||"").split(":").map(Number);return k.length===2&&k.every(Number.isFinite)?{lon:k[0],lat:k[1]}:null;}
function geoOf(x,y){const o=origin();if(!o)return null;const cos=Math.max(.01,Math.cos(o.lat*RAD));return [o.lon+x/(RAD*R*cos),o.lat+y/(RAD*R)];}
function localOf(lon,lat){const o=origin();if(!o)return null;const cos=Math.max(.01,Math.cos(o.lat*RAD));return [(lon-o.lon)*RAD*R*cos,(lat-o.lat)*RAD*R];}
function screenOf(pt,W,H){
  const r=game?.world?.renderer;if(!r?.eye||!r?.target)return null;
  let vp;try{vp=multiply4(perspective(r.fov,W/Math.max(1,H),r.near||.1,r.far||5000),lookAt(r.eye,r.target,r.up||[0,0,1]));}catch{return null;}
  const x=vp[0]*pt[0]+vp[4]*pt[1]+vp[8]*pt[2]+vp[12],y=vp[1]*pt[0]+vp[5]*pt[1]+vp[9]*pt[2]+vp[13],w=vp[3]*pt[0]+vp[7]*pt[1]+vp[11]*pt[2]+vp[15];
  if(Math.abs(w)<1e-6)return null;const front=w>0;let sx=(x/w*.5+.5)*W,sy=(-y/w*.5+.5)*H;if(!front){sx=W-sx;sy=H-sy;}return {x:sx,y:sy,front};
}
let city=null,cityBusy=false,cityAt=-Infinity,cityFrom=null,lastCity=0;
async function lookupCity(lon,lat){cityBusy=true;cityAt=performance.now();try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=de&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`,{signal:AbortSignal.timeout?.(8000)});if(r.ok){const j=await r.json(),a=j.address||{},name=j.name||a.city||a.town||a.village||a.municipality;if(name&&Number.isFinite(+j.lon)&&Number.isFinite(+j.lat))city={name:String(name).toUpperCase(),lon:+j.lon,lat:+j.lat};}}catch{}finally{cityBusy=false;}}
function renderCue(pose,v){
  const view=document.getElementById("viewport"),svg=hud?.querySelector(".jet-svg");if(!view||!svg||!pose?.position)return;
  const W=view.clientWidth,H=view.clientHeight;if(svg.dataset.vb!==`${W}x${H}`){svg.dataset.vb=`${W}x${H}`;svg.setAttribute("viewBox",`0 0 ${W} ${H}`);}
  const line=svg.querySelector(".jet-city-line"),dot=svg.querySelector(".jet-city-dot"),fpm=svg.querySelector(".jet-fpm"),nameEl=q("city"),dEl=q("cityd");
  const p=pose.position,s=Math.hypot(v[0],v[1],v[2]);
  if(s>15){const t=screenOf([p[0]+v[0]*4,p[1]+v[1]*4,p[2]+v[2]*4],W,H);if(t?.front){fpm.setAttribute("transform",`translate(${t.x.toFixed(1)},${t.y.toFixed(1)})`);fpm.style.display="";}else fpm.style.display="none";}else fpm.style.display="none";
  const now=performance.now();if(now-lastCity<240)return;lastCity=now;
  const g=geoOf(p[0],p[1]);if(!g){line.style.display=dot.style.display="none";setText(nameEl,"");setText(dEl,"");return;}
  if(!cityBusy&&(now-cityAt>25000||!cityFrom||Math.hypot(p[0]-cityFrom[0],p[1]-cityFrom[1])>1500)){cityFrom=[p[0],p[1]];lookupCity(g[0],g[1]);}
  if(!city){line.style.display=dot.style.display="none";return;}const m=localOf(city.lon,city.lat);if(!m){line.style.display=dot.style.display="none";return;}
  const dist=Math.hypot(m[0]-p[0],m[1]-p[1]),gz=Number(game.world?.terrain?.heightAt?.(m[0],m[1]))||0;setText(nameEl,city.name);
  setText(dEl,dist<600?"ÜBER DEM ZENTRUM":`${(dist/1000).toFixed(dist>=10000?0:1).replace(".",",")} KM`);
  const t=screenOf([m[0],m[1],gz+20],W,H);if(!t||dist<600){line.style.display=dot.style.display="none";return;}
  let x=t.x,y=t.y;const cx=W/2,cy=H/2;if(!t.front||x<0||x>W||y<0||y>H){const dx=x-cx,dy=y-cy,k=Math.min((W*.46)/Math.max(1,Math.abs(dx)),(H*.42)/Math.max(1,Math.abs(dy)));x=cx+dx*k;y=cy+dy*k;}
  const L=Math.hypot(x-cx,y-cy)||1,sx=cx+(x-cx)/L*26,sy=cy+(y-cy)/L*26;
  line.setAttribute("x1",sx.toFixed(1));line.setAttribute("y1",sy.toFixed(1));line.setAttribute("x2",x.toFixed(1));line.setAttribute("y2",y.toFixed(1));
  dot.setAttribute("cx",x.toFixed(1));dot.setAttribute("cy",y.toFixed(1));line.style.display=L>34?"":"none";dot.style.display="";
}
function render(force=false){
  if(!hud||!game||game.mode!=="jet")return;
  const now=performance.now();if(!force&&now-last<80)return;last=now;
  const af=game.jetAirframe||{},T=af.tele||{},pose=game.rigids?.pose?.("player-jet");
  const v=pose?.velocity||[0,0,0],s=Math.hypot(v[0],v[1],v[2]),m=s/SOUND;
  setText(q("spd"),String(Math.round(s*3.6)));const mb=q("mach");if(mb){mb.textContent=`M ${m.toFixed(2)}`;mb.dataset.super=m>=1?"1":"0";}
  setText(q("alt"),String(Math.round(Number(T.agl)||0)));setText(q("g"),`${(Number(T.nz)||1).toFixed(1)} G`);
  const aoa=q("aoa"),a=s>20?(Number(T.alpha)||0)*57.3:0;if(aoa){aoa.textContent=`α ${Math.round(a)}°`;aoa.dataset.high=a>19?"1":"0";}
  const ab=af.mode==="flight"&&af.lever>.86;
  setText(q("mode"),af.landed?"GELANDET":af.mode==="flight"?(Math.cos(af.nozzle||0)<.95?"ÜBERGANG":ab?"FLUG · AB":"FLUG"):(s>30?"BREMSEN":"SCHWEBEN"));
  const hpV=Number(game.gameplayState?.jet?.hp);const pct=Math.round((Number.isFinite(hpV)?hpV:HP_MAX)/HP_MAX*100);const hp=q("hp");if(hp){hp.textContent=`HP ${pct}`;hp.dataset.low=pct<40?"1":"0";}
  const mode=hud.querySelector('.jet-btns [data-a=mode]');if(mode){const t=af.mode==="flight"?"⇄ SCHWEBEN":"⇄ FLUG";setText(mode,t);mode.dataset.flight=af.mode==="flight"?"1":"0";}
  const exit=hud.querySelector('[data-a=exit]');if(exit){const landed=af.landed||((af.contacts||0)>=2&&s<4);setText(exit,landed?"AUSSTEIGEN":"EJECT");}
  renderCue(pose,v);
  const rocket=hud.querySelector(".jet-btns [data-a=rocket]");if(rocket){const left=Number(globalThis.__nativeJetOrdnance?.rocketReadyInMs)||0;rocket.dataset.ready=left>0?"0":"1";rocket.dataset.selected=rocketSelected?"1":"0";setText(rocket,left>0?`RELOAD ${(left/1000).toFixed(1)}s`:rocketSelected?"2 · FIRE":"1 · ROCKET");rocket.dataset.armed=rocketSelected?"1":"0";}
  const thr=hud.querySelector(".jet-thr i");if(thr)thr.style.height=`${Math.round((af.mode==="flight"?(af.lever||0):clamp((af.thrust||0)/JET_SPEC.thrustMax,0,1))*100)}%`;
}
function onKey(e){
  if(!game||game.mode!=="jet"||e.metaKey||e.ctrlKey)return;
  if(e.target instanceof Element&&e.target.closest("input,textarea,select,[contenteditable]"))return;
  if(e.code==="KeyV"&&!e.repeat){toggleJetFlightMode();e.preventDefault();e.stopImmediatePropagation();}
  else if(e.code==="KeyR"&&!e.repeat){selectRocket();e.preventDefault();e.stopImmediatePropagation();}
  else if(e.code==="KeyB"){dropBomb();e.preventDefault();e.stopImmediatePropagation();}
  else if(e.code==="Space"&&rocketSelected&&!e.repeat){launchSelected();e.preventDefault();e.stopImmediatePropagation();}
}
function onMouse(e){if(e.button===0&&game?.mode==="jet"&&rocketSelected&&document.body.classList.contains("solo-flight")){launchSelected();}}
export function installNativeJetHud(runtime,{input:owner=null}={}){
  game=runtime;input=owner;if(typeof document==="undefined")return;
  mount();addEventListener("keydown",onKey,{capture:true});addEventListener("mousedown",onMouse,{capture:true});
}
export function tickNativeJetHud(){
  if(!game)return;
  // Xbox LB: VTOL hover / flight, as the production Battlefield jet layout.
  const pad=game.mode==="jet"?[...(navigator.getGamepads?.()||[])].find(g=>g&&g.connected):null;
  const lb=Boolean(pad?.buttons?.[4]?.pressed);if(lb&&!padLB)toggleJetFlightMode();padLB=lb;
  const lt=(pad?.buttons?.[6]?.value||0)>.5;if(lt&&!padLT)selectRocket();padLT=lt;
  const rt=(pad?.buttons?.[7]?.value||0)>.4;if(rt&&!padRT&&rocketSelected)launchSelected();padRT=rt;
  const rb=Boolean(pad?.buttons?.[5]?.pressed);if(rb&&!padRB)dropBomb();padRB=rb;
  if(game.mode!=="jet"&&rocketSelected){rocketSelected=false;globalThis.__nativeJetRocketSelected=false;}
  render(false);
}
