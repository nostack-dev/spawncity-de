// Production fighter_jets.mjs on the native renderer.
//  * Ambient: every 75–150 s a pair of jets screams over the player heading
//    north, 55–85 m above the roofs at 255 m/s. The roar is computed from the
//    retarded position (speed of sound 343 m/s) with real Doppler, so it
//    arrives late, peaks as a blast and drops in pitch. Close passes shake the
//    camera.
//  * AIR STRIKE (J / the ✈ STRIKE button): mark a spot, a laser comes down,
//    the jets come in from the south and drop a stick of ten bombs across it
//    (real blasts through arondight:world-explosion), 30 s cooldown.
// Same constants, audio synthesis, UI markup and CSS as production; the jet is
// the baked production fighter mesh (nose +Y).
import {addTrauma} from "./camera_shake.mjs";
import {getSharedCombatAudioContext,playCombatAudio} from "./combat_audio_bank.mjs";
import {ORIGINAL_JET} from "./native_actor_meshes.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";
export const FIGHTER_JETS_VERSION="low-pass-jets+air-strike-v1-native";
const SPEED=255,SOUND=343,ALT_MIN=55,ALT_MAX=85,SPAN=2600,AMBIENT_MIN_S=75,AMBIENT_MAX_S=150,STRIKE_COOLDOWN_MS=30000,BOMB_RADIUS=17,BOMB_DAMAGE=170,STICK=10,STICK_LEN=130;
const RUN_COLOR=0x3fa9ff,RUN_LEN=STICK_LEN+40,CHEVRONS=9,BEAM_H=420;
let game=null,installed=false,jets=[],bombs=[],flares=[],blasts=[],nextAmbient=performance.now()+40000+Math.random()*40000,lastFrame=performance.now(),lastStrike=-Infinity,serial=0;
let ctx=null,jetBuffer=null,master=null;const strikes=[];
const viewport=()=>document.getElementById("viewport");
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function light(p,o){try{game?.world?.requestLight?.(p,{...o,intensity:Math.min(100,o.intensity*16/46)});}catch{}}
// ------------------------------------------------------------ audio (production synthesis)
function ensureAudio(){
  try{ctx=getSharedCombatAudioContext();if(!ctx)return null;if(!master){master=ctx.createGain();master.gain.value=1;const comp=ctx.createDynamicsCompressor();comp.threshold.value=-10;comp.ratio.value=4;master.connect(comp);comp.connect(ctx.destination);}
    if(!jetBuffer){const sr=ctx.sampleRate,n=Math.floor(sr*4),b=ctx.createBuffer(1,n,sr),d=b.getChannelData(0);let lp=0,lp2=0,br=0;
      for(let i=0;i<n;i++){const t=i/sr,w=Math.random()*2-1;lp+=(w-lp)*.08;lp2+=(lp-lp2)*.02;br+=(w-br)*.6;
        const whine=Math.sin(2*Math.PI*1180*t+Math.sin(2*Math.PI*3*t)*2)*.05+Math.sin(2*Math.PI*2360*t)*.025;d[i]=lp2*2.4+lp*.9+(w-br)*.18+whine;}
      const f=Math.floor(sr*.05);for(let i=0;i<f;i++){const a=i/f;d[n-f+i]=d[n-f+i]*(1-a)+d[i]*a;}
      let peak=0;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(d[i]));for(let i=0;i<n;i++)d[i]/=peak||1;jetBuffer=b;}
    return ctx;}catch{return null;}
}
function startJetVoice(jet){const c=ensureAudio();if(!c||c.state!=="running"||jet.voice)return;const src=c.createBufferSource();src.buffer=jetBuffer;src.loop=true;src.loopStart=0;src.loopEnd=jetBuffer.duration;const lp=c.createBiquadFilter();lp.type="lowpass";lp.frequency.value=1500;const g=c.createGain();g.gain.value=0;src.connect(lp);lp.connect(g);g.connect(master);src.start(0,Math.random()*3);jet.voice={src,lp,g};}
function stopJetVoice(jet){const v=jet.voice;if(!v)return;try{v.g.gain.setTargetAtTime(0,ctx.currentTime,.3);v.src.stop(ctx.currentTime+1.2);}catch{}jet.voice=null;}
function listenerPos(){const W=globalThis.__arondightWalkMode,p=W?.position;if(game?.mode==="foot"&&p)return [p.x,p.y,p.z];const e=game?.world?.camera?.eye;return e?[...e]:null;}
const jetPosAt=(jet,t)=>[jet.x,jet.y0+SPEED*(t-jet.t0)/1000,jet.z];
function updateJetAudio(jet,now){
  const L=listenerPos();if(!L||!jet.voice)return;
  let te=now;for(let i=0;i<4;i++){te=now-dist(jetPosAt(jet,te),L)/SOUND*1000;}
  const p=jetPosAt(jet,te),d=Math.max(8,dist(p,L)),dy=(L[1]-p[1])/(dist(p,L)||1),vr=SPEED*dy,doppler=Math.max(.45,Math.min(2.6,SOUND/(SOUND-vr)));
  const started=te>=jet.t0-1500,gain=started?Math.min(1.8,(85/d)**1.35)*.9*.85:0,t=ctx.currentTime;
  jet.voice.g.gain.setTargetAtTime(gain,t,.05);jet.voice.src.playbackRate.setTargetAtTime(doppler*(.92+jet.pitch*.16),t,.05);jet.voice.lp.frequency.setTargetAtTime(Math.min(9000,900+60000/d),t,.06);
  jet.heardD=d;
}
// ------------------------------------------------------------ geometry
function G(){return {p:[],n:[],c:[]};}
const f32=b=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)});
function cone(b,r,h,col,seg=10){for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2;for(const v of [[Math.cos(a0)*r,0,Math.sin(a0)*r],[Math.cos(a1)*r,0,Math.sin(a1)*r],[0,-h,0]]){b.p.push(...v);b.n.push(v[0],0,v[2]);b.c.push(...col);}}}
function sphere(b,r,col,ws=14,hs=10){const P=(i,j)=>{const th=j/hs*Math.PI,ph=i/ws*Math.PI*2,n=[Math.sin(th)*Math.cos(ph),Math.sin(th)*Math.sin(ph),Math.cos(th)];return [n.map(v=>v*r),n];};
  for(let j=0;j<hs;j++)for(let i=0;i<ws;i++){const a=P(i,j),c=P(i+1,j),d=P(i+1,j+1),e=P(i,j+1);for(const [v,n] of [a,e,d,a,d,c]){b.p.push(...v);b.n.push(...n);b.c.push(...col);}}}
