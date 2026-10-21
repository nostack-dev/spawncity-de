// Production race_track.mjs on the native engine: the 8-gate FPV course
// (3 laps, COURSE_SCALE 2.25, same gate centres / openings / names), the
// directional gate-crossing test (a pass only counts through the opening in
// race direction, 0.2 s debounce, first pass must be START / FINISH), lap /
// total / best-lap timing with the best lap kept in localStorage
// ("arondight45RaceBestLap"), gate colours (START amber, NEXT green with its
// glow, PASSED blue, others white), the orange cones / poles / launch pad,
// and the #soloRaceHud texts (LAP n/3, time, GATE n/8 · name, BEST).
// As in production the course belongs to the training world: in the real
// city the gates are not drawn (real_world_bootstrap hides the training
// objects) but the timing still follows the drone, and the HUD stays hidden
// by solo_layout (lap telemetry is not drawn over the flight image).
// Only an armed drone in flight is timed (raceTrack.update(..., ARMED)).
import {G,addMesh,finish,boxP,cylP,coneP,hex,T,S,RX,RZ,mul} from "./native_primitives.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";

export const NATIVE_RACE_VERSION="native-race-track-v1";
export const RACE_LAPS=3;
export const COURSE_SCALE=2.25;
const coursePoint=(x,y,z)=>[x*COURSE_SCALE,y*COURSE_SCALE,z];
export const RACE_GATES=Object.freeze([
  {name:"START / FINISH",center:coursePoint(-2.0,0.0,1.15),width:1.90,height:1.55,start:true},
  {name:"GATE 2",center:coursePoint(-5.0,-1.7,1.55),width:1.75,height:1.45},
  {name:"GATE 3",center:coursePoint(-7.0,1.25,1.05),width:1.65,height:1.35},
  {name:"HIGH GATE",center:coursePoint(-4.2,4.45,1.85),width:1.70,height:1.45},
  {name:"GATE 5",center:coursePoint(0.0,5.55,1.20),width:1.75,height:1.40},
  {name:"GATE 6",center:coursePoint(4.0,3.10,1.65),width:1.65,height:1.35},
  {name:"LOW GATE",center:coursePoint(4.55,-1.10,1.00),width:1.60,height:1.25},
  {name:"GATE 8",center:coursePoint(1.55,-3.85,1.45),width:1.70,height:1.40},
]);
const ACTIVE=0x6df5a8,NORMAL=0xf2f5f7,START=0xffc857,PASSED=0x58b8ff,POST=0.055;
const BEST_KEY="arondight45RaceBestLap";
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normalize=v=>{const n=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/n,v[1]/n,v[2]/n];};
export function formatTime(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return "—";
  const minutes=Math.floor(seconds/60),rest=seconds-minutes*60;
  return `${String(minutes).padStart(2,"0")}:${rest.toFixed(3).padStart(6,"0")}`;
}
// gate frames: local +X is the opening axis, local +Y race-forward
const FRAMES=RACE_GATES.map((gate,index)=>{
  const next=RACE_GATES[(index+1)%RACE_GATES.length];
  const normal=normalize([next.center[0]-gate.center[0],next.center[1]-gate.center[1],0]);
  const rightAxis=[-normal[1],normal[0],0];
  return {normal,rightAxis,rotZ:Math.atan2(rightAxis[1],rightAxis[0])};
});

