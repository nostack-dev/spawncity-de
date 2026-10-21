// Production military_response.mjs on the native engine.
// Only when the player really overdoes it (five stars held for 40 s while the
// heat keeps climbing, or an extreme rampage) and after a 15 s alert (lose the
// fifth star to call it off) the army takes over: an attack helicopter circles
// in and works the player with its heavy machine gun, a squad of soldiers
// advances along the streets (A* over the road graph, rifle bursts from cover
// range) and a tank drives in on the roads (a real Box3D vehicle) and fires
// its main gun. Bursts with honest spread, shells you can outrun, everything
// can be shot down / blown up; at three stars or less they withdraw.
// Same constants, rules, models (built from the same primitives) and banners.
import {worldOption,WORLD_OPTIONS_EVENT} from "./world_options.mjs";
import {wantedLineBlockedByPrisms,wantedPointInRing} from "./wanted_system_logic.mjs";
import {getSharedCombatAudioContext,playCombatAudio} from "./combat_audio_bank.mjs";
import {ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";
import {spawnNativeRagdoll} from "./native_ragdoll.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";
export const MILITARY_RESPONSE_VERSION="military-escalation-v1-native";
const TRIGGER_HEAT=36,TRIGGER_HOLD_MS=40000,TRIGGER_EXTREME_HEAT=55,ALERT_MS=15000,END_STARS=3,SQUAD=4,MAX_SOLDIERS=8,SOLDIER_HP=100,HIT=25,HELI_HP=420,TANK_HP=900;
const HELI_DMG=4,HELI_DMG_DRONE=6,SOLDIER_DMG=3,SOLDIER_DMG_DRONE=4,SHELL_DMG=30,SOLDIER_REACT_MS=900,SOLDIER_BURSTS=3,BURST_WINDOW_MS=1400;
const OLIVE=0x4b5634;
let game=null,installed=false,active=false,since5=0,alertAt=0,startedAt=0,nextReinforce=0,serial=0,burstStarts=[];
let militaryEnabled=worldOption("military");const pending={heli:0,squad:0,tank:0};let pendingAt=0;
let helis=[],tanks=[],soldiers=[],tracers=[],shells=[];
const wanted=()=>globalThis.__arondightWantedSystem||null,viewport=()=>document.getElementById("viewport");
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angleTo=(a,b)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
const rig=()=>game?.rigids||null;
function playerTarget(){
  if(!game)return null;const mode=game.mode;
  if(mode==="drone"){const p=game.flight?.position?.(),m=globalThis.__arondightDroneDamageModel;if(!p||m?.destroyed)return null;const v=game.flight?.linear?.()||[0,0,0];return {kind:"drone",position:{x:p[0],y:p[1],z:p[2]},model:m,speedMps:Math.hypot(v[0],v[1]),velocity:{x:v[0],y:v[1]}};}
  const id=mode==="car"?"player-car":"player-foot",pose=rig()?.pose?.(id),p=pose?.position;if(!p)return null;const m=globalThis.__arondightPlayerDamageModel;if(m?.dead)return null;
  const v=pose.velocity||[0,0,0];return {kind:"player",position:{x:p[0],y:p[1],z:p[2]+(mode==="foot"?.6:.8)},model:m,speedMps:Math.hypot(v[0],v[1]),velocity:{x:v[0],y:v[1]}};
}
function prisms(){return game?.gameplayState?.carObstacleSnapshot?.prisms||[];}
function blocked(a,b){try{return wantedLineBlockedByPrisms(a,b,prisms());}catch{return false;}}
function insideBuilding(x,y){for(const pr of prisms()){const pts=pr.points;if(!pts||pts.length<3||Math.abs(x-pts[0][0])>120||Math.abs(y-pts[0][1])>120)continue;if(wantedPointInRing(x,y,pts))return true;}return false;}
function inView(x,y,z){const cam=game?.world?.camera;if(!cam?.eye)return false;const e=cam.eye,d=[x-e[0],y-e[1],z-e[2]],dl=Math.hypot(...d),f=[cam.target[0]-e[0],cam.target[1]-e[1],cam.target[2]-e[2]],fl=Math.hypot(...f)||1;
  if((d[0]*f[0]+d[1]*f[1]+d[2]*f[2])/(dl*fl||1)<Math.cos(Math.min(1.4,(Number(cam.fov)||1.2)*.75)))return false;return !blocked({x:e[0],y:e[1],z:e[2]},{x,y,z});}
function sound(kind,x,y,z,gain=.5,rate=1){try{const c=getSharedCombatAudioContext();if(!c||c.state!=="running")return;const pl=playerTarget()?.position,d=pl?Math.hypot(pl.x-x,pl.y-y,(pl.z||0)-z):60;playCombatAudio(c,kind,{gain:clamp(gain*40/(25+d),.03,gain),playbackRate:rate,minIntervalMs:30});}catch{}}
function damagePlayer(t,dmg,source){if(t?.model?.damage)t.model.damage(dmg,source);window.dispatchEvent(new CustomEvent("arondight:combat-damage",{detail:{damage:dmg,source,target:t?.kind||"player"}}));}
function light(p,o){try{game?.world?.requestLight?.(p,{...o,intensity:o.intensity*16/46});}catch{}}
// ------------------------------------------------------------ models (production primitives)
function G(){return {p:[],n:[],c:[]};}
function push(b,v,n,c){b.p.push(...v);b.n.push(...n);b.c.push(...c);}
function xf(m,v){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
function xn(m,n){const v=[m[0]*n[0]+m[4]*n[1]+m[8]*n[2],m[1]*n[0]+m[5]*n[1]+m[9]*n[2],m[2]*n[0]+m[6]*n[1]+m[10]*n[2]],l=Math.hypot(...v)||1;return v.map(a=>a/l);}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],S=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
const RX=a=>{const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];},RY=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];},RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
function addMesh(b,mesh,m,col){for(let i=0;i<mesh.v.length;i++)push(b,xf(m,mesh.v[i]),xn(m,mesh.n[i]),col);}
// unit primitives, Three axis conventions (cylinder / capsule along Y)
function boxP(sx,sy,sz){const h=[sx/2,sy/2,sz/2],v=[],n=[],F=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]]],[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,1,-1],[-1,-1,-1],[-1,-1,1],[-1,1,1]]],[[0,1,0],[[1,1,-1],[-1,1,-1],[-1,1,1],[1,1,1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]];
  for(const [nn,q] of F){const vv=q.map(k=>[k[0]*h[0],k[1]*h[1],k[2]*h[2]]);for(const i of [0,1,2,0,2,3]){v.push(vv[i]);n.push(nn);}}return {v,n};}
