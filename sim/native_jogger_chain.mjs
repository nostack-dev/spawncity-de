// Production jogger_chain.mjs ("the running club") on the native renderer.
// Every few minutes a line of ten joggers in matching neon shirts comes along
// the sidewalk of a real street near you, single file, chanting their
// call-and-response cadence to a clap-and-stomp beat. Run the line over with
// the car, shoot or blast them: every jogger counts up a streak; the whole
// line calls out "KOMPLETTE LAUFGRUPPE!" with a jingle. They turn round at the
// street's ends and jog off after a minute and a half. Same constants, lines,
// beat, banner, streak and hit rules as production.
import {worldOption,WORLD_OPTIONS_EVENT} from "./world_options.mjs";
import {spawnNativeRagdoll} from "./native_ragdoll.mjs";
import {nativeProjectedRoads} from "./native_world_impacts.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";
export const JOGGER_CHAIN_VERSION="running-club-v2-jog-gait-native";
const N=10,GAP_M=1.35,SPEED=2.9,LIFE_MS=95000,FIRST_MS=60000,EVERY_MS=[170000,280000],STREAK_WINDOW_MS=12000;
const SHIRT=0xd8ff3a,SHORTS=0x1c2a3a,SHOES=0xf4f4f0,SKINS=[0xe0b08c,0xc48e6c,0xa87052,0x7b4a33,0xd2a27e],HAIR=[0x2a211b,0x4a3324,0x6b5a3e,0x1a1614];
const CALLS=[["Wer läuft mit?","Wir laufen mit!"],["Links, rechts, links!","Wir sind nicht zu bremsen!"],["Eins, zwei, drei, vier!","Die Straße gehört uns hier!"],["Wie weit noch?","Bis zum See und weiter!"],["Was wollen wir?","Kilometer!"],["Schneller?","Immer schneller!"]];
let game=null,installed=false,chain=null,nextAt=0,lastFrame=performance.now(),streak={n:0,at:0,chainId:0},banner=null,bannerTimer=0,chainSerial=0,drawn=false;
const viewport=()=>document.getElementById("viewport");
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
function playerPos(){if(game?.mode==="car"){const p=game.rigids?.pose?.("player-car")?.position;if(p)return {x:p[0],y:p[1]};}const W=globalThis.__arondightWalkMode;if(W?.position)return {x:W.position.x,y:W.position.y};const e=game?.world?.camera?.eye;return e?{x:e[0],y:e[1]}:null;}
function inWorld(){return Boolean(game&&(game.mode==="foot"||game.mode==="car"))&&!globalThis.__arondightGpsLiveApi?.active;}
function prisms(){return game?.gameplayState?.carObstacleSnapshot?.prisms||[];}
function pointInRing(x,y,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=+pts[i][0],yi=+pts[i][1],xj=+pts[j][0],yj=+pts[j][1];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)inside=!inside;}return inside;}
function buildingAt(x,y){for(const p of prisms()){const pts=p.points;if(!pts||pts.length<3||p.leveled)continue;let b=p.__bb;if(!b){b=[Infinity,Infinity,-Infinity,-Infinity];for(const q of pts){b[0]=Math.min(b[0],+q[0]);b[1]=Math.min(b[1],+q[1]);b[2]=Math.max(b[2],+q[0]);b[3]=Math.max(b[3],+q[1]);}try{p.__bb=b;}catch{}}if(x<b[0]||x>b[2]||y<b[1]||y>b[3])continue;if(pointInRing(x,y,pts))return true;}return false;}
const blockedAt=(x,y)=>buildingAt(x,y)||buildingAt(x+.35,y)||buildingAt(x-.35,y)||buildingAt(x,y+.35)||buildingAt(x,y-.35);
function buildPath(road,side,kerb=1.7){const pts=road.pts,off=(Number(road.w)||6)/2+kerb,out=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;out.push([pts[i][0]-dy*off*side,pts[i][1]+dx*off*side]);}
  const cum=[0];for(let i=1;i<out.length;i++)cum.push(cum[i-1]+Math.hypot(out[i][0]-out[i-1][0],out[i][1]-out[i-1][1]));return {pts:out,cum,len:cum.at(-1),side,off};}
