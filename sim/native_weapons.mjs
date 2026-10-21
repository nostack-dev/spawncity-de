// Live weapon rules on the native engine. Timings and the weapon lists are the
// ones the game already uses. Hits are Box3D rays. The picture is NativeEffects.
// Nothing here builds a second world or imports Three.js.
import {bulletImpulse} from "./ballistics.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {findXboxGamepad} from "./xbox_gamepad.mjs";
import {nativeFireShot,tickNativeFireFx} from "./native_fire_fx.mjs";
import {hitNativePeople} from "./native_city_life.mjs";
import {hitNativeCops} from "./native_police_ground.mjs";
import {hitNativeCows,markNativeImpact} from "./native_world_life.mjs";
import {markFacade} from "./native_session.mjs";
import {addGlassCrack,addWallSoot,addWallBreach} from "./native_combat.mjs";
import {hitNativeThreats} from "./native_threats.mjs";
import {createNativeOrdnance} from "./native_ordnance.mjs";
import {createNativeFootFire} from "./native_foot_fire.mjs";
import {takeNativeCarBooms} from "./native_city_life.mjs";
import {ORIGINAL_MISSILE,ORIGINAL_GUIDED,ORIGINAL_GRENADE} from "./native_actor_meshes.mjs";

export const NATIVE_WEAPONS_VERSION="live-glock-sniper-melee-v1";
const FOOT=["smg","glock","sniper","grenade","rocket","fists","knife"];
const DRONE=["gun","missile","guided"];
const FOOT_MS={smg:55,glock:110,sniper:1150,grenade:760,rocket:900,fists:300,knife:380};
const NAMES={smg:"SMG",glock:"PISTOL",sniper:"SNIPER",grenade:"GRENADE",rocket:"ROCKET",fists:"FISTS",knife:"KNIFE",gun:"GUN",missile:"ROCKETS",guided:"GUIDED"};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
function unit(v){const l=Math.hypot(v[0],v[1],v[2]);return l<1e-6?[0,1,0]:[v[0]/l,v[1]/l,v[2]/l];}
// Live missiles point along local -Z. This is setFromUnitVectors((0,0,-1), direction).
function facing(dir){
  const d=unit(dir),c=[d[1],-d[0],0],dot=-d[2];
  if(dot>0.999999)return [0,0,0,1];
  if(dot<-0.999999)return [1,0,0,0];
  const s=Math.sqrt((1+dot)*2),inv=1/s;
  return [c[0]*inv,c[1]*inv,c[2]*inv,s*.5];
}
const ORDNANCE={missile:ORIGINAL_MISSILE,guided:ORIGINAL_GUIDED,grenade:ORIGINAL_GRENADE};
function selfId(mode){return {foot:"player-foot",car:"player-car",jet:"player-jet"}[mode]||"";}

