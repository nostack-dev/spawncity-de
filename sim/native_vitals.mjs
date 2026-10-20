// Pilot and drone health, using the live formulas. No ragdoll mesh: death
// locks input, drops the camera and R brings you back.
import {DRONE_MAX_HP,DRONE_REPLACEMENT_COOLDOWN_MS,PLAYER_MAX_HP,droneReplacementRemainingMs,healthAfterDamage} from "./player_vitals_logic.mjs";

const TOLERANCE=1.18;
export function installNativeVitals(game){
  let playerHp=PLAYER_MAX_HP,droneHp=DRONE_MAX_HP,playerDead=false,droneDestroyed=false,readyAt=-Infinity,deathAt=0,forcedFoot=false,hud=null;
  const paint=()=>{
    if(typeof document==="undefined")return;
    const view=document.getElementById("viewport");
    if(view){view.dataset.playerHp=String(Math.round(playerHp));view.dataset.playerDead=playerDead?"1":"0";view.dataset.droneHp=String(Math.round(droneHp));view.dataset.droneDestroyed=droneDestroyed?"1":"0";}
    if(!hud&&view){hud=document.createElement("div");hud.id="playerVitalsHud";hud.innerHTML='<span data-vital="player"><i>PILOT</i><b></b></span><span data-vital="drone"><i>DRONE</i><b></b></span>';view.appendChild(hud);
      const style=document.createElement("style");style.dataset.playerVitals="native";style.textContent="#playerVitalsHud{position:absolute;z-index:18;left:max(12px,env(safe-area-inset-left));top:max(50px,env(safe-area-inset-top));display:flex;gap:8px;padding:6px 8px;border:1px solid #ffffff28;border-radius:9px;background:#07111ad9;color:#f2f8ff;pointer-events:none;font:950 10px system-ui}#playerVitalsHud i{font:850 7px system-ui;font-style:normal;letter-spacing:.08em;color:#92a9b9;margin-right:5px}#playerVitalsHud [data-vital=player] b{color:#9cf0c9}#playerVitalsHud [data-vital=drone] b{color:#8edcff}";document.head.appendChild(style);}
    if(hud){hud.querySelector('[data-vital="player"] b').textContent=String(Math.round(playerHp));hud.querySelector('[data-vital="drone"] b').textContent=droneDestroyed?`${(Math.max(0,readyAt-performance.now())/1000).toFixed(1)}s`:String(Math.round(droneHp));}
  };
  const player={maxHp:PLAYER_MAX_HP,get hp(){return playerHp;},get dead(){return playerDead;},get deathStartedAt(){return deathAt;},
    damage(amount=25){if(playerDead)return 0;playerHp=healthAfterDamage(playerHp,Math.max(0,Number(amount)||0)/TOLERANCE);if(playerHp<=0){playerDead=true;deathAt=performance.now();globalThis.document?.body?.classList.add("player-dead");try{game.setMode("foot");}catch{}}paint();return playerHp;},
    reset(){playerHp=PLAYER_MAX_HP;playerDead=false;globalThis.document?.body?.classList.remove("player-dead");paint();return playerHp;}};
  const drone={maxHp:DRONE_MAX_HP,get hp(){return droneHp;},get destroyed(){return droneDestroyed;},get remainingMs(){return droneReplacementRemainingMs({destroyed:droneDestroyed,readyAt,now:performance.now()});},get canDeploy(){return !droneDestroyed;},
    damage(amount=25){if(droneDestroyed)return 0;droneHp=healthAfterDamage(droneHp,amount,DRONE_MAX_HP);if(droneHp<=0){droneDestroyed=true;forcedFoot=game.mode==="drone";readyAt=performance.now()+DRONE_REPLACEMENT_COOLDOWN_MS;globalThis.document?.body?.classList.add("drone-destroyed");setTimeout(()=>{if(droneDestroyed)try{game.setMode("foot");}catch{}},850);}paint();return droneHp;},
    reset(){droneHp=DRONE_MAX_HP;droneDestroyed=false;readyAt=-Infinity;forcedFoot=false;globalThis.document?.body?.classList.remove("drone-destroyed");paint();return droneHp;}};
  globalThis.__arondightPlayerDamageModel=player;
  globalThis.__arondightDroneDamageModel=drone;
  globalThis.__arondightRequestReset=()=>{player.reset();drone.reset();};
  paint();
  return {player,drone,sync(now=performance.now()){if(droneDestroyed&&now>=readyAt){const back=forcedFoot;drone.reset();if(back)try{game.setMode("drone");}catch{}}paint();}};
}