function cylP(rt,rb,h,seg){const v=[],n=[];for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1),sl=(rb-rt)/h;
  const A=[c0*rb,-h/2,s0*rb],B=[c1*rb,-h/2,s1*rb],C=[c1*rt,h/2,s1*rt],D=[c0*rt,h/2,s0*rt],n0=[c0,sl,s0],n1=[c1,sl,s1];
  for(const [p,q] of [[A,n0],[C,n1],[B,n1],[A,n0],[D,n0],[C,n1]]){v.push(p);n.push(q);}
  for(const [p,q] of [[[0,h/2,0],[0,1,0]],[C,[0,1,0]],[D,[0,1,0]],[[0,-h/2,0],[0,-1,0]],[A,[0,-1,0]],[B,[0,-1,0]]]){v.push(p);n.push(q);}}return {v,n};}
function sphP(r,ws,hs){const v=[],n=[],P=(i,j)=>{const th=j/hs*Math.PI,ph=i/ws*Math.PI*2,q=[Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph)];return [q.map(a=>a*r),q];};
  for(let j=0;j<hs;j++)for(let i=0;i<ws;i++){const a=P(i,j),b=P(i+1,j),c=P(i+1,j+1),d=P(i,j+1);for(const [p,q] of [a,c,b,a,d,c]){v.push(p);n.push(q);}}return {v,n};}
function capP(r,len,seg){const c=cylP(r,r,len,seg),top=sphP(r,seg,6);for(let i=0;i<top.v.length;i++){const p=top.v[i];c.v.push([p[0],p[1]+(p[1]>=0?len/2:-len/2),p[2]]);c.n.push(top.n[i]);}return c;}
const C_OLIVE=hex(OLIVE),C_DARK=hex(0x22261c),C_GLASS=hex(0x1a2228),C_ROTOR=hex(0x15171a);
const HELI_BODY=(()=>{const b=G();addMesh(b,capP(.95,4.2,10),RX(Math.PI/2),C_OLIVE);addMesh(b,sphP(.75,10,8),mul(T(0,2.3,.45),S(.8,1.3,.8)),C_GLASS);
  addMesh(b,cylP(.22,.4,5.2,8),mul(T(0,-4.6,.35),RX(Math.PI/2)),C_OLIVE);addMesh(b,boxP(.12,1.1,1.5),T(0,-7,.95),C_OLIVE);
  for(const s of [-1,1]){addMesh(b,boxP(1.7,.5,.12),T(s*1.4,.2,-.15),C_OLIVE);addMesh(b,cylP(.16,.16,1.6,8),mul(T(s*2.1,.4,-.35),RX(Math.PI/2)),C_DARK);addMesh(b,boxP(.08,3.2,.08),T(s*.9,0,-1.3),C_DARK);}
  addMesh(b,cylP(.08,.08,1.1,6),mul(T(0,3.2,-.8),RX(Math.PI/2)),C_DARK);return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};})();
const HELI_ROTOR=(()=>{const b=G();for(const a of [0,Math.PI/2])addMesh(b,boxP(12.5,.32,.04),RZ(a),C_ROTOR);return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};})();
const HELI_TAIL=(()=>{const b=G();addMesh(b,boxP(.04,.22,2.2),T(0,0,0),C_ROTOR);return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};})();
const TANK_HULL=(()=>{const b=G();addMesh(b,boxP(6.6,3.1,1),T(0,0,.95),C_OLIVE);addMesh(b,boxP(6.9,.75,.85),T(0,1.25,.55),C_DARK);addMesh(b,boxP(6.9,.75,.85),T(0,-1.25,.55),C_DARK);addMesh(b,boxP(1.4,2.9,.5),mul(T(2.9,0,1.25),RY(-.5)),C_OLIVE);return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};})();
const TANK_TURRET=(()=>{const b=G();addMesh(b,boxP(2.8,2.3,.75),T(0,0,.2),C_OLIVE);addMesh(b,cylP(.13,.16,4.4,10),mul(T(2.9,0,.3),RZ(Math.PI/2)),C_DARK);addMesh(b,cylP(.35,.35,.4,10),T(-.6,.5,.75),C_DARK);return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};})();
const TRACER=(()=>{const b=G();addMesh(b,cylP(.03,.03,1,5),T(0,.5,0),hex(0xffe08a));return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};})();
// ------------------------------------------------------------ fx
function tracer(from,to){tracers.push({a:[...from],b:[...to],until:performance.now()+80});if(tracers.length>28)tracers.shift();}
function shoot(from,t,chance,dmg,source,spread=2.6){const a=t.position,aim=[a.x,a.y,a.z-.2];let to;
  if(Math.random()<chance){to=aim;damagePlayer(t,dmg,source);}
  else{to=[a.x+(Math.random()-.5)*spread,a.y+(Math.random()-.5)*spread,a.z+(Math.random()-.6)*spread*.5];const d0=[to[0]-from[0],to[1]-from[1],to[2]-from[2]],d=Math.hypot(...d0)||1,dir=d0.map(v=>v/d);to=[from[0]+dir[0]*(d+8),from[1]+dir[1]*(d+8),from[2]+dir[2]*(d+8)];globalThis.__worldImpacts?.bullet?.({origin:from,direction:dir},null,{maxDistance:d+16});}
  tracer(from,to);}