function sample(path,s){const L=path.len;let u=((s%(2*L))+2*L)%(2*L),dir=1;if(u>L){u=2*L-u;dir=-1;}let i=1;while(i<path.cum.length-1&&path.cum[i]<u)i++;const a=path.pts[i-1],b=path.pts[i],seg=(path.cum[i]-path.cum[i-1])||1,t=clamp((u-path.cum[i-1])/seg,0,1);const sl=Math.hypot(b[0]-a[0],b[1]-a[1])||1,sd=path.side||1;
  return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,yaw:Math.atan2((b[1]-a[1])*dir,(b[0]-a[0])*dir),nx:-(b[1]-a[1])/sl*sd,ny:(b[0]-a[0])/sl*sd};}
function pathFree(path){for(let s=0;s<=path.len;s+=1.5){const q=sample(path,s);if(blockedAt(q.x,q.y))return false;}return true;}
function pickRoad(p){const cand=[];for(const r of nativeProjectedRoads()){if(!r?.pts||r.pts.length<2||/motorway|trunk|path|track/.test(String(r.cls||"")))continue;let len=0,near=Infinity;for(let i=1;i<r.pts.length;i++)len+=Math.hypot(r.pts[i][0]-r.pts[i-1][0],r.pts[i][1]-r.pts[i-1][1]);if(len<60)continue;for(const q of r.pts)near=Math.min(near,Math.hypot(q[0]-p.x,q[1]-p.y));if(near<35||near>150)continue;cand.push({r,score:Math.min(len,260)-near*.6+Math.random()*40});}
  cand.sort((a,b)=>b.score-a.score);return cand[0]?.r||null;}
function unseen(x,y){const cam=game?.world?.camera;if(!cam?.eye)return true;const e=cam.eye,d=[x-e[0],y-e[1]],dl=Math.hypot(...d);if(dl>110)return true;const f=[cam.target[0]-e[0],cam.target[1]-e[1]],fl=Math.hypot(...f)||1;return (d[0]*f[0]+d[1]*f[1])/(dl*fl||1)<Math.cos(Math.min(1.4,(Number(cam.fov)||1.2)*.75));}
function spawn(now){const p=playerPos();if(!p)return false;const road=pickRoad(p);if(!road)return false;const side0=Math.random()<.5?1:-1;let path=null;
  for(const side of [side0,-side0])for(const kerb of [1.7,1.2,2.4]){if(path)break;const c=buildPath(road,side,kerb);if(c.len>=50&&pathFree(c))path=c;}if(!path)return false;
  const a=path.pts[0],b=path.pts.at(-1),startS=Math.hypot(a[0]-p.x,a[1]-p.y)>Math.hypot(b[0]-p.x,b[1]-p.y)?(N*GAP_M):(path.len+N*GAP_M);const head=sample(path,startS);if(!unseen(head.x,head.y))return false;
  chain={id:++chainSerial,path,s:startS,born:now,runners:Array.from({length:N},(_,i)=>({i,alive:true,x:head.x,y:head.y,z:0,yaw:head.yaw,yawS:head.yaw,lat:0,phase:Math.random()})),nextCallAt:now+1500,callIdx:Math.floor(Math.random()*CALLS.length),beat:0,nextBeatAt:now};
  const v=viewport();if(v){v.dataset.joggerChain=`spawned-${chain.id}`;v.dataset.joggerChainLen=path.len.toFixed(0);}return true;}
