// Live weapon rules on the native engine. Timings and the weapon lists are the
// ones the game already uses. Hits are Box3D rays. The picture is NativeEffects.
// Nothing here builds a second world or imports Three.js.
import {bulletImpulse} from "./ballistics.mjs";

export const NATIVE_WEAPONS_VERSION="live-rates-box3d-ray-v1";
const FOOT=["smg","glock","sniper","grenade","rocket","fists","knife"];
const DRONE=["gun","missile","guided"];
const FOOT_MS={smg:55,glock:110,sniper:1150,grenade:760,rocket:900,fists:300,knife:380};
const FOOT_RANGE={smg:180,glock:120,sniper:1500,fists:1.8,knife:1.6};
const FOOT_KIND={smg:"9mm",glock:"9mm",sniper:".50bmg"};
const NAMES={smg:"SMG",glock:"PISTOL",sniper:"SNIPER",grenade:"GRENADE",rocket:"ROCKET",fists:"FISTS",knife:"KNIFE",gun:"GUN",missile:"ROCKETS",guided:"GUIDED"};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
function unit(v){const l=Math.hypot(v[0],v[1],v[2]);return l<1e-6?[0,1,0]:[v[0]/l,v[1]/l,v[2]/l];}
function selfId(mode){return {foot:"player-foot",car:"player-car",jet:"player-jet"}[mode]||"";}