function boom(p,radius,damage,scale=.45){globalThis.__fighterJets?.blast?.(p,{radiusM:radius,maxDamage:damage,scale,kind:"military"});}
// ------------------------------------------------------------ helicopter
function spawnHeli(now,target){let a=0,x=0,y=0,z=0,found=false;for(let k=0;k<12&&!found;k++){a=Math.random()*Math.PI*2;x=target.x+Math.cos(a)*650;y=target.y+Math.sin(a)*650;z=ground(x,y)+95;found=!inView(x,y,z);}if(!found)return null;
  const h={id:`mil-heli-${(++serial).toString(36)}`,p:[x,y,z],v:[0,0,0],yaw:Math.atan2(target.y-y,target.x-x)-Math.PI/2,hp:HELI_HP,state:"inbound",orbit:a,rotor:0,nextBurst:now+5000,burst:0,nextShot:0,born:now};helis.push(h);sound("explosion",x,y,z,.2,.3);return h;}
function stepHeli(h,t,now,dt){const tp=t.position;
  if(h.state==="down"){h.v[2]-=9.8*dt;for(let k=0;k<3;k++){h.v[k]*=1-.3*dt;h.p[k]+=h.v[k]*dt;}h.yaw+=4*dt;h.rotor+=dt*28;const gz=ground(h.p[0],h.p[1]);if(h.p[2]<gz+1||insideBuilding(h.p[0],h.p[1])&&h.p[2]<gz+25){boom([h.p[0],h.p[1],Math.max(h.p[2],gz)],14,120,.9);h.dead=true;}return;}
  const leaving=h.state==="leave";let goal;
  if(leaving){goal=[h.p[0]+Math.cos(h.orbit)*600,h.p[1]+Math.sin(h.orbit)*600,0];goal[2]=ground(goal[0],goal[1])+120;}
  else{const dist=Math.hypot(tp.x-h.p[0],tp.y-h.p[1]);if(h.state==="inbound"&&dist<170)h.state="orbit";h.orbit+=dt*.22;const R=h.state==="orbit"?72:0;goal=[tp.x+Math.cos(h.orbit)*R,tp.y+Math.sin(h.orbit)*R,0];goal[2]=Math.max(ground(goal[0],goal[1])+42,(tp.z||0)+16);}
  const dv=[goal[0]-h.p[0],goal[1]-h.p[1],goal[2]-h.p[2]],dl=Math.hypot(...dv)||1,sp=Math.min(48,dl*.6),k=1-Math.exp(-dt*.9);
  for(let i=0;i<3;i++){h.v[i]+=(dv[i]/dl*sp-h.v[i])*k;h.p[i]+=h.v[i]*dt;}
  const gz=ground(h.p[0],h.p[1]);if(h.p[2]<gz+25)h.p[2]+=(gz+25-h.p[2])*Math.min(1,dt*3);
  const face=leaving||h.state==="inbound"?Math.atan2(h.v[1],h.v[0]):Math.atan2(tp.y-h.p[1],tp.x-h.p[0]);h.yaw+=angleTo(h.yaw,face-Math.PI/2)*Math.min(1,dt*1.6);h.rotor+=dt*28;
  if(h.state==="orbit"&&!leaving){const d=Math.hypot(h.p[0]-tp.x,h.p[1]-tp.y,h.p[2]-(tp.z||0));if(now>h.nextBurst&&d<240&&!blocked({x:h.p[0],y:h.p[1],z:h.p[2]},{x:tp.x,y:tp.y,z:(tp.z||1.6)})){h.burst=7;h.nextBurst=now+3500+Math.random()*1650;}
    if(h.burst>0&&now>h.nextShot){h.burst--;h.nextShot=now+110;const fx=-Math.sin(h.yaw),fy=Math.cos(h.yaw),from=[h.p[0]+fx*3.4,h.p[1]+fy*3.4,h.p[2]-.9],chance=clamp(.32-d/560-(t.speedMps||0)*.025,.05,.32);shoot(from,t,chance,t.kind==="drone"?HELI_DMG_DRONE:HELI_DMG,"military-heli",3.6);sound("shot",from[0],from[1],from[2],.6,.55);}}
  if(leaving&&Math.hypot(h.p[0]-tp.x,h.p[1]-tp.y)>650)h.dead=true;}
// ------------------------------------------------------------ road graph / A*
let graph=null,graphAt=-Infinity;
function roadGraph(now){if(graph&&now-graphAt<5000)return graph;const routes=globalThis.__arondightProceduralPopulation?.roads?.()||[];graphAt=now;const nodes=new Map(),key=(x,y)=>`${Math.round(x/2)},${Math.round(y/2)}`,node=(x,y)=>{const k=key(x,y);let n=nodes.get(k);if(!n){n={x,y,adj:[]};nodes.set(k,n);}return n;};
  for(const r of routes)for(const s of r.segments||[]){const a=node(s.a[0],s.a[1]),b=node(s.a[0]+s.dx,s.a[1]+s.dy);if(a===b)continue;a.adj.push([b,s.d]);b.adj.push([a,s.d]);}graph={nodes:[...nodes.values()]};return graph;}