function despawn(){chain=null;const v=viewport();if(v)v.dataset.joggerChain="gone";}
function speak(text,{pitch=1,rate=1.05,vol=1}={}){try{const ss=globalThis.speechSynthesis;if(!ss||vol<.05)return;const u=new SpeechSynthesisUtterance(text);u.lang="de-DE";u.pitch=pitch;u.rate=rate;u.volume=clamp(vol,0,1);const voice=ss.getVoices?.().find(v=>/^de/i.test(v.lang));if(voice)u.voice=voice;ss.speak(u);}catch{}}
function distGain(x,y,ref=26){const e=game?.world?.camera?.eye;if(!e)return 0;const d=Math.hypot(x-e[0],y-e[1]);return clamp(1-d/ref/3,0,1);}
function stomp(x,y,accent){const a=globalThis.__sharedAudioContext;if(!a||a.state!=="running")return;const g0=distGain(x,y)*(accent?.55:.32);if(g0<.02)return;try{const t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.type="sine";o.frequency.setValueAtTime(accent?92:78,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(g0,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.connect(g).connect(a.destination);o.start(t);o.stop(t+.18);
  if(accent){const n=a.createBuffer(1,a.sampleRate*.06,a.sampleRate),ch=n.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*(1-i/ch.length)**2;const s=a.createBufferSource(),bp=a.createBiquadFilter(),cg=a.createGain();bp.type="bandpass";bp.frequency.value=1800;bp.Q.value=.9;cg.gain.value=g0*.9;s.buffer=n;s.connect(bp).connect(cg).connect(a.destination);s.start(t+.01);}}catch{}}
function chant(now){if(!chain)return;const lead=chain.runners.find(r=>r.alive);if(!lead)return;const vol=distGain(lead.x,lead.y,22);
  if(now>=chain.nextBeatAt){chain.nextBeatAt=now+400;chain.beat++;stomp(lead.x,lead.y,chain.beat%2===0);}
  if(now>=chain.nextCallAt){const [call,answer]=CALLS[chain.callIdx++%CALLS.length];chain.nextCallAt=now+6400;if(vol>.06){speak(call,{pitch:.85,rate:1.08,vol});setTimeout(()=>{if(chain&&chain.runners.filter(r=>r.alive).length>1)speak(answer,{pitch:1.15,rate:1.12,vol:vol*.95});},1700);}}}
function showBanner(text,big=false){const v=viewport();if(!v)return;if(!banner?.isConnected){banner=document.createElement("div");banner.id="joggerStreakBanner";banner.style.cssText="position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);z-index:32;pointer-events:none;text-align:center;font:900 italic 30px/1 'Nunito',system-ui,sans-serif;letter-spacing:.06em;color:#d8ff3a;text-shadow:0 3px 0 #2a3a06,0 0 18px #d8ff3a88;transition:opacity .4s,transform .25s;opacity:0";v.appendChild(banner);}
  banner.textContent=text;banner.style.fontSize=big?"clamp(26px,5.4vw,46px)":"clamp(20px,3.6vw,30px)";banner.style.opacity="1";banner.style.transform="translate(-50%,-50%) scale(1.12)";requestAnimationFrame(()=>{banner.style.transform="translate(-50%,-50%) scale(1)";});clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{banner.style.opacity="0";},big?2600:1300);}
function jingle(){const a=globalThis.__sharedAudioContext;if(!a||a.state!=="running")return;try{const t=a.currentTime;[523,659,784,1047,784,1047].forEach((f,i)=>{const o=a.createOscillator(),g=a.createGain();o.type=i%2?"square":"triangle";o.frequency.value=f;const s=t+i*.11;g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(.12,s+.01);g.gain.exponentialRampToValueAtTime(.001,s+.22);o.connect(g).connect(a.destination);o.start(s);o.stop(s+.25);});}catch{}}
function kill(r,impulse){if(!r.alive||!chain)return;r.alive=false;try{spawnNativeRagdoll({position:[r.x,r.y,r.z+.05],yaw:r.yaw-Math.PI/2,impulse,seed:`jogger-${chain.id}-${r.i}`,id:`jogger-${chain.id}-${r.i}`});}catch{}globalThis.__arondightBlood?.([r.x,r.y,r.z+1.1]);
  const now=performance.now();if(streak.chainId!==chain.id||now-streak.at>STREAK_WINDOW_MS)streak={n:0,at:now,chainId:chain.id};streak.n++;streak.at=now;const left=chain.runners.filter(x=>x.alive).length;
  window.dispatchEvent(new CustomEvent("arondight:world-kill",{detail:{id:`jogger-${chain.id}-${r.i}`,kind:"person",network:false}}));
  if(!left){showBanner(`KOMPLETTE LAUFGRUPPE! ×${streak.n}`,true);jingle();window.dispatchEvent(new CustomEvent("arondight:jogger-streak",{detail:{count:streak.n,complete:true}}));}else if(streak.n>=2)showBanner(`JOGGER ×${streak.n}`);
  const v=viewport();if(v){v.dataset.joggerStreak=String(streak.n);v.dataset.joggerAlive=String(left);}}
function checkCar(){if(!chain||game?.mode!=="car")return;const p=game.rigids?.pose?.("player-car");if(!p?.position)return;const v=p.velocity||[0,0,0],sp=Math.hypot(v[0],v[1]);if(sp<2.5)return;const yaw=Number(p.yaw)||Math.atan2(v[1],v[0]),c=Math.cos(yaw),s=Math.sin(yaw);
  for(const r of chain.runners){if(!r.alive)continue;const dx=r.x-p.position[0],dy=r.y-p.position[1];if(dx*dx+dy*dy>9)continue;const u=dx*c+dy*s,w=-dx*s+dy*c;if(Math.abs(u)<2.15&&Math.abs(w)<1.15)kill(r,[v[0]*.8,v[1]*.8,2.4+sp*.12]);}}
function onTracer(e){if(!chain)return;const d=e?.detail||{},a=d.start,b=d.end;if(!Array.isArray(a)||!Array.isArray(b))return;const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L2=dx*dx+dy*dy+dz*dz;if(L2<.01)return;
  for(const r of chain.runners){if(!r.alive)continue;const cz=r.z+1.15,t=clamp(((r.x-a[0])*dx+(r.y-a[1])*dy+(cz-a[2])*dz)/L2,0,1),px=a[0]+dx*t-r.x,py=a[1]+dy*t-r.y,pz=a[2]+dz*t-cz;if(px*px+py*py<.09&&Math.abs(pz)<.75){const l=Math.sqrt(L2);kill(r,[dx/l*2.5,dy/l*2.5,1.4]);break;}}}
function onBlast(e){if(!chain)return;const p=e?.detail?.position;if(!Array.isArray(p))return;const R=Math.max(3,Number(e.detail.radiusM)||8);for(const r of chain.runners){if(!r.alive)continue;const dx=r.x-p[0],dy=r.y-p[1],d=Math.hypot(dx,dy);if(d<R*.7){const k=(1-d/R)*7/(d||1);kill(r,[dx*k,dy*k,4+3*(1-d/R)]);}}}
// ---------------------------------------------------------------- the runner: neon shirt, shorts, skin, shoes, jog gait
function G(){return {p:[],n:[],c:[]};}
function box(b,[sx,sy,sz],[x,y,z],col){const h=[sx/2,sy/2,sz/2],F=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]]],[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,1,-1],[-1,-1,-1],[-1,-1,1],[-1,1,1]]],[[0,1,0],[[1,1,-1],[-1,1,-1],[-1,1,1],[1,1,1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]];
  for(const [n,q] of F){const v=q.map(k=>[k[0]*h[0]+x,k[1]*h[1]+y,k[2]*h[2]+z]);for(const i of [0,1,2,0,2,3]){b.p.push(...v[i]);b.n.push(...n);b.c.push(...col);}}}