function capsule(b,r,len,col){const seg=8,h=len/2;for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
  for(const [v,n] of [[[c0*r,s0*r,-h],[c0,s0,0]],[[c1*r,s1*r,-h],[c1,s1,0]],[[c1*r,s1*r,h],[c1,s1,0]],[[c0*r,s0*r,-h],[c0,s0,0]],[[c1*r,s1*r,h],[c1,s1,0]],[[c0*r,s0*r,h],[c0,s0,0]]]){b.p.push(...v);b.n.push(...n);b.c.push(...col);}
  for(const z of [h,-h])for(const [v,n] of [[[0,0,z+Math.sign(z)*r],[0,0,Math.sign(z)]],[[c0*r,s0*r,z],[c0,s0,0]],[[c1*r,s1*r,z],[c1,s1,0]]]){b.p.push(...v);b.n.push(...n);b.c.push(...col);}}}
function chevron(b,col){const P=[[-2.2,-1.1],[0,1.1],[2.2,-1.1],[1.4,-1.1],[0,.2],[-1.4,-1.1]],T=[[0,1,4],[0,4,5],[1,2,3],[1,3,4]];for(const t of T)for(const i of t){b.p.push(P[i][0],P[i][1],0);b.n.push(0,0,1);b.c.push(...col);}}
function tube(b,r,col,seg=10){for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);for(const v of [[c0,s0,-1],[c1,s1,-1],[c1,s1,0],[c0,s0,-1],[c1,s1,0],[c0,s0,0]]){b.p.push(v[0]*r,v[1]*r,v[2]);b.n.push(v[0],v[1],0);b.c.push(...col);}}}
function disc(b,r,col,seg=20){for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2;for(const v of [[0,0,0],[Math.cos(a0)*r,Math.sin(a0)*r,0],[Math.cos(a1)*r,Math.sin(a1)*r,0]]){b.p.push(...v);b.n.push(0,0,1);b.c.push(...col);}}}
const FLAME=(()=>{const b=G();cone(b,.42,3.2,hex(0xffa047));return f32(b);})();
const BOMB=(()=>{const b=G();capsule(b,.22,1.1,hex(0x3b4135));return f32(b);})();
const CORE=(()=>{const b=G();sphere(b,1,hex(0xffc070),16,12);return f32(b);})();
const SMOKE=(()=>{const b=G();sphere(b,1,hex(0x2c2724),14,10);return f32(b);})();
const CHEV=(()=>{const b=G();chevron(b,hex(RUN_COLOR));return f32(b);})();
const TUBE=c=>{const b=G();tube(b,1,hex(c));return f32(b);},DISC=c=>{const b=G();disc(b,2.6,hex(c));return f32(b);},BALL=c=>{const b=G();sphere(b,.35,hex(c),10,8);return f32(b);};
const T=(x,y,z,s=1)=>[s,0,0,0,0,s,0,0,0,0,s,0,x,y,z,1];
const TS=(x,y,z,sx,sy,sz)=>[sx,0,0,0,0,sy,0,0,0,0,sz,0,x,y,z,1];
function alongZ(dir,p,s=1){const d=dir.map(v=>v/(Math.hypot(...dir)||1)),ref=Math.abs(d[2])<.95?[0,0,1]:[1,0,0];let x=[ref[1]*d[2]-ref[2]*d[1],ref[2]*d[0]-ref[0]*d[2],ref[0]*d[1]-ref[1]*d[0]];const l=Math.hypot(...x)||1;x=x.map(v=>v/l);const y=[d[1]*x[2]-d[2]*x[1],d[2]*x[0]-d[0]*x[2],d[0]*x[1]-d[1]*x[0]];return [...x.map(v=>v*s),0,...y.map(v=>v*s),0,...d.map(v=>v*s),0,...p,1];}
// ------------------------------------------------------------ flights
function launch(cx,cy,{strike=null,offset=0,alt=null,at=performance.now()}={}){
  const z=ground(cx,cy)+(alt??(ALT_MIN+Math.random()*(ALT_MAX-ALT_MIN))),id=`jet-${(++serial).toString(36)}`;
  for(const [k,dx,dy] of [[0,0,0],[1,-26,-42]])jets.push({id:`${id}-${k}`,x:cx+offset+dx,y0:cy-SPAN+dy,z:z+k*6,t0:at,strike:k===0?strike:null,dropped:0,pitch:Math.random()});
  return true;
}
function bomb(from,to,t0){bombs.push({from,to,t0,dur:1500+Math.random()*250});}
function updateJets(now){
  for(let i=jets.length-1;i>=0;i--){const j=jets[i],p=jetPosAt(j,now);j.p=p;light(p,{color:0xff8a3a,intensity:6+Math.random()*4,distance:40});
    if(!j.voice)startJetVoice(j);updateJetAudio(j,now);
    const L=listenerPos();if(L){const d=dist(p,L);if(d<160&&!j.shook&&j.heardD<170){j.shook=true;addTrauma?.(Math.min(.85,.35+60/d));}}
    if(j.strike&&j.dropped<STICK){const s=j.strike,ahead=s.y-STICK_LEN/2-p[1];if(ahead<380){for(let k=j.dropped;k<STICK;k++){const tx=s.x+(Math.random()-.5)*5,ty=s.y-STICK_LEN/2+k*STICK_LEN/(STICK-1);bomb([p[0],p[1]-2,p[2]-1.2],[tx,ty,ground(tx,ty)],now+k*(STICK_LEN/(STICK-1))/SPEED*1000);}j.dropped=STICK;}}
    if(p[1]>j.y0+2*SPAN){stopJetVoice(j);jets.splice(i,1);}}
  for(let i=bombs.length-1;i>=0;i--){const b=bombs[i],t=(now-b.t0)/b.dur;if(t<0){b.p=null;continue;}const u=Math.min(1,t);
    b.p=[b.from[0]+(b.to[0]-b.from[0])*u,b.from[1]+(b.to[1]-b.from[1])*u,b.from[2]+(b.to[2]-b.from[2])*u*u];b.dir=[(b.to[0]-b.from[0]),(b.to[1]-b.from[1]),(b.to[2]-b.from[2])*2*u];
    if(t>=1){bombs.splice(i,1);explode(b.to,now);}}
}
function explode(p,now,o={}){
  blasts.push({p:[...p],born:now,scale:Number(o.scale)||1});
  window.dispatchEvent(new CustomEvent("arondight:world-explosion",{detail:{position:[p[0],p[1],p[2]+.4],radiusM:o.radiusM??BOMB_RADIUS,maxDamage:o.maxDamage??BOMB_DAMAGE,kind:o.kind||"airstrike",id:`${o.kind||"airstrike"}-${now}`}}));
  try{const c=ensureAudio(),L=listenerPos(),d=L?dist(L,p):100;if(c)setTimeout(()=>playCombatAudio(c,"explosion",{destination:master,gain:Math.min(1.6,40/(10+d)),playbackRate:.7+Math.random()*.15}),d/SOUND*1000);}catch{}
}
// ------------------------------------------------------------ air strike
function aimRay(){const cam=game?.world?.camera;if(!cam?.eye)return null;const d=[cam.target[0]-cam.eye[0],cam.target[1]-cam.eye[1],cam.target[2]-cam.eye[2]],l=Math.hypot(...d)||1;return {origin:[...cam.eye],direction:d.map(v=>v/l)};}
function groundOnRay(ray,far){if(!ray)return null;let best=null;try{const h=game.rigids?.raycast?.(ray.origin,ray.direction,far);if(h?.point&&(!h.kind||h.kind==="terrain"))best=[...h.point];}catch{}
  if(!best){const o=ray.origin,d=ray.direction;for(let t=2;t<far;t+=Math.max(1,t*.04)){const x=o[0]+d[0]*t,y=o[1]+d[1]*t,z=o[2]+d[2]*t;if(z<=ground(x,y)){best=[x,y,z];break;}}}
  return best?[best[0],best[1],ground(best[0],best[1])]:null;}