function nearestNode(g,x,y){let best=null,bd=Infinity;for(const n of g.nodes){const d=(n.x-x)**2+(n.y-y)**2;if(d<bd){bd=d;best=n;}}return best;}
function findPath(g,sx,sy,tx,ty,avoid=null){const a=nearestNode(g,sx,sy),b=nearestNode(g,tx,ty);if(!a||!b)return null;if(a===b)return [{x:sx,y:sy},{x:tx,y:ty}];const open=[a],inOpen=new Set([a]),gs=new Map([[a,0]]),from=new Map(),h=n=>Math.hypot(n.x-b.x,n.y-b.y),fs=new Map([[a,h(a)]]),closed=new Set();let it=0;
  while(open.length&&it++<5000){let bi=0;for(let i=1;i<open.length;i++)if(fs.get(open[i])<fs.get(open[bi]))bi=i;const cur=open[bi];open[bi]=open[open.length-1];open.pop();inOpen.delete(cur);if(cur===b)break;closed.add(cur);
    for(const [n,w] of cur.adj){if(closed.has(n))continue;let ww=w;if(avoid?.length){const mx=(cur.x+n.x)/2,my=(cur.y+n.y)/2;for(const q of avoid)if(Math.hypot(mx-q.x,my-q.y)<9){ww*=25;break;}}const g2=gs.get(cur)+ww;if(g2<(gs.get(n)??Infinity)){gs.set(n,g2);fs.set(n,g2+h(n));from.set(n,cur);if(!inOpen.has(n)){open.push(n);inOpen.add(n);}}}}
  if(!from.has(b))return null;const path=[{x:tx,y:ty}];for(let n=b;n;n=from.get(n))path.unshift({x:n.x,y:n.y});return path;}
function pursuitPoint(path,x,y,look){let bi=0,bt=0,bd=Infinity;for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1e-6,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/l2,0,1),px=a.x+dx*t,py=a.y+dy*t,d=Math.hypot(x-px,y-py);if(d<bd){bd=d;bi=i;bt=t;}}
  if(path.length<2)return path[0];let i=bi,t=bt,left=look;while(i<path.length-1){const a=path[i],b=path[i+1],l=Math.hypot(b.x-a.x,b.y-a.y)||1e-6,rest=(1-t)*l;if(rest>=left){const tt=t+left/l;return {x:a.x+(b.x-a.x)*tt,y:a.y+(b.y-a.y)*tt};}left-=rest;i++;t=0;}return path.at(-1);}
// ------------------------------------------------------------ tank
function spawnTank(now,target){const g=roadGraph(now),cands=g.nodes.filter(n=>{const d=Math.hypot(n.x-target.x,n.y-target.y);return d>170&&d<300&&!insideBuilding(n.x,n.y)&&!inView(n.x,n.y,ground(n.x,n.y)+2);});const spot=cands[(Math.random()*cands.length)|0];if(!spot)return null;
  const leg=findPath(g,spot.x,spot.y,target.x,target.y),nxt=leg?.find(q=>Math.hypot(q.x-spot.x,q.y-spot.y)>3)||target;
  const id=`mil-tank-${(++serial).toString(36)}`,z=ground(spot.x,spot.y),yaw=Math.atan2(nxt.y-spot.y,nxt.x-spot.x);
  try{if(!rig()?.addBody?.({id,kind:"bus",position:[spot.x,spot.y,z+1.1],yaw,halfExtents:[3.3,1.5,.9],massKg:9200}))return null;}catch{return null;}
  const tk={id,hp:TANK_HP,pose:null,path:null,pathAt:0,turret:0,nextShell:now+6000,born:now,recoverUntil:0,recoverStart:0,stuckSince:0,progress:null,fails:0,avoid:[],flippedSince:0,state:"advance"};tanks.push(tk);return tk;}
