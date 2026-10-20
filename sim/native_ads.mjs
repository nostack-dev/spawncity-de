// Original ADS from first_person_controller_v5. Same constants, same step.
// The native camera already reads __arondightAds.zoom.
const ADS_TAU_S=.075,ADS_ZOOM=1.45,SCOPE_ZOOM=8;
let adsT=0,last=0;
function foot(){return globalThis.__arondightWalkMode||null;}
function weapon(){return String(globalThis.__arondightFootWeapons?.mode||"");}
function scopeWeapon(){return weapon()==="sniper";}
function adsWanted(){
  if(foot()?.mode!=="foot"||foot()?.dead)return false;
  if(weapon()==="fists"||weapon()==="knife")return false;
  if(scopeWeapon()&&globalThis.__arondightScopeToggle===true)return true;
  const d=globalThis.__arondightDesktopInput;
  if(d?.active&&d.locked&&d.rmb)return true;
  for(const p of navigator.getGamepads?.()||[]){
    if(p?.connected&&p.mapping==="standard"){
      const b=p.buttons?.[6];
      return Number(typeof b==="number"?b:b?.value)>.35;
    }
  }
  return false;
}
function resetAds(){adsT=0;globalThis.__arondightAds={t:0,zoom:1,scoped:false};document.body.classList.remove("ads-active","scope-active");}
function step(dt){
  if(!scopeWeapon()&&adsT>.85&&globalThis.__arondightAds?.scoped)resetAds();
  const goal=adsWanted()?1:0,scope=scopeWeapon();
  adsT+=(goal-adsT)*(1-Math.exp(-dt/(scope?ADS_TAU_S*1.6:ADS_TAU_S)));
  if(Math.abs(adsT-goal)<.002)adsT=goal;
  const zoom=scope?(adsT>.85?SCOPE_ZOOM:1+(ADS_ZOOM-1)*adsT):1+(ADS_ZOOM-1)*adsT;
  const scoped=scope&&adsT>.85;
  globalThis.__arondightAds={t:adsT,zoom,scoped};
  document.body.classList.toggle("ads-active",adsT>.6);
  document.body.classList.toggle("scope-active",scoped);
}
function frame(now){
  const dt=Math.min(.1,Math.max(0,(now-(last||now))/1000));last=now;
  try{step(dt);}catch{}
  requestAnimationFrame(frame);
}
export function installNativeAds(){
  if(typeof document==="undefined"||installNativeAds.installed)return;
  installNativeAds.installed=true;
  globalThis.__arondightAds={t:0,zoom:1,scoped:false};
  globalThis.__arondightFirstPersonController={resetAds,version:"native-ads-live-step-v1"};
  requestAnimationFrame(frame);
}
installNativeAds();