function aimPoint(){const r=aimRay();if(!r)return null;return groundOnRay(r,1500)||[r.origin[0]+r.direction[0]*180,r.origin[1]+r.direction[1]*180,0].map((v,i)=>i===2?ground(r.origin[0]+r.direction[0]*180,r.origin[1]+r.direction[1]*180):v);}
function screenGround(clientX,clientY){const rd=game?.world?.renderer,cv=rd?.canvas||document.querySelector("#viewport canvas");if(!rd||!cv)return null;const r=cv.getBoundingClientRect();
  try{const ray=rd.getScreenRay((clientX-r.left)*rd.width/r.width,(clientY-r.top)*rd.height/r.height);return groundOnRay(ray,2500);}catch{return null;}}
function myStrikeColor(){try{const me=globalThis.__arondightVsMultiplayer?.scores?.()?.find?.(x=>x.self);if(me?.color)return Number.parseInt(String(me.color).replace("#",""),16);}catch{}return 0xff2a1a;}
function flare(p,now,color=myStrikeColor()){flares.push({p:[...p],born:now,until:now+9000,color,run:{born:now,until:now+5200}});}
export function callAirStrike(target=null){
  const now=performance.now();if(now-lastStrike<STRIKE_COOLDOWN_MS)return false;let p=target||aimPoint();if(!p)return false;p=[+p[0],+p[1],ground(+p[0],+p[1])];if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))return false;
  lastStrike=now;strikes.push({x:p[0],y:p[1],until:now+9000});flare(p,now);const arrive=now+3500;
  launch(p[0],p[1],{strike:{x:p[0],y:p[1]},offset:0,alt:70,at:arrive-SPAN/SPEED*1000+(380+STICK_LEN/2)/SPEED*1000});renderButton();return true;
}
let targeting=false,overlay=null,aimNow=null,placed=null,placedAt=0,laserShown=false;
const beepCtx=()=>{try{return getSharedCombatAudioContext({resume:true});}catch{return null;}};
function lockInput(ms){globalThis.__arondightWeaponLockUntil=Math.max(Number(globalThis.__arondightWeaponLockUntil)||0,performance.now()+ms);}
function beep(freqs,dur=.09,gain=.12){const c=beepCtx();if(!c||c.state!=="running")return;let t=c.currentTime;for(const f of freqs){const o=c.createOscillator(),g=c.createGain();o.type="square";o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.008);g.gain.setValueAtTime(gain,t+dur-.02);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.02);t+=dur+.035;}}
function playerDown(){return Boolean(globalThis.__arondightPlayerDamageModel?.dead||document.body.classList.contains("player-dead"));}
function place(p){placed=p;placedAt=performance.now();laserShown=true;beep([740,990],.06,.11);overlay?.classList.add("placed");renderButton();}
function confirmStrike(){if(playerDown()){setTargeting(false);return false;}if(!placed&&targeting){const p=aimPoint();if(p)place(p);}if(!placed){beep([220],.16,.1);return false;}const p=[...placed];lockInput(600);if(callAirStrike(p)){beep([880,1175,1568],.08,.12);setTargeting(false,{keepLaser:true});return true;}beep([220],.16,.1);return false;}
function setTargeting(on,{keepLaser=false}={}){if(on&&playerDown())on=false;
  if(on&&performance.now()-lastStrike<STRIKE_COOLDOWN_MS){beep([220],.18,.1);return;}targeting=Boolean(on);document.body.classList.toggle("air-strike-targeting",targeting);lockInput(500);
  if(targeting){if(!overlay){overlay=document.createElement("dialog");overlay.id="airStrikeTargeting";overlay.innerHTML="<b>ZIEL MARKIEREN</b><small data-as-hint>Tippen = Laser auf das Ziel · die Jets kommen</small><div class=\"as-actions\"><button type=\"button\" data-a=\"cancel\">✕ ABBRECHEN</button></div>";(viewport()||document.body).appendChild(overlay);
      const stop=e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();};
      for(const btn of overlay.querySelectorAll(".as-actions button")){btn.addEventListener("pointerdown",stop);btn.addEventListener("pointerup",e=>{stop(e);if(btn.dataset.a==="go")confirmStrike();else{beep([330],.08,.1);setTargeting(false);}});btn.addEventListener("click",stop);}
      overlay.addEventListener("pointermove",e=>{if(e.pointerType!=="mouse"||e.target.closest?.(".as-actions"))return;const p=screenGround(e.clientX,e.clientY);if(p)aimNow=p;});
      overlay.addEventListener("pointerdown",e=>{if(e.target.closest?.(".as-actions"))return;stop(e);overlay.dataset.down="1";});
      overlay.addEventListener("pointerup",e=>{if(e.target.closest?.(".as-actions"))return;stop(e);if(overlay.dataset.down!=="1")return;overlay.dataset.down="0";const p=screenGround(e.clientX,e.clientY);if(p){aimNow=null;place(p);confirmStrike();}else beep([220],.12,.08);});
      overlay.addEventListener("click",stop);overlay.addEventListener("contextmenu",stop);}
    overlay.classList.remove("placed");const hint=overlay.querySelector("[data-as-hint]");if(hint)hint.textContent=document.pointerLockElement?"Fadenkreuz aufs Ziel · KLICK / J = Laser + Jets · ESC abbrechen":"Tippen = Laser auf das Ziel · die Jets kommen";overlay.show?.();overlay.setAttribute("open","");beep([660,990],.07,.1);aimNow=null;placed=null;laserShown=false;}
  else{overlay?.close?.();overlay?.removeAttribute("open");aimNow=null;if(!keepLaser){placed=null;laserShown=false;}}
  renderButton();
}
function mountButton(){
  const view=viewport();if(!view||document.getElementById("airStrikeButton"))return;const b=document.createElement("button");b.id="airStrikeButton";b.type="button";b.setAttribute("aria-label","Call air strike on the aimed spot");b.innerHTML="<span>✈</span><small>STRIKE</small>";
  b.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();lockInput(500);setTargeting(!targeting);});b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();});view.appendChild(b);
  const st=document.createElement("style");st.dataset.airStrike="v1";st.textContent=`#airStrikeButton{position:absolute;z-index:22;left:calc(max(12px,var(--solo-safe-left,env(safe-area-inset-left))) + min(25vw,148px)*.5 - 29px);bottom:calc(max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,148px) + 18px);width:58px;height:58px;border-radius:50%;border:2px solid #ffffffbb;background:#0d1118b8;color:#fff;font:800 10px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;touch-action:none;pointer-events:auto;overflow:hidden}#airStrikeButton span{font-size:20px;line-height:1}body.air-strike-targeting #airStrikeButton{z-index:41;border-color:#ff3a2a;background:#3a0d08e0}#airStrikeTargeting{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;z-index:40;cursor:crosshair;touch-action:none;color:#fff;font-family:Inter,system-ui,sans-serif}#airStrikeTargeting::backdrop{background:transparent!important}html body #airStrikeTargeting,html body #airStrikeTargeting[open]{background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:0!important;outline:none!important}#airStrikeTargeting b{position:absolute;left:50%;top:max(58px,9%);transform:translateX(-50%);font:900 13px/1 Inter,sans-serif;letter-spacing:.16em;color:#ff4a3a;text-shadow:0 1px 3px #000,0 0 8px #000}#airStrikeTargeting small{position:absolute;left:50%;top:calc(max(58px,9%) + 18px);transform:translateX(-50%);font:600 12px/1.2 Inter,sans-serif;opacity:.85;white-space:nowrap;text-shadow:0 1px 3px #000}#airStrikeTargeting .as-actions{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 12px);transform:translateX(-50%);display:flex;gap:12px}#airStrikeTargeting .as-actions button{pointer-events:auto;min-width:58px;height:48px;padding:0 18px;border-radius:24px;border:2px solid #ffffffaa;background:#0d1118d0;color:#fff;font:900 14px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;touch-action:none}#airStrikeTargeting .as-actions button[data-a="go"]{opacity:.45;border-color:#ff3a2a}#airStrikeTargeting.placed .as-actions button[data-a="go"]{opacity:1;background:#a3170dd8}#airStrikeButton[data-ready="0"]{opacity:.55}#airStrikeButton::after{content:"";position:absolute;left:0;bottom:0;height:3px;width:var(--cool,100%);background:#ff7a1a}body.player-driving #airStrikeButton{display:none}`;document.head.appendChild(st);
}
function renderButton(now=performance.now()){const b=document.getElementById("airStrikeButton");if(!b)return;{const down=playerDown();if(b.disabled!==down)b.disabled=down;if(down&&targeting)setTargeting(false);}const k=Math.min(1,(now-lastStrike)/STRIKE_COOLDOWN_MS);const r=k>=1?"1":"0";if(b.dataset.ready!==r)b.dataset.ready=r;b.style.setProperty("--cool",`${Math.round(k*100)}%`);}
// ------------------------------------------------------------ draw
const shown=new Set();
function put(r,id,geo,transforms,material){if(!transforms.length){if(shown.has(id)){syncInstanced(r,id,geo,null);shown.delete(id);}return;}syncInstanced(r,id,geo,packMatrices(transforms),{material:{castShadow:false,frustumCulled:false,...material}});shown.add(id);}
const beamCache={};function beamGeos(c){return beamCache[c]??={tube:TUBE(c),disc:DISC(c),ball:BALL(c)};}
function beamParts(list,p,k,now,color,opacity){const gz=ground(p[0],p[1]),len=Math.max(.01,BEAM_H*k),top=gz+BEAM_H;const pulse=.75+.25*Math.sin(now*.018);
  list.push({c:color,kind:"tube",m:TS(p[0],p[1],top,.9,.9,len),a:opacity*.45*pulse},{c:color,kind:"tube",m:TS(p[0],p[1],top,.22,.22,len),a:Math.min(1,opacity*1.6)});
  if(k>=.999){const s=.8+.35*Math.sin(now*.012);list.push({c:color,kind:"disc",m:T(p[0],p[1],gz+.25,s),a:opacity*.9});}}