function quatRot(q,v){const [x,y,z,w]=q,ix=w*v[0]+y*v[2]-z*v[1],iy=w*v[1]+z*v[0]-x*v[2],iz=w*v[2]+x*v[1]-y*v[0],iw=-x*v[0]-y*v[1]-z*v[2];return [ix*w+iw*-x+iy*-z-iz*-y,iy*w+iw*-y+iz*-x-ix*-z,iz*w+iw*-z+ix*-y-iy*-x];}
function stepTank(tk,t,now,dt){const R=rig(),p=R?.pose?.(tk.id);if(!p){tk.dead=true;return;}tk.pose=p;const cx=p.position[0],cy=p.position[1],tp=t.position,d=Math.hypot(tp.x-cx,tp.y-cy),sp=Math.hypot(p.velocity[0],p.velocity[1]);
  const up=quatRot(p.rotation||[0,0,0,1],[0,0,1]);tk.up=up;const gz=p.position[2]-.9;
  const leaving=tk.state==="leave",goal=leaving?(tk.exit??={x:cx+(cx-tp.x)*3,y:cy+(cy-tp.y)*3}):{x:tp.x,y:tp.y};
  const los=d<160&&!blocked({x:cx,y:cy,z:gz+2.6},{x:tp.x,y:tp.y,z:(tp.z||1.6)});
  if(up[2]<.4){tk.flippedSince||=now;}else tk.flippedSince=0;
  if(tk.state==="wreck"||(tk.flippedSince&&now-tk.flippedSince>3000)){if(tk.state!=="wreck"){tk.state="wreck";tk.wreckAt=now;R.clearTarget?.(tk.id);R.setDrive?.(tk.id,{pedal:0,steer:0,handbrake:true});}if(now-tk.wreckAt>20000&&d>120&&!inView(cx,cy,gz+2))tk.dead=true;return;}
  if(!leaving&&los&&d<110){tk.stuckSince=0;tk.progress=null;R.clearTarget?.(tk.id);R.setDrive?.(tk.id,{pedal:0,steer:0,handbrake:true});}
  else{if(!tk.path||now-tk.pathAt>3000){tk.avoid=tk.avoid.filter(q=>now-q.at<60000);tk.path=findPath(roadGraph(now),cx,cy,goal.x,goal.y,tk.avoid)||[{x:cx,y:cy},goal];tk.pathAt=now;}const pt=pursuitPoint(tk.path,cx,cy,Math.max(8,sp*1.2)),herr=angleTo(p.yaw,Math.atan2(pt.y-cy,pt.x-cx));
    if(now<tk.recoverUntil){if(Math.abs(herr)<.5&&now-tk.recoverStart>900)tk.recoverUntil=0;else{const side=(tk.fails%2?1:-1)*Math.sign(herr||1);R.clearTarget?.(tk.id);R.setDrive?.(tk.id,{pedal:-.75,steer:side,handbrake:false,maxReverse:3.5});}}
    else{tk.progress??={x:cx,y:cy,at:now};if(Math.hypot(cx-tk.progress.x,cy-tk.progress.y)>4){tk.progress={x:cx,y:cy,at:now};if(now-tk.recoverStart>8000)tk.fails=0;}
      const slow=sp<.5?(tk.stuckSince||=now,now-tk.stuckSince>2500):(tk.stuckSince=0,false),noProgress=now-tk.progress.at>7000;
      if(slow||noProgress){tk.fails++;if(tk.fails>=2)tk.avoid.push({x:pt.x,y:pt.y,at:now});tk.recoverStart=now;tk.recoverUntil=now+1800+Math.min(3,tk.fails)*500;tk.stuckSince=0;tk.progress=null;tk.path=null;}
      R.setDrive?.(tk.id,null);R.setTarget?.(tk.id,{position:[pt.x,pt.y,0],yaw:0,speedMps:9});}}
  const want=Math.atan2(tp.y-cy,tp.x-cx)-p.yaw;tk.turret+=clamp(angleTo(tk.turret,want),-dt*.7,dt*.7);
  if(!leaving&&los&&now>tk.nextShell&&Math.abs(angleTo(tk.turret,want))<.06){tk.nextShell=now+6500+Math.random()*2500;const yaw=p.yaw+tk.turret,muzzle=[cx+Math.cos(yaw)*5.8,cy+Math.sin(yaw)*5.8,gz+2];
    const vx=t.speedMps?(t.velocity?.x||0):0,vy=t.speedMps?(t.velocity?.y||0):0,err=2+d*.03+(t.speedMps||0)*.6,aim=[tp.x+vx*.4+(Math.random()-.5)*err*2,tp.y+vy*.4+(Math.random()-.5)*err*2,Math.max(ground(tp.x,tp.y),(tp.z||0)-1.2)];
    const dv=[aim[0]-muzzle[0],aim[1]-muzzle[1],aim[2]-muzzle[2]],dl=Math.hypot(...dv)||1;shells.push({p:muzzle,v:dv.map(v=>v/dl*130),life:3});boom([...muzzle],0,0,.12);sound("explosion",muzzle[0],muzzle[1],muzzle[2],.9,1.35);}
  if(leaving&&d>300&&!inView(cx,cy,gz+2))tk.dead=true;}
function stepShells(dt){for(let i=shells.length-1;i>=0;i--){const s=shells[i],prev=[...s.p];for(let k=0;k<3;k++)s.p[k]+=s.v[k]*dt;s.life-=dt;const gz=ground(s.p[0],s.p[1]);
  let hitP=null;if(s.p[2]<=gz+.2)hitP=[s.p[0],s.p[1],gz];else if(insideBuilding(s.p[0],s.p[1]))hitP=prev;else{const t=playerTarget();if(t&&Math.hypot(s.p[0]-t.position.x,s.p[1]-t.position.y,s.p[2]-t.position.z)<2.2)hitP=[...s.p];}
  if(hitP||s.life<=0){shells.splice(i,1);if(hitP)boom(hitP,6,SHELL_DMG,.55);continue;}tracer(prev,s.p);}}
// ------------------------------------------------------------ soldiers
function spawnSquad(now,target,n){const g=roadGraph(now),cands=g.nodes.filter(q=>{const d=Math.hypot(q.x-target.x,q.y-target.y);return d>90&&d<170&&!insideBuilding(q.x,q.y)&&!inView(q.x,q.y,ground(q.x,q.y)+1);});const base=cands[(Math.random()*cands.length)|0];if(!base)return 0;let placed=0;
  const used=new Set(soldiers.filter(s=>!s.dead).map(s=>s.slot));for(let k=0,slot=0;k<n&&slot<MAX_SOLDIERS;slot++){if(used.has(slot))continue;const x=base.x+(k%2)*1.6,y=base.y+Math.floor(k/2)*1.6;soldiers=soldiers.filter(s=>s.slot!==slot);soldiers.push({slot,x,y,z:ground(x,y),yaw:0,hp:SOLDIER_HP,speed:0,anim:"run",los:false,losAt:0,nextShot:now+3000+Math.random()*2000,burst:0,dead:false,hold:20+Math.random()*12});k++;placed++;}return placed;}