export function installNativeWeapons(game,{armed=()=>false}={}){
  if(!game?.rigids?.raycast||!game?.world?.effects?.emit)throw Error("weapons need the native engine");
  const state={foot:"smg",drone:"gun",nextFoot:0,nextDrone:0,held:false,jetHeld:false,touchFire:false};
  const rounds=[];
  let frames=0,fpsWindow=performance.now(),fps=0;
  const label=()=>NAMES[game.mode==="foot"?state.foot:game.mode==="drone"?state.drone:""]||"";
  function publish(){const view=typeof document==="undefined"?null:document.getElementById("viewport");if(view){view.dataset.footWeapon=state.foot;view.dataset.droneExtendedWeapon=state.drone;}}
  function aim(clientX,clientY){
    const cam=game.world.camera;if(!cam?.eye||!cam?.target)return null;
    if(Number.isFinite(clientX)&&Number.isFinite(clientY)&&game.world.pickGameplay){
      const hit=game.world.pickGameplay(clientX,clientY,{ignoreId:selfId(game.mode)});
      if(hit?.ray?.direction)return {origin:[...hit.ray.origin],direction:unit(hit.ray.direction)};
    }
    return {origin:[...cam.eye],direction:unit(sub(cam.target,cam.eye))};
  }
  function impact(hit,kind,direction){
    if(!hit?.point)return;
    game.world.effects.emit({kind:"spark",position:hit.point,velocity:[0,0,1.2],lifeMs:180,size:.18});
    if(hit.id&&hit.id!==selfId(game.mode))game.rigids.applyImpulse(hit.id,bulletImpulse(direction,kind),{point:hit.point});
  }
  function tracer(from,to){
    const dir=unit(sub(to,from)),dist=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
    game.world.effects.emit({kind:"tracer",position:add(from,dir,Math.min(dist,.6)),velocity:dir.map(v=>v*40),lifeMs:70,size:.08,gravity:0});
    game.world.effects.emit({kind:"muzzle",position:from,velocity:[0,0,0],lifeMs:40,size:.22});
  }
  function shootHitscan(now,range,kind,clientX,clientY){
    const ray=aim(clientX,clientY);if(!ray)return false;
    const hit=game.rigids.raycast(ray.origin,ray.direction,range);
    const end=hit?.point||add(ray.origin,ray.direction,Math.min(range,80));
    tracer(ray.origin,end);
    if(hit&&hit.id!==selfId(game.mode))impact(hit,kind,ray.direction);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("arondight:weapon-fired",{detail:{mode:game.mode,at:now}}));
    return true;
  }
  function launch(now,{speed,life,blast,guided,clientX,clientY}){
    const ray=aim(clientX,clientY);if(!ray)return false;
    const look=game.rigids.raycast(ray.origin,ray.direction,420);
    rounds.push({pos:[...ray.origin],dir:[...ray.direction],speed,life,blast,target:guided?look?.id||null:null,born:now});
    game.world.effects.emit({kind:"muzzle",position:ray.origin,velocity:[0,0,0],lifeMs:80,size:.4});
    return true;
  }
  function fireFoot(now,clientX,clientY){
    if(game.mode!=="foot"||now<state.nextFoot)return false;
    const mode=state.foot;
    const ok=mode==="grenade"||mode==="rocket"
      ?launch(now,{speed:mode==="rocket"?40:18,life:mode==="rocket"?4:2.4,blast:mode==="rocket"?5:6,guided:mode==="rocket",clientX,clientY})
      :shootHitscan(now,FOOT_RANGE[mode],FOOT_KIND[mode]||"9mm",clientX,clientY);
    if(ok)state.nextFoot=now+FOOT_MS[mode];
    return ok;
  }
  function fireDrone(now){
    if(game.mode!=="drone"||now<state.nextDrone||!armed())return false;
    const mode=state.drone;
    if(mode==="gun"){if(!shootHitscan(now,650,"5.56"))return false;state.nextDrone=now+92;return true;}
    if(!launch(now,{speed:mode==="guided"?48:31,life:mode==="guided"?6:7.2,blast:mode==="guided"?9:8,guided:mode==="guided"}))return false;
    state.nextDrone=now+950;return true;
  }
  const foot={
    get mode(){return state.foot;},
    setMode(mode){if(!FOOT.includes(mode))return state.foot;state.foot=mode;publish();return mode;},
    toggle(){state.foot=FOOT[(FOOT.indexOf(state.foot)+1)%FOOT.length];publish();return state.foot;},
    fireAt({clientX,clientY,at}={}){return fireFoot(Number(at)||performance.now(),clientX,clientY);}
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
    if(e.button!==0)return;
    const canvas=game.world.renderer?.canvas;
    if(document.pointerLockElement===canvas){
      if(game.mode==="foot"){state.held=true;foot.fireAt({clientX:e.clientX,clientY:e.clientY});}
      else if(game.mode==="jet")state.jetHeld=true;
      return;
    }
    if(e.pointerType==="mouse")return;
    if(e.target instanceof Element&&e.target.closest("#soloLeft,#soloRight,#soloClearance,#footHud,#toolbar,button"))return;
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
  }
  return {
    get fps(){return fps;},get weapon(){return label();},
    tick(now=performance.now()){
      frames++;
      if(now-fpsWindow>=500){fps=Math.round(frames*1000/(now-fpsWindow));frames=0;fpsWindow=now;}
      const sample=globalThis.__arondightDesktopDroneInput;
      if(game.mode==="drone"&&(sample?.fire||state.touchFire))fireDrone(now);
      if(game.mode==="foot"&&state.held&&state.foot==="smg")foot.fireAt({});
      if(game.mode==="jet"&&state.jetHeld&&now>=state.nextDrone){if(shootHitscan(now,650,"5.56"))state.nextDrone=now+92;}
      const dt=Math.min(.05,1/60);
      for(let i=rounds.length-1;i>=0;i--){
        const p=rounds[i];
        if(p.target){const pose=game.rigids.pose(p.target);if(pose?.position)p.dir=unit(sub(pose.position,p.pos));}
        const step=p.speed*dt,hit=game.rigids.raycast(p.pos,p.dir,step);
        if(hit&&hit.id!==selfId(game.mode)){
          game.world.effects.emit({kind:"blast",position:hit.point,velocity:[0,0,2],lifeMs:280,size:p.blast*.35});
          impact(hit,"9mm",p.dir);rounds.splice(i,1);continue;
        }
        p.pos=add(p.pos,p.dir,step);p.life-=dt;
        if((frames&3)===0)game.world.effects.emit({kind:"smoke",position:p.pos,velocity:[0,0,.4],lifeMs:220,size:.25});
        if(p.life<=0)rounds.splice(i,1);
      }
    },
    dispose(){if(typeof window==="undefined")return;removeEventListener("keydown",onKey);removeEventListener("keyup",onKeyUp);removeEventListener("mousedown",onDown,true);removeEventListener("mouseup",onUp,true);removeEventListener("pointerdown",onDown,true);removeEventListener("pointerup",onUp,true);}
  };
}