function draw(now){
  const r=game?.world?.renderer;if(!r?.upsert)return;
  put(r,"jets/fighter",ORIGINAL_JET,jets.filter(j=>j.p).map(j=>T(...j.p)),{roughness:.45,metalness:.55,castShadow:true});
  put(r,"jets/flame",FLAME,jets.filter(j=>j.p).map(j=>TS(j.p[0],j.p[1]-6,j.p[2]-.05,1,.8+Math.random()*.5,1)),{unlit:true,alphaMode:"blend",color:[1,1,1,.75],doubleSided:true});
  put(r,"jets/bombs",BOMB,bombs.filter(b=>b.p).map(b=>alongZ(b.dir.map(v=>-v),b.p)),{roughness:.6,metalness:.3});
  const cores=[],smokes=[];for(let i=blasts.length-1;i>=0;i--){const b=blasts[i],t=(now-b.born)/1000;if(t>6){blasts.splice(i,1);continue;}const e=1-Math.exp(-t*7);
    if(t<.62)cores.push(T(...b.p,(2+11*e)*b.scale));const li=Math.max(0,40*(1-t*2));if(li>0)light(b.p,{color:0xffa050,intensity:li,distance:90});
    smokes.push(T(b.p[0],b.p[1],b.p[2]+t*2.2,(3+12*Math.min(1,t*.8))*b.scale));}
  put(r,"jets/blastcore",CORE,cores,{unlit:true,alphaMode:"blend",color:[1,1,1,.8]});put(r,"jets/smoke",SMOKE,smokes,{roughness:1,alphaMode:"blend",color:[1,1,1,.6]});
  // flares, beams, run lines
  const beams=[],chev=[];
  for(let i=flares.length-1;i>=0;i--){const f=flares[i];if(now>f.until){flares.splice(i,1);continue;}const k=Math.min(1,(now-f.born)/420);beamParts(beams,f.p,1-(1-k)**3,now,f.color,.6);beams.push({c:f.color,kind:"ball",m:T(...f.p),a:1});
    light(f.p,{color:f.color,intensity:6+Math.sin(now*.05)*3,distance:30});
    if(f.run&&now<f.run.until){const t=(now-f.run.born)/1000,pulse=.55+.45*Math.sin(t*9),fade=Math.min(1,t/.4)*Math.min(1,(f.run.until-now)/600);
      for(let c=0;c<CHEVRONS;c++){const u=((c/CHEVRONS)+t*.35)%1,y=f.p[1]-RUN_LEN/2+u*RUN_LEN,s=Math.max(.01,.75*pulse*fade*Math.sin(u*Math.PI));chev.push(T(f.p[0],y,ground(f.p[0],y)+.35,1).map((v,ix)=>ix===15?1:v));chev[chev.length-1].alpha=s;}}}
  if(targeting&&!placed&&(document.pointerLockElement||globalThis.__arondightPadActive))aimNow=aimPoint();
  if(targeting&&aimNow&&!placed)beamParts(beams,aimNow,1,now,0xff5a3a,.22);
  if(laserShown&&placed){const k=Math.min(1,(now-placedAt)/420);beamParts(beams,placed,1-(1-k)**3,now,myStrikeColor(),.7);if(!targeting&&now-placedAt>3600)laserShown=false;}
  const groups={};for(const b of beams){const key=`${b.kind}:${b.c}`;(groups[key]??=[]).push(b);}
  for(const id of [...shown])if(id.startsWith("jets/beam:")&&!groups[id.slice(10)]){syncInstanced(r,id,null,null);shown.delete(id);}
  for(const [key,list] of Object.entries(groups)){const [kind,c]=key.split(":"),geo=beamGeos(Number(c))[kind],tr=new Float32Array(list.length*16),ti=new Float32Array(list.length*4);
    list.forEach((b,i)=>{tr.set(b.m,i*16);ti.set([1,1,1,b.a],i*4);});syncInstanced(r,"jets/beam:"+key,geo,tr,{tints:ti,material:{unlit:true,alphaMode:"blend",doubleSided:true,castShadow:false,frustumCulled:false,color:[1,1,1,1]}});shown.add("jets/beam:"+key);}
  if(chev.length){const tr=new Float32Array(chev.length*16),ti=new Float32Array(chev.length*4);chev.forEach((m,i)=>{tr.set(m,i*16);ti.set([1,1,1,m.alpha],i*4);});syncInstanced(r,"jets/run",CHEV,tr,{tints:ti,material:{unlit:true,alphaMode:"blend",doubleSided:true,castShadow:false,frustumCulled:false,color:[1,1,1,1]}});shown.add("jets/run");}
  else if(shown.has("jets/run")){syncInstanced(r,"jets/run",CHEV,null);shown.delete("jets/run");}
}
// ------------------------------------------------------------ loop
let lastUi=0;
export function tickNativeFighterJets(now=performance.now()){
  if(!game)return;lastFrame=now;
  if(now-lastUi>200){lastUi=now;mountButton();renderButton(now);}
  if(now>nextAmbient){nextAmbient=now+(AMBIENT_MIN_S+Math.random()*(AMBIENT_MAX_S-AMBIENT_MIN_S))*1000;const L=listenerPos();if(L)launch(L[0],L[1],{offset:(Math.random()-.5)*160,alt:ALT_MIN+Math.random()*(ALT_MAX-ALT_MIN)});}
  if(jets.length||bombs.length)updateJets(now);if(targeting)lockInput(400);
  draw(now);
  const v=viewport();if(v){const s=`${jets.length}j/${bombs.length}b`;if(v.dataset.fighterJets!==s)v.dataset.fighterJets=s;}
}
export function installNativeFighterJets(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  addEventListener("pointerdown",e=>{if(!targeting||!document.pointerLockElement||e.pointerType!=="mouse")return;e.preventDefault();e.stopImmediatePropagation();if(e.button===0)confirmStrike();else if(e.button===2){beep([330],.08,.1);setTargeting(false);}},{capture:true,passive:false});
  addEventListener("keydown",e=>{if(e.code==="KeyJ"&&!e.repeat&&!e.metaKey&&!e.ctrlKey){if(targeting)confirmStrike();else setTargeting(true);e.preventDefault();}else if(targeting&&(e.code==="Enter"||e.code==="NumpadEnter")){confirmStrike();e.preventDefault();}else if(e.code==="Escape"&&targeting){setTargeting(false);}else if(targeting&&e.code==="Space"){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
  globalThis.__fighterJets={get targeting(){return targeting;},target(on=!targeting){setTargeting(on);return targeting;},confirm:()=>confirmStrike(),flyover(){const L=listenerPos();return L?launch(L[0],L[1],{offset:(Math.random()-.5)*100}):null;},strike:p=>callAirStrike(p?[+p.x||+p[0],+p.y||+p[1],0]:null),
    blast(p,o={}){explode(Array.isArray(p)?p:[p.x,p.y,p.z],performance.now(),o);},ready(){return performance.now()-lastStrike>=STRIKE_COOLDOWN_MS;},
    markers(){const now=performance.now();for(let i=strikes.length-1;i>=0;i--)if(now>strikes[i].until)strikes.splice(i,1);return [...strikes.map(q=>({kind:"strike",x:q.x,y:q.y})),...jets.filter(j=>j.p).map(j=>({kind:"jet",x:j.p[0],y:j.p[1]}))];},get jets(){return jets;},version:FIGHTER_JETS_VERSION};
}
