// Facade marks, interior floors and multiplayer combat.
// Crack, soot, breach counts and VS damage are the live ones.
import {fromTRS} from "./native_render_math.mjs";

const CRACKS=160,SOOTS=48,BREACHES=64;
const VS_WEAPON_DAMAGE={smg:13,glock:26,sniper:95,fists:12,gun:13,"5.56":13};
const VS_ZONE={head:3,torso:1,legs:.65};
const REGEN_DELAY_MS=4000,REGEN_HP_PER_S=8;
const cracks=[],soots=[],breaches=[],peers=new Map();
let health=100,lastHurt=-Infinity;
const quad=(color)=>({positions:new Float32Array([-.5,-.02,0,.5,-.02,0,.5,.02,.4,-.5,-.02,0,.5,.02,.4,-.5,.02,.4]),normals:new Float32Array(Array(18).fill(0).map((_,i)=>i%3===2?1:0)),colors:new Float32Array(color)});
const CRACK=quad([.9,.95,1,.9,.95,1,.9,.95,1,.9,.95,1,.9,.95,1,.9,.95,1]);
const SOOT=quad([.15,.13,.1,.15,.13,.1,.15,.13,.1,.15,.13,.1,.15,.13,.1,.15,.13,.1]);
function pack(list){
  const src=list.slice(-40),out=new Float32Array(src.length*16);
  for(let i=0;i<src.length;i++)if(src[i]?.length===16)out.set(src[i],i*16);
  return out;
}
function paint(renderer,id,geo,list){
  if(!list.length){renderer.remove(id);return;}
  renderer.upsert(id,{...geo,instances:{transforms:pack(list)},material:{doubleSided:true,castShadow:false}});
}
export function addGlassCrack(point,size=.16){
  if(!point)return false;
  cracks.push(fromTRS(point,[0,0,0,1],[size*4,1,size*4]));
  if(cracks.length>CRACKS)cracks.shift();
  return true;
}
export function addWallSoot(point,r=.3){
  if(!point)return false;
  soots.push(fromTRS(point,[0,0,0,1],[r*3,1,r*3]));
  if(soots.length>SOOTS)soots.shift();
  return true;
}
export function addWallBreach(point,strength=1){
  if(!point)return false;
  breaches.push(fromTRS(point,[0,0,0,1],[.4*strength,1,.6*strength]));
  if(breaches.length>BREACHES)breaches.shift();
  return true;
}
export function installNativeCombat(){
  globalThis.__arondightVsMultiplayer={
    version:"native-vs-combat-v1",
    health:()=>health,
    minimapPlayers:()=>[...peers.values()],
    registerVsHit(hit){
      const weapon=String(hit?.weapon||"gun");
      const zone=String(hit?.zone||"torso");
      const damage=Math.max(1,Math.min(100,Math.round((VS_WEAPON_DAMAGE[weapon]??20)*(VS_ZONE[zone]??1))));
      const target=String(hit?.target||"");
      if(!target||target==="self"){health=Math.max(0,health-damage);lastHurt=performance.now();return true;}
      const peer=peers.get(target)||{id:target,p:[0,0],health:100,dead:false,color:"#40dcff"};
      peer.health=Math.max(0,peer.health-damage);peer.dead=peer.health<=0;peers.set(target,peer);
      return true;
    }
  };
}
export function tickNativeCombat(game){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  if(health>0&&health<100&&performance.now()-lastHurt>REGEN_DELAY_MS)health=Math.min(100,health+REGEN_HP_PER_S/60);
  const view=document.getElementById("viewport");
  if(view){view.dataset.vsLocalHealth=String(Math.round(health));view.dataset.facadeCracks=String(cracks.length);}
  paint(renderer,"facade/cracks",CRACK,cracks);
  paint(renderer,"facade/soot",SOOT,soots);
  paint(renderer,"facade/breach",SOOT,breaches);
}
export function enterInteriorFloor(game,door){
  if(!door)return false;
  const levels=[1,4.2,7.4];
  const floor=door.floor||0;
  game.rigids.setPose("player-foot",{position:[door.in[0],door.in[1],levels[Math.min(floor,levels.length-1)]]});
  return true;
}
