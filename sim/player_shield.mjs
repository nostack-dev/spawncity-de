// Retired pilot nuclear shield. The player is never nuke-immune.
// Keep the historical import/global contract for old event consumers but
// DO NOT create an invisible Three.js sphere or a permanent animation loop:
// that was running even though this feature has been disabled for months.
export const PLAYER_SHIELD_VERSION="pilot-nuke-shield-v1";
let installed=false;
export const playerShield={active:false,version:PLAYER_SHIELD_VERSION,nukeImmune(){return this.active;}};
globalThis.__arondightPlayerShield=playerShield;

export function installPlayerShield(){
  if(installed)return;
  installed=true;
  const viewport=globalThis.document?.getElementById?.("viewport");
  if(viewport)viewport.dataset.playerShield=PLAYER_SHIELD_VERSION;
}
installPlayerShield();