function stepSoldier(s,t,now,dt){if(s.dead)return;const tp=t.position,dx=tp.x-s.x,dy=tp.y-s.y,d=Math.hypot(dx,dy),eye={x:s.x,y:s.y,z:s.z+1.5};
  if(now-s.losAt>350){s.losAt=now;const was=s.los;s.los=d<90&&!blocked(eye,{x:tp.x,y:tp.y,z:(tp.z||1.6)-.3});if(s.los&&!was&&!s.burst)s.nextShot=Math.max(s.nextShot,now+SOLDIER_REACT_MS+Math.random()*600);}
  let move=null;s.anim="aim";if(active===false){move=d>.1?[-dx/d,-dy/d]:null;}
  else if(!s.los){if(!s.path||now-(s.pathAt||0)>3000){s.path=findPath(roadGraph(now),s.x,s.y,tp.x,tp.y);s.pathAt=now;}const wp=s.path?.length?pursuitPoint(s.path,s.x,s.y,5):{x:tp.x,y:tp.y},ex=wp.x-s.x,ey=wp.y-s.y,ed=Math.hypot(ex,ey)||1;move=[ex/ed,ey/ed];}
  else if(d>s.hold+8)move=[dx/d,dy/d];else if(d<s.hold-10)move=[-dx/d*.5,-dy/d*.5];
  if(move){const sp=active?(d>60?3.8:2.6):3.8;let ang=Math.atan2(move[1],move[0]),ok=false;for(const o of [0,.5,-.5,1,-1,1.6,-1.6]){const a=ang+o,nx=s.x+Math.cos(a)*sp*dt,ny=s.y+Math.sin(a)*sp*dt;if(!insideBuilding(nx,ny)){s.x=nx;s.y=ny;ang=a;ok=true;break;}}s.z=ground(s.x,s.y);s.speed=ok?sp:0;const face=s.los&&active?Math.atan2(dy,dx):ang;s.yaw+=angleTo(s.yaw,face)*Math.min(1,dt*9);s.anim=ok?(sp>3?"run":"walk"):"aim";}
  else{s.speed=0;s.yaw+=angleTo(s.yaw,Math.atan2(dy,dx))*Math.min(1,dt*10);}
  if(active&&s.los&&d<s.hold+20&&now>s.nextShot&&!s.burst){burstStarts=burstStarts.filter(at=>now-at<BURST_WINDOW_MS);if(burstStarts.length>=SOLDIER_BURSTS)s.nextShot=now+250+Math.random()*400;}
  if(active&&s.los&&d<s.hold+20&&now>s.nextShot&&Math.abs(angleTo(s.yaw,Math.atan2(dy,dx)))<.3){if(!s.burst){s.burst=3;burstStarts.push(now);}s.burst--;s.nextShot=s.burst?now+120:now+2200+Math.random()*1600;s.lastShotAt=now;const fx=Math.cos(s.yaw),fy=Math.sin(s.yaw),from=[s.x+fx*.55-fy*.12,s.y+fy*.55+fx*.12,s.z+1.4];
    shoot(from,t,clamp(.24-d/270-(t.speedMps||0)*.03,.04,.24),t.kind==="drone"?SOLDIER_DMG_DRONE:SOLDIER_DMG,"military-soldier",2.2);sound("shot",from[0],from[1],from[2],.45,.9);}}
function killSoldier(s,dir){if(s.dead)return;s.dead=true;s.hp=0;try{spawnNativeRagdoll({position:[s.x,s.y,s.z+.05],yaw:s.yaw-Math.PI/2,impulse:dir?[dir[0]*3,dir[1]*3,2.2]:[0,0,2],seed:`soldier-${s.slot}-${serial}`,id:`soldier-${s.slot}-${performance.now()}`});}catch{}
  window.dispatchEvent(new CustomEvent("arondight:combat-hit-confirm",{detail:{police:true,killed:true}}));}
// ------------------------------------------------------------ hits (player weapons) and blasts
function damage(f,dmg,dir){if(f.s){f.s.hp-=dmg;if(f.s.hp<=0)killSoldier(f.s,dir);return f.s.hp<=0;}
  if(f.h){f.h.hp-=dmg;if(f.h.hp<=0&&f.h.state!=="down"){f.h.state="down";f.h.v[2]=Math.min(f.h.v[2],2);sound("explosion",f.h.p[0],f.h.p[1],f.h.p[2],.8,.8);}return f.h.hp<=0;}
  if(f.tk){f.tk.hp-=dmg;if(f.tk.hp<=0&&!f.tk.dead){const p=f.tk.pose?.position;if(p)boom([p[0],p[1],p[2]+1.5],12,100,1);f.tk.dead=true;}return f.tk.hp<=0;}return false;}
// first army unit on a ray: soldier capsule, helicopter hull, tank box
export function hitNativeMilitary(origin,dir,range){
  let best=null;const test=(t,f)=>{if(t>0&&t<range&&(!best||t<best.t))best={t,f};};
  for(const s of soldiers){if(s.dead)continue;const hx=d=>{const t=((s.x-origin[0])*dir[0]+(s.y-origin[1])*dir[1])/(dir[0]*dir[0]+dir[1]*dir[1]||1e-9);return t;};const t=hx();if(t<=0)continue;const px=origin[0]+dir[0]*t-s.x,py=origin[1]+dir[1]*t-s.y,z=origin[2]+dir[2]*t;if(px*px+py*py<.3*.3&&z>s.z&&z<s.z+1.9)test(t,{s});}
  for(const h of helis){const ox=h.p[0]-origin[0],oy=h.p[1]-origin[1],oz=h.p[2]-origin[2],t=ox*dir[0]+oy*dir[1]+oz*dir[2];if(t<=0)continue;const px=origin[0]+dir[0]*t-h.p[0],py=origin[1]+dir[1]*t-h.p[1],pz=origin[2]+dir[2]*t-h.p[2];
    const fx=-Math.sin(h.yaw),fy=Math.cos(h.yaw),along=px*fx+py*fy,side=-px*fy+py*fx;if(Math.abs(along+1)<4.3&&Math.hypot(side,pz)<1.5)test(t,{h});}
  for(const tk of tanks){const p=tk.pose?.position;if(!p)continue;const c=Math.cos(tk.pose.yaw||0),s=Math.sin(tk.pose.yaw||0);let tmin=0,tmax=range;const o=[origin[0]-p[0],origin[1]-p[1],origin[2]-(p[2]+.3)],lo=[o[0]*c+o[1]*s,-o[0]*s+o[1]*c,o[2]],ld=[dir[0]*c+dir[1]*s,-dir[0]*s+dir[1]*c,dir[2]],half=[3.4,1.6,1.2];let ok=true;
    for(let k=0;k<3;k++){if(Math.abs(ld[k])<1e-9){if(Math.abs(lo[k])>half[k]){ok=false;break;}continue;}let t1=(-half[k]-lo[k])/ld[k],t2=(half[k]-lo[k])/ld[k];if(t1>t2)[t1,t2]=[t2,t1];tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmin>tmax){ok=false;break;}}if(ok)test(tmin,{tk});}
  return best?{kind:"military",t:best.t,f:best.f,point:[origin[0]+dir[0]*best.t,origin[1]+dir[1]*best.t,origin[2]+dir[2]*best.t]}:null;
}
export function shootNativeMilitary(hit,dir){if(!hit?.f)return false;const dmg=hit.f.tk?4:HIT,killed=damage(hit.f,dmg,hit.f.s?[dir[0],dir[1]]:null);window.dispatchEvent(new CustomEvent("arondight:combat-hit-confirm",{detail:{police:true,damage:dmg,killed}}));return true;}
function onExplosion(e){const d=e?.detail||{};if(d.kind==="military")return;const pos=d.position,x=Array.isArray(pos)?+pos[0]:+pos?.x,y=Array.isArray(pos)?+pos[1]:+pos?.y,z=Array.isArray(pos)?+pos[2]:+pos?.z||0;if(!Number.isFinite(x))return;const r=Math.max(2,Math.min(80,Number(d.radiusM)||6)),max=Math.max(40,Number(d.maxDamage)||80);
  for(const s of soldiers){if(s.dead)continue;const dd=Math.hypot(s.x-x,s.y-y);if(dd<r)damage({s},max*(1-dd/r)*1.5+20,[(s.x-x)/(dd||1),(s.y-y)/(dd||1)]);}
  for(const h of helis){const dd=Math.hypot(h.p[0]-x,h.p[1]-y,h.p[2]-z);if(dd<r+4)damage({h},max*(1-dd/(r+4))*2+40);}
  for(const tk of tanks){if(!tk.pose)continue;const dd=Math.hypot(tk.pose.position[0]-x,tk.pose.position[1]-y);if(dd<r+3)damage({tk},max*(1-dd/(r+3))*2.2+30);}}