export function installNativeWeapons(game,{armed=()=>false}={}){
  if(!game?.rigids?.raycast||!game?.world?.effects?.emit)throw Error("weapons need the native engine");
  const state={foot:"smg",drone:"gun",nextFoot:0,nextDrone:0,held:false,jetHeld:false,touchFire:false};
  const drawn=new Set();
  let frames=0,fpsWindow=performance.now(),fps=0;
  const label=()=>NAMES[game.mode==="foot"?state.foot:game.mode==="drone"?state.drone:""]||"";
  function publish(){const view=typeof document==="undefined"?null:document.getElementById("viewport");if(view){view.dataset.footWeapon=state.foot;view.dataset.droneExtendedWeapon=state.drone;}}
  function aim(clientX,clientY){
    const cam=game.world.camera;if(!cam?.eye||!cam?.target)return null;
    const locked=typeof document!=="undefined"&&(document.pointerLockElement===game.world.renderer?.canvas||document.pointerLockElement===document.getElementById("viewport"));
    // Locked play aims through the crosshair, never the stale click point.
    const usePoint=!locked&&Number.isFinite(clientX)&&Number.isFinite(clientY);
    if(usePoint&&game.world.pickGameplay){
      const hit=game.world.pickGameplay(clientX,clientY,{ignoreId:selfId(game.mode)});
      if(hit?.ray?.direction)return muzzle(hit.ray.origin,unit(hit.ray.direction));
    }
    return muzzle(cam.eye,unit(sub(cam.target,cam.eye)));
  }
  // The eye sits inside the player's head. Start the round in front of the body
  // so the first hit is the target, not yourself.
  function muzzle(origin,direction){
    const d=unit(direction),push=game.mode==="foot"?0.55:0.2;
    return {origin:add(origin,d,push),direction:d};
  }
  function impact(hit,kind,direction){
    if(!hit?.point)return;
    game.world.effects.emit({kind:"spark",position:hit.point,velocity:[0,0,1.2],lifeMs:180,size:.18});
    if(hit.id&&hit.id!==selfId(game.mode))game.rigids.applyImpulse(hit.id,bulletImpulse(direction,kind),{point:hit.point});
  }
  function tracer(from,to,mode,weapon,speed){
    nativeFireShot(game,{from,to,mode,weapon,speed});
  }
  function shootHitscan(now,range,kind,clientX,clientY){
    const ray=aim(clientX,clientY);if(!ray)return false;
    const hit=game.rigids.raycast(ray.origin,ray.direction,range);
    const person=hitNativePeople(ray.origin,ray.direction,range)||hitNativeCops(ray.origin,ray.direction,range)||hitNativeCows(ray.origin,ray.direction,range)||hitNativeThreats(ray.origin,ray.direction,range);
    const end=person?.point||hit?.point||add(ray.origin,ray.direction,Math.min(range,80));
    if(person?.point||hit?.point){
      const point=person?.point||hit.point;
      markNativeImpact(point);markFacade(point);
      addGlassCrack(point);addWallSoot(point);if(Math.random()<.2)addWallBreach(point);
    }
    tracer(ray.origin,end,game.mode,game.mode==="foot"?state.foot:state.drone);
    ordnance.shotLine(ray.origin,end);
    if(hit&&hit.id!==selfId(game.mode))impact(hit,kind,ray.direction);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("arondight:weapon-fired",{detail:{mode:game.mode,weapon:game.mode==="foot"?state.foot:state.drone,at:now}}));
    return true;
  }
  function fired(now,weapon){
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("arondight:weapon-fired",{detail:{mode:game.mode,weapon,at:now}}));
  }
  const ordnance=createNativeOrdnance(game,{aim,footWeapon:()=>state.foot,droneWeapon:()=>state.drone});
  const shots=createNativeFootFire(game,{aim,tracer:(from,to,mode,weapon,speed)=>tracer(from,to,mode,weapon,speed)});
  function fireFoot(now,clientX,clientY,hand=0,{hold=false}={}){
    if(game.mode!=="foot")return false;
    const mode=state.foot;
    if(mode==="grenade"||mode==="rocket"){
      if(now<state.nextFoot)return false;
      const thrown=ordnance.launchFoot(mode,now);
      if(!thrown)return false;
      state.nextFoot=now+(thrown==="remote"?380:FOOT_MS[mode]);
      fired(now,mode);
      return true;
    }
    let ok=false;
    if(mode==="smg"){if(now<state.nextFoot)return false;ok=shots.smg(now,clientX,clientY);if(ok)state.nextFoot=now+FOOT_MS.smg;}
    else if(mode==="glock")ok=shots.glock(now,clientX,clientY,hand,hold);
    else if(mode==="sniper")ok=shots.sniper(now,clientX,clientY);
    else if(mode==="fists")ok=shots.fists(now,clientX,clientY,hand);
    else if(mode==="knife")ok=shots.knife(now,clientX,clientY);
    if(!ok)return false;
    fired(now,mode);
    return true;
  }
  function fireDrone(now){
    if(game.mode!=="drone"||now<state.nextDrone||!armed())return false;
    const mode=state.drone;
    if(mode==="gun"){if(!shootHitscan(now,650,"5.56"))return false;state.nextDrone=now+92;return true;}
    if(!ordnance.launchDrone(mode,now))return false;
    state.nextDrone=now+520;
    fired(now,mode);
    return true;
  }
  const foot={
    get mode(){return state.foot;},
    setMode(mode){if(!FOOT.includes(mode))return state.foot;state.foot=mode;publish();return mode;},
    toggle(){state.foot=FOOT[(FOOT.indexOf(state.foot)+1)%FOOT.length];publish();return state.foot;},
    fireAt({clientX,clientY,at,hand=0,hold=false}={}){return fireFoot(Number(at)||performance.now(),clientX,clientY,hand,{hold});},
    throwHandGrenade(opts){return ordnance.throwHand(opts);},
    explodeAt(position,source){return ordnance.explodeAt(position,source);}
  };
  const drone={
    get mode(){return state.drone==="gun"?"gun":"missile";},
    get displayMode(){return state.drone;},
    setMode(mode){if(!DRONE.includes(mode))return state.drone;state.drone=mode;publish();return mode;},
    toggle(){state.drone=DRONE[(DRONE.indexOf(state.drone)+1)%DRONE.length];publish();return state.drone;},
    fireMissile(){if(state.drone==="gun")return false;const was=state.drone;return fireDrone(performance.now())&&was!=="gun";}
  };
  globalThis.__arondightFootWeapons=foot;
  globalThis.__arondightDroneWeapons=drone;
  publish();
  const onKey=e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
    if(e.code==="KeyQ"&&(game.mode==="foot"||game.mode==="drone")){(game.mode==="foot"?foot:drone).toggle();e.preventDefault();}
    if(e.code==="Space"&&game.mode==="jet")state.jetHeld=true;
  };
  const onKeyUp=e=>{if(e.code==="Space")state.jetHeld=false;};
  const onDown=e=>{
    if(e.button!=null&&e.button!==0)return;
    const now=performance.now();
    if(now-(state.lastDown||0)<30)return;
    const canvas=game.world.renderer?.canvas;
    const view=typeof document==="undefined"?null:document.getElementById("viewport");
    const locked=document.pointerLockElement===canvas||document.pointerLockElement===view;
    const mouse=e.pointerType==="mouse"||e.type==="mousedown";
    if(mouse){
      const ui=e.target instanceof Element&&e.target.closest("button,a,input,select,textarea,label,dialog,#soloTopbar,#mobileGameplayDock,#gameMenu,#toolbar");
      if(!locked&&(ui||!(view&&(e.target===canvas||view.contains(e.target)))))return;
      state.lastDown=now;
      if(game.mode==="foot"){state.held=true;foot.fireAt({clientX:e.clientX,clientY:e.clientY});}
      else if(game.mode==="jet"||game.mode==="car"){state.held=true;state.jetHeld=game.mode==="jet";}
      return;
    }
    if(e.target instanceof Element&&e.target.closest("#soloLeft,#soloRight,#soloClearance,#footHud,#toolbar,button"))return;
    state.lastDown=now;
    if(game.mode==="drone")state.touchFire=true;
  };
  const onUp=e=>{if(e.button===0||e.type==="pointerup"){state.held=false;state.jetHeld=false;state.touchFire=false;}};
  if(typeof window!=="undefined"){
    addEventListener("keydown",onKey);
    addEventListener("keyup",onKeyUp);
    addEventListener("mousedown",onDown,true);
    addEventListener("mouseup",onUp,true);
    addEventListener("pointerdown",onDown,true);
    addEventListener("pointerup",onUp,true);
    const fireBtn=document.getElementById("footFire");
    const onFire=e=>{
      if(game.mode!=="foot")return;
      e.preventDefault();e.stopPropagation();
      state.held=true;
      const rect=document.getElementById("viewport")?.getBoundingClientRect();
      const hand=state.foot==="fists"&&rect&&e.clientX<rect.left+rect.width/2?1:0;
      foot.fireAt({clientX:e.clientX,clientY:e.clientY,hand});
    };
    fireBtn?.addEventListener("pointerdown",onFire,true);
    installNativeWeapons.fireBtn=fireBtn;installNativeWeapons.onFire=onFire;
  }
  function paintRounds(){
    const renderer=game.world?.renderer;
    if(!renderer?.upsert)return;
    const batches={missile:[],guided:[],grenade:[]};
    for(const p of ordnance.projectiles){
      const kind=batches[p.mesh]?p.mesh:"missile";
      const dir=Math.hypot(p.vel?.[0]||0,p.vel?.[1]||0,p.vel?.[2]||0)>.05?p.vel:[0,1,0];
      batches[kind].push(...fromTRS(p.pos,facing(dir)));
    }
    for(const kind of Object.keys(batches)){
      const id="ordnance/"+kind,data=batches[kind];
      if(!data.length){if(drawn.has(kind)){renderer.remove(id);drawn.delete(kind);}continue;}
      const transforms=new Float32Array(data);
      if(drawn.has(kind))renderer.updateInstances(id,{transforms});
      else{renderer.upsert(id,{...ORDNANCE[kind],instances:{transforms},material:{color:[1,1,1,1],doubleSided:true,castShadow:false,frustumCulled:false}});drawn.add(kind);}
    }
  }
  return {
    get fps(){return fps;},get weapon(){return label();},
    tick(now=performance.now()){
      frames++;
      if(now-fpsWindow>=500){fps=Math.round(frames*1000/(now-fpsWindow));frames=0;fpsWindow=now;}
      const sample=globalThis.__arondightDesktopDroneInput;
      const pad=findXboxGamepad(typeof navigator==="undefined"?null:navigator.getGamepads?.());
      const rt=pad?Math.max(0,Number(pad.buttons?.[7]?.value)||(pad.buttons?.[7]?.pressed?1:0))>.5:false;
      if(game.mode==="drone"&&(sample?.fire||state.touchFire||rt))fireDrone(now);
      if(game.mode==="foot"&&(state.held||rt)){
        if(state.foot==="smg")foot.fireAt({});
        else if(state.foot==="glock")foot.fireAt({hold:true});
        else if(rt&&!state.padFire)foot.fireAt({});
      }
      state.padFire=rt;
      if(game.mode==="jet"&&!globalThis.__nativeJetRocketSelected&&(state.jetHeld||rt||sample?.fire)&&now>=state.nextDrone){if(shootHitscan(now,650,"5.56"))state.nextDrone=now+92;}
      if(game.mode==="car"&&(state.held||rt)&&now>=state.nextDrone){if(shootHitscan(now,180,"9mm"))state.nextDrone=now+110;}
      const dt=Math.min(.05,(now-(paintRounds.last||now))/1000)||1/60;paintRounds.last=now;
      ordnance.tick(now,dt);
      for(const boom of takeNativeCarBooms())ordnance.explodeCar([boom.x,boom.y,boom.z],boom);
      paintRounds();
      tickNativeFireFx(game,now);
    },
    dispose(){
      const renderer=game.world?.renderer;
      for(const kind of drawn)renderer?.remove?.("ordnance/"+kind);
      drawn.clear();if(typeof window==="undefined")return;removeEventListener("keydown",onKey);removeEventListener("keyup",onKeyUp);removeEventListener("mousedown",onDown,true);removeEventListener("mouseup",onUp,true);removeEventListener("pointerdown",onDown,true);removeEventListener("pointerup",onUp,true);
      installNativeWeapons.fireBtn?.removeEventListener("pointerdown",installNativeWeapons.onFire,true);
    }
  };
}