const f32=b=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)});
// body (pelvis at origin, +X forward): shorts, neon torso, skin arms/neck, head
const TORSO=(()=>{const b=G();box(b,[.24,.36,.22],[0,0,.0],hex(SHORTS));box(b,[.26,.4,.56],[0,0,.4],hex(SHIRT));box(b,[.1,.1,.08],[0,0,.72],hex(0xc48e6c));return f32(b);})();
const HEAD=(()=>{const b=G();box(b,[.22,.2,.24],[0,0,0],[1,1,1]);return f32(b);})();
const HAIRG=(()=>{const b=G();box(b,[.23,.21,.07],[-.01,0,.11],[1,1,1]);return f32(b);})();
const LEG=(()=>{const b=G();box(b,[.13,.13,.78],[0,0,-.39],[1,1,1]);return f32(b);})();
const SHOE=(()=>{const b=G();box(b,[.24,.12,.08],[.05,0,-.8],hex(SHOES));return f32(b);})();
const ARM=(()=>{const b=G();box(b,[.09,.09,.56],[0,0,-.28],[1,1,1]);return f32(b);})();
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];},RY=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
function draw(now){
  const r=game?.world?.renderer;if(!r?.upsert)return;
  const live=chain?chain.runners.filter(x=>x.alive):[];
  if(!live.length){if(drawn){for(const [id,g] of [["jog/torso",TORSO],["jog/head",HEAD],["jog/hair",HAIRG],["jog/legs",LEG],["jog/shoes",SHOE],["jog/arms",ARM]])syncInstanced(r,id,g,null);drawn=false;}return;}
  const torso=[],head=[],hair=[],legs=[],arms=[],skin=[],skin2=[],hairT=[];
  for(const q of live){const ph=(q.phase+now/1000*SPEED/1.6)%1,sw=Math.sin(ph*Math.PI*2),bob=Math.abs(sw)*.05,lean=.12;
    const root=mul(T(q.x,q.y,q.z+.92+bob),mul(RZ(q.yawS),RY(lean)));
    torso.push(root);head.push(mul(root,T(.02,0,.9)));hair.push(mul(root,T(.02,0,.9)));
    for(const s of [1,-1]){legs.push(mul(root,mul(T(0,s*.09,-.06),RY(-sw*s*.75))));arms.push(mul(root,mul(T(0,s*.19,.62),RY(sw*s*.9))));}
    const sk=hex(SKINS[q.i%5]),hr=hex(HAIR[q.i%4]);skin.push(sk);hairT.push(hr);skin2.push(sk,sk);}
  const tint=list=>{const o=new Float32Array(list.length*4);list.forEach((c,i)=>o.set([...c,1],i*4));return o;},m={material:{roughness:.85,frustumCulled:false}};
  syncInstanced(r,"jog/torso",TORSO,packMatrices(torso),m);syncInstanced(r,"jog/head",HEAD,packMatrices(head),{tints:tint(skin),...m});syncInstanced(r,"jog/hair",HAIRG,packMatrices(hair),{tints:tint(hairT),...m});
  syncInstanced(r,"jog/legs",LEG,packMatrices(legs),{tints:tint(skin2),...m});syncInstanced(r,"jog/shoes",SHOE,packMatrices(legs),m);syncInstanced(r,"jog/arms",ARM,packMatrices(arms),{tints:tint(skin2),...m});drawn=true;
}
export function tickNativeJoggerChain(now=performance.now()){
  if(!game)return;const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
  if(!worldOption("people")||!inWorld()){if(chain)despawn();draw(now);return;}
  if(!chain){if(!nextAt)nextAt=now+FIRST_MS;if(now>=nextAt){nextAt=now+EVERY_MS[0]+Math.random()*(EVERY_MS[1]-EVERY_MS[0]);if(!spawn(now))nextAt=now+15000;}draw(now);return;}
  const p=playerPos(),alive=chain.runners.filter(r=>r.alive);if(!alive.length||now-chain.born>LIFE_MS&&p&&Math.hypot(alive[0].x-p.x,alive[0].y-p.y)>70){despawn();draw(now);return;}
  chain.s+=SPEED*dt;
  for(const r of chain.runners){const q=sample(chain.path,chain.s-r.i*GAP_M);
    let latT=0;if(r.alive&&blockedAt(q.x-q.nx*r.lat,q.y-q.ny*r.lat)||r.lat>0){latT=-1;for(let m=0;m<=chain.path.off-.6;m+=.5)if(!blockedAt(q.x-q.nx*m,q.y-q.ny*m)){latT=m;break;}if(latT<0)latT=r.lat;}
    r.lat+=(latT-r.lat)*Math.min(1,dt*(latT>r.lat?10:2));r.x=q.x-q.nx*r.lat;r.y=q.y-q.ny*r.lat;r.yaw=q.yaw;
    {let d=r.yaw-r.yawS;d=Math.atan2(Math.sin(d),Math.cos(d));const m=9*dt;r.yawS+=clamp(d,-m,m);}
    r.z=ground(r.x,r.y);}
  checkCar();chant(now);draw(now);
}
export function installNativeJoggerChain(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  addEventListener("arondight:foot-tracer",onTracer);addEventListener("arondight:world-explosion",onBlast);
  addEventListener("arondight:world-reset",()=>{despawn();nextAt=performance.now()+FIRST_MS;streak={n:0,at:0,chainId:0};});addEventListener(WORLD_OPTIONS_EVENT,()=>{if(!worldOption("people"))despawn();});
  globalThis.__arondightJoggerChain={spawn:()=>spawn(performance.now()),despawn,get chain(){return chain?{id:chain.id,alive:chain.runners.filter(r=>r.alive).length,speed:SPEED,runners:chain.runners.map(r=>({x:r.x,y:r.y,yaw:r.yawS,lat:r.lat,alive:r.alive}))}:null;},get streak(){return streak.n;},version:JOGGER_CHAIN_VERSION};
}