function clearAll(){for(const tk of tanks)rig()?.removeBody?.(tk.id);helis=[];tanks=[];soldiers=[];shells=[];tracers=[];}
function banner(text){const v=viewport();if(!v)return;let b=document.getElementById("militaryBanner");if(!b){b=document.createElement("div");b.id="militaryBanner";b.style.cssText="position:absolute;left:50%;top:22%;transform:translateX(-50%);z-index:40;padding:10px 18px;border-radius:10px;background:#2c3320e8;border:2px solid #b8c27a;color:#e8f0b8;font:900 16px/1.1 Inter,system-ui,sans-serif;letter-spacing:.12em;pointer-events:none;text-align:center;transition:opacity .4s";v.appendChild(b);}b.textContent=text;b.style.opacity="1";clearTimeout(b._t);b._t=setTimeout(()=>{b.style.opacity="0";},3800);}
function spawnPending(nowMs,t){if(nowMs<pendingAt)return;pendingAt=nowMs+1000;if(pending.heli>0&&spawnHeli(nowMs,t.position))pending.heli--;if(pending.squad>0)pending.squad-=spawnSquad(nowMs,t.position,pending.squad);if(pending.tank>0&&spawnTank(nowMs,t.position))pending.tank--;}
function start(nowMs,t){if(!militaryEnabled)return;active=true;startedAt=nowMs;nextReinforce=nowMs+50000;wanted()?.setMilitary?.(true);pending.heli=1;pending.squad=SQUAD;pending.tank=1;pendingAt=0;spawnPending(nowMs,t);banner("⚠ MILITÄR RÜCKT AN");const v=viewport();if(v)v.dataset.militaryResponse="active";}
function stop(){active=false;pending.heli=pending.squad=pending.tank=0;wanted()?.setMilitary?.(false);for(const h of helis)if(h.state!=="down")h.state="leave";for(const tk of tanks)if(tk.state!=="wreck")tk.state="leave";banner("MILITÄR ZIEHT AB");const v=viewport();if(v)v.dataset.militaryResponse="withdrawing";}
function disableMilitary(){if(active){active=false;wanted()?.setMilitary?.(false);}alertAt=0;since5=0;pending.heli=pending.squad=pending.tank=0;clearAll();const v=viewport();if(v){v.dataset.militaryResponse="disabled";v.dataset.military="off/0h/0t/0s";}}
// ------------------------------------------------------------ draw
function draw(now){
  const r=game?.world?.renderer;if(!r?.upsert)return;
  const hb=[],hr=[],ht=[];for(const h of helis){const base=mul(T(...h.p),mul(RZ(h.yaw),RX(clamp(-Math.hypot(...h.v)*.004,-.25,0))));hb.push(base);hr.push(mul(base,mul(T(0,.2,1.25),RZ(h.rotor))));ht.push(mul(base,mul(T(.18,-7,1.1),RX(h.rotor*1.7))));}
  syncInstanced(r,"mil/heli",HELI_BODY,hb.length?packMatrices(hb):null,{material:{roughness:.7,metalness:.25}});syncInstanced(r,"mil/rotor",HELI_ROTOR,hr.length?packMatrices(hr):null,{material:{roughness:.5,alphaMode:"blend",color:[1,1,1,.75],doubleSided:true,castShadow:false}});syncInstanced(r,"mil/tailrotor",HELI_TAIL,ht.length?packMatrices(ht):null,{material:{roughness:.5,castShadow:false}});
  const th=[],tt=[];for(const tk of tanks){const p=tk.pose;if(!p)continue;const q=p.rotation||[0,0,0,1],[x,y,z,w]=q,rot=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,0,0,0,1],up=tk.up||[0,0,1];
    const base=mul(T(p.position[0]-up[0]*.9,p.position[1]-up[1]*.9,p.position[2]-up[2]*.9),rot);th.push(base);tt.push(mul(base,mul(T(-.3,0,1.65),RZ(tk.turret))));}
  syncInstanced(r,"mil/tank",TANK_HULL,th.length?packMatrices(th):null,{material:{roughness:.7,metalness:.25}});syncInstanced(r,"mil/turret",TANK_TURRET,tt.length?packMatrices(tt):null,{material:{roughness:.7,metalness:.25}});
  const sm=[],tint=[];for(const s of soldiers){if(s.dead)continue;sm.push(mul(T(s.x,s.y,s.z),RZ(s.yaw)));tint.push(.62,.72,.48,1);}
  syncInstanced(r,"mil/soldiers",ORIGINAL_HUMAN,sm.length?packMatrices(sm):null,{tints:sm.length?new Float32Array(tint):null,material:{roughness:.8}});
  const tr=[];for(let i=tracers.length-1;i>=0;i--){const t=tracers[i];if(now>t.until){tracers.splice(i,1);continue;}const d=[t.b[0]-t.a[0],t.b[1]-t.a[1],t.b[2]-t.a[2]],L=Math.hypot(...d)||1,y=d.map(v=>v/L),ref=Math.abs(y[2])<.95?[0,0,1]:[1,0,0];let x=[y[1]*ref[2]-y[2]*ref[1],y[2]*ref[0]-y[0]*ref[2],y[0]*ref[1]-y[1]*ref[0]];const xl=Math.hypot(...x)||1;x=x.map(v=>v/xl);const z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
    tr.push([...x,0,...y.map(v=>v*L),0,...z,0,...t.a,1]);}
  syncInstanced(r,"mil/tracers",TRACER,tr.length?packMatrices(tr):null,{material:{unlit:true,alphaMode:"blend",color:[1,1,1,.9],castShadow:false,frustumCulled:false}});
  for(const h of helis)if(now%400<200)light(h.p,{color:0xff3020,intensity:2,distance:12});
}
// ------------------------------------------------------------ loop
let lastFrame=performance.now();
export function tickNativeMilitary(nowMs=performance.now()){
  if(!game)return;const dt=Math.min(.05,Math.max(0,(nowMs-lastFrame)/1000));lastFrame=nowMs;
  if(!militaryEnabled){if(active||alertAt||helis.length||tanks.length||soldiers.length)disableMilitary();draw(nowMs);return;}
  const st=wanted()?.state,t=game.mode==="jet"?null:playerTarget();
  if(st&&t){if(st.stars>=5){since5||=nowMs;}else since5=0;
    if(!active&&!alertAt&&st.stars>=5&&((st.heat>=TRIGGER_HEAT&&nowMs-since5>TRIGGER_HOLD_MS)||st.heat>=TRIGGER_EXTREME_HEAT)){alertAt=nowMs;banner("⚠ MILITÄR ALARMIERT");const v=viewport();if(v)v.dataset.militaryResponse="alert";}
    else if(alertAt&&!active&&st.stars<5){alertAt=0;banner("MILITÄR-ALARM AUFGEHOBEN");const v=viewport();if(v)v.dataset.militaryResponse="alert-cancelled";}
    else if(alertAt&&!active&&nowMs-alertAt>ALERT_MS){alertAt=0;start(nowMs,t);}
    else if(active&&st.stars<=END_STARS)stop();
    if(active&&nowMs>nextReinforce){nextReinforce=nowMs+45000;if(helis.filter(h=>!h.dead&&h.state!=="down").length+pending.heli<2)pending.heli++;if(soldiers.filter(s=>!s.dead).length+pending.squad<MAX_SOLDIERS-1)pending.squad+=2;if(!tanks.some(k=>!k.dead&&k.state!=="wreck")&&!pending.tank)pending.tank=1;}
    if(active)spawnPending(nowMs,t);}
  if(t){for(const h of helis)stepHeli(h,t,nowMs,dt);for(const tk of tanks)stepTank(tk,t,nowMs,dt);for(const s of soldiers)stepSoldier(s,t,nowMs,dt);}
  helis=helis.filter(h=>!h.dead);
  for(let i=tanks.length-1;i>=0;i--)if(tanks[i].dead){rig()?.removeBody?.(tanks[i].id);tanks.splice(i,1);}
  if(!active){const pl=t?.position;for(const s of soldiers)if(!s.dead&&pl&&Math.hypot(s.x-pl.x,s.y-pl.y)>140&&!inView(s.x,s.y,s.z+1))s.dead=true;}
  soldiers=soldiers.filter(s=>!s.dead);
  stepShells(dt);draw(nowMs);
  const v=viewport();if(v){const s=`${active?"on":"off"}/${helis.length}h/${tanks.length}t/${soldiers.filter(q=>!q.dead).length}s`;if(v.dataset.military!==s)v.dataset.military=s;}
}
export function installNativeMilitary(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  globalThis.__militaryResponse={version:MILITARY_RESPONSE_VERSION,get active(){return active;},start(){const t=playerTarget();if(t)start(performance.now(),t);},stop,soldiers:()=>soldiers.filter(s=>!s.dead),
    get units(){return {helis:helis.map(h=>({id:h.id,state:h.state,hp:h.hp,p:h.p.map(v=>+v.toFixed(1))})),tanks:tanks.map(k=>({id:k.id,hp:k.hp,state:k.state,p:k.pose?.position?.map(v=>+v.toFixed(1))})),soldiers:soldiers.filter(s=>!s.dead).map(s=>({slot:s.slot,hp:s.hp,x:+s.x.toFixed(1),y:+s.y.toFixed(1)}))};}};
  addEventListener("arondight:world-explosion",onExplosion);addEventListener("arondight:world-reset",()=>{if(active)stop();clearAll();});
  addEventListener(WORLD_OPTIONS_EVENT,()=>{militaryEnabled=worldOption("military");if(!militaryEnabled)disableMilitary();});
}
