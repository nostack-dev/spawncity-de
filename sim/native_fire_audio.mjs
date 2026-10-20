// The live shot sounds, on the existing weapon-fired event.
// Gains and banks are the original calls from flight_fire_fx and
// gameplay_final_runtime_v2. No new synthesis.
import {AUDIO_SETTINGS_EVENT,loadAudioSettings,normalizeAudioSettings} from "./audio_settings.mjs";
import {getSharedCombatAudioContext,playCombatAudio} from "./combat_audio_bank.mjs";

let settings=loadAudioSettings();
function play(kind,gain,opts={}){
  if(!settings.soundEnabled||settings.shotsVolume<=0)return false;
  const ctx=getSharedCombatAudioContext({resume:true});
  return Boolean(ctx&&playCombatAudio(ctx,kind,{gain:gain*settings.shotsVolume/100,...opts}));
}
function onFired(event){
  const weapon=String(event?.detail?.weapon||""),mode=String(event?.detail?.mode||"");
  if(mode==="drone"&&(weapon==="gun"||weapon==="drone-gun"))return play("shot",.26,{minIntervalMs:38});
  if(weapon==="smg")return play("shot",.18,{minIntervalMs:28});
  if(weapon==="glock")return play("pistol",.72,{playbackRate:1,minIntervalMs:0});
  if(weapon==="sniper"){play("pistol",1,{playbackRate:.52,minIntervalMs:0});return play("pistol",.55,{playbackRate:.36,minIntervalMs:0});}
  return false;
}
export function installNativeFireAudio(){
  if(typeof window==="undefined"||installNativeFireAudio.installed)return;
  installNativeFireAudio.installed=true;
  addEventListener("arondight:weapon-fired",onFired);
  addEventListener(AUDIO_SETTINGS_EVENT,event=>{settings=normalizeAudioSettings(event.detail||loadAudioSettings());});
}
installNativeFireAudio();
