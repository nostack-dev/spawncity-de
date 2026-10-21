// Pilot and drone health, using the live formulas. No ragdoll mesh: death
// locks input, drops the camera and R brings you back.
import {DRONE_MAX_HP,DRONE_REPLACEMENT_COOLDOWN_MS,PLAYER_MAX_HP,droneReplacementRemainingMs,healthAfterDamage} from "./player_vitals_logic.mjs";

const TOLERANCE=1.18;
const PROD_VITALS_CSS=`
#playerVitalsHud{display:none;position:absolute;z-index:18;left:max(12px,var(--solo-safe-left,env(safe-area-inset-left)));top:max(50px,calc(var(--solo-safe-top,env(safe-area-inset-top)) + 44px));min-width:128px;padding:6px 8px;border:1px solid #ffffff28;border-radius:9px;background:#07111ad9;box-shadow:0 5px 18px #0008;color:#f2f8ff;font-family:system-ui,-apple-system,sans-serif;pointer-events:none;backdrop-filter:blur(4px)}body.solo-flight #playerVitalsHud{display:flex;gap:8px}#playerVitalsHud span{display:grid;grid-template-columns:auto auto;gap:5px;align-items:center}#playerVitalsHud i{font:850 7px/1 system-ui;font-style:normal;letter-spacing:.08em;color:#92a9b9}#playerVitalsHud b{font:950 10px/1 system-ui;font-variant-numeric:tabular-nums}#playerVitalsHud [data-vital="player"] b{color:#9cf0c9}#playerVitalsHud [data-vital="drone"] b{color:#8edcff}#playerVitalsHud[data-player-dead="1"] [data-vital="player"] b,#playerVitalsHud[data-drone-destroyed="1"] [data-vital="drone"] b{color:#ff7e8f}body.player-dead #footMove,body.player-dead #footLook,body.player-dead #footLookZone,body.player-dead #footFire{pointer-events:none!important;opacity:.22!important}body.drone-destroyed #soloArm,body.drone-destroyed #soloKill{pointer-events:none!important;opacity:.30!important}@media(max-height:340px){#playerVitalsHud{top:max(37px,calc(var(--solo-safe-top,env(safe-area-inset-top)) + 32px));padding:4px 6px;min-width:116px;gap:6px}#playerVitalsHud i{font-size:6px}#playerVitalsHud b{font-size:9px}}
`;
export function installNativeVitals(game){
  let playerHp=PLAYER_MAX_HP,droneHp=DRONE_MAX_HP,playerDead=false,droneDestroyed=false,readyAt=-Infinity,deathAt=0,forcedFoot=false,hud=null;
  const paint=()=>{
    if(typeof document==="undefined")return;
    const view=document.getElementById("viewport");
    if(view){view.dataset.playerHp=String(Math.round(playerHp));view.dataset.playerDead=playerDead?"1":"0";view.dataset.droneHp=String(Math.round(droneHp));view.dataset.droneDestroyed=droneDestroyed?"1":"0";}
    if(!hud&&view){
      // Production player_vitals_runtime HUD: same markup, attributes and CSS.
      document.querySelectorAll("#playerVitalsHud").forEach(el=>el.remove());
      hud=document.createElement("div");hud.id="playerVitalsHud";hud.setAttribute("role","status");hud.setAttribute("aria-live","polite");
      hud.innerHTML='<span data-vital="player"><i>PILOT</i><b>100</b></span><span data-vital="drone"><i>DRONE</i><b>100</b></span>';view.appendChild(hud);
      if(!document.querySelector('style[data-player-vitals="separate-player-drone-v1"]')){const style=document.createElement("style");style.dataset.playerVitals="separate-player-drone-v1";style.textContent=PROD_VITALS_CSS;document.head.appendChild(style);}
    }
    if(hud){hud.dataset.playerDead=playerDead?"1":"0";hud.dataset.droneDestroyed=droneDestroyed?"1":"0";
      hud.setAttribute("aria-label",droneDestroyed?`Pilot health ${Math.round(playerHp)}. Replacement drone ready in ${Math.ceil(Math.max(0,readyAt-performance.now())/1000)} seconds.`:`Pilot health ${Math.round(playerHp)}. Drone health ${Math.round(droneHp)}.`);}
    if(hud){hud.querySelector('[data-vital="player"] b').textContent=String(Math.round(playerHp));hud.querySelector('[data-vital="drone"] b').textContent=droneDestroyed?`${(Math.max(0,readyAt-performance.now())/1000).toFixed(1)}s`:String(Math.round(droneHp));}
  };
  const player={maxHp:PLAYER_MAX_HP,get hp(){return playerHp;},get dead(){return playerDead;},get deathStartedAt(){return deathAt;},
    damage(amount=25){if(playerDead)return 0;playerHp=healthAfterDamage(playerHp,Math.max(0,Number(amount)||0)/TOLERANCE);if(playerHp<=0){playerDead=true;deathAt=performance.now();globalThis.document?.body?.classList.add("player-dead");try{game.setMode("foot");}catch{}}paint();return playerHp;},
    reset(){playerHp=PLAYER_MAX_HP;playerDead=false;globalThis.document?.body?.classList.remove("player-dead");paint();return playerHp;}};
  const drone={maxHp:DRONE_MAX_HP,get hp(){return droneHp;},get destroyed(){return droneDestroyed;},get remainingMs(){return droneReplacementRemainingMs({destroyed:droneDestroyed,readyAt,now:performance.now()});},get canDeploy(){return !droneDestroyed;},
    damage(amount=25){if(droneDestroyed)return 0;droneHp=healthAfterDamage(droneHp,amount,DRONE_MAX_HP);if(droneHp<=0){droneDestroyed=true;forcedFoot=game.mode==="drone";readyAt=performance.now()+DRONE_REPLACEMENT_COOLDOWN_MS;globalThis.document?.body?.classList.add("drone-destroyed");setTimeout(()=>{if(droneDestroyed)try{game.setMode("foot");}catch{}},850);}paint();return droneHp;},
    reset(){droneHp=DRONE_MAX_HP;droneDestroyed=false;readyAt=-Infinity;forcedFoot=false;globalThis.document?.body?.classList.remove("drone-destroyed");paint();return droneHp;}};
  globalThis.__nativeVitalsActive=true;
  globalThis.__arondightPlayerDamageModel=player;
  globalThis.__arondightDroneDamageModel=drone;
  globalThis.__arondightRequestReset=()=>{player.reset();drone.reset();};
  paint();
  return {player,drone,sync(now=performance.now()){if(droneDestroyed&&now>=readyAt){const back=forcedFoot;drone.reset();if(back)try{game.setMode("drone");}catch{}}paint();}};
}
