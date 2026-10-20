// Native mode overlay. One bar for every mode, the live weapon lists,
// and the sticks that belong to that mode. Production is not touched.
const FOOT=["smg","glock","sniper","grenade","rocket","fists","knife"];
const FOOT_LABEL={smg:"SMG",glock:"PISTOL",sniper:"SNIPER",grenade:"NADE",rocket:"ROCKET",fists:"FISTS",knife:"KNIFE"};
const HELP={
  drone:"WASD fly · mouse turn · LMB fire · R arm · 1–3 / Q weapon · 2 on foot",
  foot:"WASD move · mouse look · LMB fire · Q weapon · RMB scope · Space jump · 1 drone",
  car:"W gas · S brake · A/D steer · Space handbrake · 2 on foot",
  jet:"W/S thrust · A/D yaw · arrows pitch/roll · mouse stick · 2 on foot"
};
let bar=null,help=null,readout=null;
function mode(){
  const b=document.body;
  if(b.classList.contains("jet-mode"))return "jet";
  if(b.classList.contains("player-driving"))return "car";
  if(b.classList.contains("on-foot-mode"))return "foot";
  return "drone";
}
function sync(){
  const m=mode();
  const foot=globalThis.__arondightFootWeapons,drone=globalThis.__arondightDroneWeapons;
  if(bar){
    bar.hidden=m!=="foot";
    for(const node of bar.querySelectorAll("[data-foot-weapon]"))
      node.setAttribute("aria-pressed",String(node.dataset.footWeapon===foot?.mode));
  }
  const weaponBar=document.getElementById("weaponBar");
  if(weaponBar){
    weaponBar.hidden=m!=="drone";
    for(const node of weaponBar.querySelectorAll("[data-drone-weapon]"))
      node.setAttribute("aria-pressed",String(node.dataset.droneWeapon===drone?.mode));
  }
  if(help)help.textContent=HELP[m]||HELP.drone;
  if(readout){
    const weapon=m==="foot"?FOOT_LABEL[foot?.mode]||"":m==="drone"?String(drone?.mode||"gun").toUpperCase():"";
    readout.textContent=m.toUpperCase()+(weapon?" · "+weapon:"");
  }
  document.body.dataset.nativeMode=m;
}
export function installNativeModeOverlay(){
  if(typeof document==="undefined"||installNativeModeOverlay.installed)return;
  const actions=document.getElementById("soloTopbarActions")||document.getElementById("toolbar");
  if(!actions){setTimeout(installNativeModeOverlay,200);return;}
  installNativeModeOverlay.installed=true;
    bar=document.createElement("div");
    bar.id="footWeaponBar";
    bar.setAttribute("role","group");
    bar.setAttribute("aria-label","Foot weapon");
    bar.innerHTML=FOOT.map(name=>`<button type="button" data-foot-weapon="${name}">${FOOT_LABEL[name]}</button>`).join("");
    bar.addEventListener("click",event=>{
      const node=event.target instanceof Element?event.target.closest("[data-foot-weapon]"):null;
      if(!node)return;
      globalThis.__arondightFootWeapons?.setMode?.(node.dataset.footWeapon);
      sync();
    });
    actions.appendChild(bar);
  const status=document.getElementById("soloTopbarStatus");
  if(status){
    readout=document.createElement("span");
    readout.id="soloModeReadout";
    status.prepend(readout);
  }
  help=document.getElementById("soloGamepadHelp")||document.getElementById("help");
  const style=document.createElement("style");
  style.dataset.nativeModeOverlay="v1";
  style.textContent=`
#footWeaponBar{display:flex;gap:3px}
#footWeaponBar[hidden],#weaponBar[hidden]{display:none!important}
#footWeaponBar button[aria-pressed=true],#weaponBar button[aria-pressed=true]{background:#ffb42d;color:#162136;border-color:#ffb42d}
body:not(.on-foot-mode) #footHud{display:none!important}
body.on-foot-mode:not(.desktop-input) #footHud,body.on-foot-mode:not(.desktop-input) #footFire,body.on-foot-mode:not(.desktop-input) #footJump,body.on-foot-mode:not(.desktop-input) #footLook,body.on-foot-mode:not(.desktop-input) #footMove{display:block!important;pointer-events:auto!important}
body:not([data-native-mode="drone"]) #soloLeft,body:not([data-native-mode="drone"]) #soloRight,body:not([data-native-mode="drone"]) #soloClearance{display:none!important}
body.player-driving #soloGamepadHelp,body.jet-mode #soloGamepadHelp{display:block!important}
#soloModeReadout{font-weight:900;letter-spacing:.08em}`;
  document.head.appendChild(style);
  document.getElementById("footFire")?.addEventListener("pointerdown",event=>{
    event.preventDefault();
    globalThis.__arondightFootWeapons?.fireAt?.({clientX:event.clientX,clientY:event.clientY});
  });
  addEventListener("arondight:weapon-fired",sync);
  setInterval(sync,250);
  sync();
}
installNativeModeOverlay();