// ------------------------------------------------------------ the race logic (production RaceTrack)
export class NativeRaceTrack{
  constructor({laps=RACE_LAPS,storage=null}={}){
    this.totalLaps=laps;this.storage=storage;this.visible=false;
    this.bestLap=this._loadBest();this.reset();
  }
  _store(){try{return this.storage||globalThis.localStorage||null;}catch{return null;}}
  _loadBest(){try{const value=Number(this._store()?.getItem(BEST_KEY));return Number.isFinite(value)&&value>0?value:null;}catch{return null;}}
  _saveBest(){try{if(this.bestLap)this._store()?.setItem(BEST_KEY,String(this.bestLap));}catch{}}
  setVisible(value){this.visible=Boolean(value);this.dirty=true;}
  reset(){
    this.started=false;this.finished=false;this.lap=0;this.nextGate=0;this.raceStart=0;this.lapStart=0;this.finishTime=null;this.lastLap=null;this.prevPosition=null;this.lastPassTime=-Infinity;this.dirty=true;
  }
  // production _paint(): the colour of every gate (and the glow of the next one)
  gateColors(){
    return RACE_GATES.map((gate,index)=>{
      let color=gate.start?START:NORMAL;
      if(this.started&&!this.finished&&index<this.nextGate&&this.nextGate!==0)color=PASSED;
      if(!this.finished&&index===this.nextGate)color=ACTIVE;
      const glow=index===this.nextGate&&!this.finished?.32:0;
      return {color,emissive:glow?ACTIVE:0,emissiveIntensity:glow};
    });
  }
  _crossedGate(index,a,b){
    const gate=RACE_GATES[index],normal=FRAMES[index].normal,right=FRAMES[index].rightAxis;
    const ar=sub(a,gate.center),br=sub(b,gate.center),da=dot(ar,normal),db=dot(br,normal);
    if(!(da<0&&db>=0))return false;
    const denom=da-db;if(Math.abs(denom)<1e-8)return false;
    const t=da/denom;
    const hit=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
    const rel=sub(hit,gate.center),u=dot(rel,right),v=rel[2];
    return Math.abs(u)<=gate.width*.5&&Math.abs(v)<=gate.height*.5;
  }
  update(position,simTime,enabled=true){
    const p=[position[0],position[1],position[2]];
    if(!this.visible||!enabled){this.prevPosition=p;return null;}
    if(!this.prevPosition){this.prevPosition=p;return null;}
    if(this.finished){this.prevPosition=p;return null;}
    if(simTime-this.lastPassTime<.20){this.prevPosition=p;return null;}
    if(!this._crossedGate(this.nextGate,this.prevPosition,p)){this.prevPosition=p;return null;}
    this.lastPassTime=simTime;
    const passed=this.nextGate;
    if(!this.started){
      // First correct crossing must be START/FINISH.
      this.started=true;this.lap=1;this.raceStart=simTime;this.lapStart=simTime;this.nextGate=1;
    }else if(passed===0){
      const lapTime=simTime-this.lapStart;this.lastLap=lapTime;
      if(!this.bestLap||lapTime<this.bestLap){this.bestLap=lapTime;this._saveBest();}
      if(this.lap>=this.totalLaps){this.finished=true;this.finishTime=simTime-this.raceStart;this.nextGate=0;}
      else{this.lap++;this.lapStart=simTime;this.nextGate=1;}
    }else if(passed===RACE_GATES.length-1){this.nextGate=0;}
    else{this.nextGate=passed+1;}
    this.prevPosition=p;this.dirty=true;
    return {passed,lap:this.lap,finished:this.finished};
  }
  snapshot(simTime){
    const current=this.started?(this.finished?this.lastLap:simTime-this.lapStart):0;
    const total=this.started?(this.finished?this.finishTime:simTime-this.raceStart):0;
    return {
      started:this.started,finished:this.finished,lap:this.lap,totalLaps:this.totalLaps,nextGate:this.nextGate,gateCount:RACE_GATES.length,
      currentLap:current,totalTime:total,lastLap:this.lastLap,bestLap:this.bestLap,
      currentLapText:formatTime(current),totalTimeText:formatTime(total),lastLapText:formatTime(this.lastLap),bestLapText:formatTime(this.bestLap),
      nextGateText:this.finished?"FINISHED":RACE_GATES[this.nextGate].name,
    };
  }
}
// production soloRaceHud texts
export function raceHudTexts(race){
  return {
    lap:race.finished?`FINISH · ${race.totalTimeText}`:(race.started?`LAP ${race.lap}/${race.totalLaps}`:`READY · ${race.totalLaps} LAPS`),
    time:race.finished?race.totalTimeText:race.currentLapText,
    gate:race.finished?"COURSE COMPLETE":`GATE ${race.nextGate+1}/${race.gateCount} · ${race.nextGateText}`,
    best:`BEST ${race.bestLapText}`
  };
}

// ------------------------------------------------------------ meshes (production primitives)
const WHITE=[1,1,1];
const UNIT_BOX=(()=>{const b=G();addMesh(b,boxP(1,1,1),T(0,0,0),WHITE);return finish(b);})();
// four bars per gate: [local translation, size]
function gateBars(gate){
  return [
    [[0,0,gate.height/2],[gate.width+POST*2,POST,POST]],
    [[0,0,-gate.height/2],[gate.width+POST*2,POST,POST]],
    [[-gate.width/2,0,0],[POST,POST,gate.height+POST*2]],
    [[gate.width/2,0,0],[POST,POST,gate.height+POST*2]]
  ];
}
export function raceGateMatrices(){
  const out=[];
  RACE_GATES.forEach((gate,index)=>{
    const frame=mul(T(...gate.center),RZ(FRAMES[index].rotZ));
    for(const [t,s] of gateBars(gate))out.push(mul(frame,mul(T(...t),S(...s))));
  });
  return out;
}
const GATE_MATRICES=packMatrices(raceGateMatrices());
const CONES=(()=>{const b=G(),col=hex(0xff714d);
  for(const [x,y] of [[-3.6,1.7],[-5.7,3.1],[-2.0,5.5],[2.0,4.6],[4.8,1.0],[3.4,-3.0],[-.4,-4.15]])addMesh(b,coneP(.095,.34,14),mul(T(x*COURSE_SCALE,y*COURSE_SCALE,.17),RX(Math.PI/2)),col);
  return finish(b);})();
const POLES=(()=>{const b=G(),col=hex(0x2e4150);
  for(const [x,y] of [[-5.8,.1],[2.8,1.1]])addMesh(b,cylP(.025,.025,.75,10),mul(T(x*COURSE_SCALE,y*COURSE_SCALE,.375),RX(Math.PI/2)),col);
  return finish(b);})();
const PAD=(()=>{const b=G();addMesh(b,boxP(.72,.72,.008),T(0,0,.006),hex(0x34495a));
  addMesh(b,boxP(.48,.055,.010),T(0,0,.012),hex(START));addMesh(b,boxP(.055,.48,.010),T(0,0,.012),hex(START));return finish(b);})();
const IDENTITY=packMatrices([T(0,0,0)]);
export const RACE_MESH_IDS=Object.freeze(["race/gates","race/cones","race/poles","race/pad"]);

// ------------------------------------------------------------ runtime
let game=null,installed=false,track=null,trainingWorld=false,drawnVisible=null,hud=null,hudAt=0;
const viewport=()=>typeof document==="undefined"?null:document.getElementById("viewport");
// emissive glow on a lit surface, approximated by adding it to the base colour
function gateTint(entry){const c=hex(entry.color),e=hex(entry.emissive||0),k=entry.emissiveIntensity||0;return [Math.min(1,c[0]+e[0]*k),Math.min(1,c[1]+e[1]*k),Math.min(1,c[2]+e[2]*k),1];}
function draw(force=false){
  const r=game?.world?.renderer;if(!r?.upsert)return;
  const show=Boolean(track?.visible&&trainingWorld);
  if(!show){if(drawnVisible!==false){for(const id of RACE_MESH_IDS)syncInstanced(r,id,null,null);drawnVisible=false;}return;}
  if(!force&&drawnVisible===true&&!track.dirty)return;
  const tints=new Float32Array(RACE_GATES.length*4*4);
  track.gateColors().forEach((entry,i)=>{const t=gateTint(entry);for(let k=0;k<4;k++)tints.set(t,(i*4+k)*4);});
  syncInstanced(r,"race/gates",UNIT_BOX,GATE_MATRICES,{tints,material:{roughness:.42,metalness:.08}});
  if(drawnVisible!==true){
    syncInstanced(r,"race/cones",CONES,IDENTITY,{material:{roughness:.75}});
    syncInstanced(r,"race/poles",POLES,IDENTITY,{material:{roughness:.7}});
    syncInstanced(r,"race/pad",PAD,IDENTITY,{material:{roughness:.85,castShadow:false}});
  }
  track.dirty=false;drawnVisible=true;
}
function writeHud(now){
  if(typeof document==="undefined"||!track)return;
  if(now-hudAt<100)return;hudAt=now;
  const texts=raceHudTexts(track.snapshot(now/1000));
  hud||={lap:document.getElementById("soloLap"),time:document.getElementById("soloRaceTime"),gate:document.getElementById("soloGate"),best:document.getElementById("soloBest")};
  for(const k of ["lap","time","gate","best"]){const el=hud[k];if(el&&el.isConnected!==false&&el.textContent!==texts[k])el.textContent=texts[k];}
  if(hud.lap&&hud.lap.isConnected===false)hud=null;
  const v=viewport();if(v){const s=`${track.started?(track.finished?"finished":`lap${track.lap}`):"ready"}/${track.nextGate}`;if(v.dataset.raceTrack!==s)v.dataset.raceTrack=s;}
}
// The course belongs to the training world (production hides it in the real city).
export function setNativeRaceWorld(training){trainingWorld=Boolean(training);if(track)track.dirty=true;draw(true);}
export function nativeRaceTrack(){return track;}
export function tickNativeRace(now=performance.now()){
  if(!game||!track)return;
  // production: setVisible(true) for the whole solo session; timing only an armed drone
  const drone=game.mode==="drone",p=drone?game.flight?.position?.():null;
  const armed=Boolean(drone&&game.flightControls?.arm&&!globalThis.__arondightDroneDamageModel?.destroyed);
  if(p&&Number.isFinite(p[0]))track.update(p,now/1000,armed);
  else track.prevPosition=null;
  draw();
  writeHud(now);
}
export function installNativeRace(runtime,{storage=null}={}){
  game=runtime;
  if(!track){track=new NativeRaceTrack({laps:RACE_LAPS,storage});track.setVisible(true);}
  if(installed||typeof window==="undefined")return track;installed=true;
  const reset=()=>{track?.reset();hudAt=0;};
  addEventListener("arondight:world-reset",reset);
  addEventListener("click",e=>{if(e.target instanceof Element&&e.target.closest("#soloReset,#reset"))reset();},{capture:true});
  globalThis.__arondightRace={version:NATIVE_RACE_VERSION,laps:RACE_LAPS,gates:RACE_GATES,
    get lap(){return track?.lap||0;},
    snapshot(){return track?.snapshot(performance.now()/1000)||null;},
    reset};
  return track;
}
