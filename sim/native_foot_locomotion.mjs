// On-foot handling from player_walk_mode_v4. Same speeds, the same 3.6 m/s
// jump, the same jetpack burst, fuel and landing cushion. The native body
// stays a Box3D collider; this only decides the wish speed and the vertical kick.
export const FOOT_WALK_MPS=5.5;
export const FOOT_SPRINT_MPS=8.1;
export const FOOT_JUMP_V=3.6;
export const FOOT_JUMP_G=9.81;
export const FOOT_JUMP_BUFFER_MS=140;
export const FOOT_AIR_ACCEL=5;
export const FOOT_FALL_SAFE_MPS=7.7;
export const FOOT_FALL_LETHAL_MPS=15;
export const FOOT_JET_ACC=21;
export const FOOT_JET_BURST_S=.6;
export const FOOT_JET_FUEL_PER_S=.2;
export const FOOT_JET_RECHARGE_S=4;
export const FOOT_JET_AIR_ACCEL=14;
export const FOOT_JET_CUSHION_FUEL=.02;
export const FOOT_JET_AIR_REGEN_DELAY_MS=350;
export const FOOT_JET_CLIMB_ACC=13.8;
export const FOOT_JET_MAX_CLIMB_MPS=8;

export function createFootMotion(){
  return {prevJump:false,pending:false,queuedAt:-Infinity,airborne:false,vz:0,fuel:1,burstLeft:0,used:false,groundSince:0,thrusting:false,lastThrustAt:0,acc:0};
}
function jetpackOn(){return globalThis.__arondightWorldOptions?.get?.("jetpack")!==false;}

// One physics step. `grounded` and `vz` are the body as it is now.
// Returns the horizontal wish and the vertical velocity change to apply.
export function stepFootMotion(state,{now=0,dt=1/60,jumpHeld=false,grounded=false,vz=0,gapM=0,dead=false,massKg=82}={}){
  const out={wishMps:0,maxAccel:40,dvz:0,thrusting:false};
  if(!(dt>0)||dead){state.prevJump=false;state.thrusting=false;return out;}
  const pressed=Boolean(jumpHeld)&&!state.prevJump;
  state.prevJump=Boolean(jumpHeld);
  if(state.airborne&&grounded){out.landImpact=Math.max(0,-state.vz);state.airborne=false;state.vz=0;}
  if(pressed){
    if(!grounded&&jetpackOn()&&state.fuel>=.06){
      state.burstLeft=FOOT_JET_BURST_S;state.used=true;
      // production player_walk_mode_v4 startJet: jetpack_audio plays the ignition
      try{globalThis.dispatchEvent?.(new CustomEvent("arondight:player-jetpack",{detail:{fuel:state.fuel}}));}catch{}
      if(vz<0)out.dvz+=(vz*.35-vz);
    }else if(grounded){state.pending=true;state.queuedAt=now;}
  }
  if(grounded&&(state.pending||now-state.queuedAt<FOOT_JUMP_BUFFER_MS)){
    out.dvz+=FOOT_JUMP_V-Math.min(0,vz);state.pending=false;state.queuedAt=-Infinity;
  }
  if(grounded){
    state.used=false;state.burstLeft=0;
    if(!state.groundSince)state.groundSince=now;
    if(now-state.groundSince>400)state.fuel=Math.min(1,state.fuel+dt/FOOT_JET_RECHARGE_S);
  }else{
    state.groundSince=0;
    if(now-(state.lastThrustAt||0)>FOOT_JET_AIR_REGEN_DELAY_MS)state.fuel=Math.min(1,state.fuel+dt/FOOT_JET_RECHARGE_S);
  }
  state.thrusting=false;
  if(!grounded&&jetpackOn()&&state.fuel>0){
    const burst=state.burstLeft>0||(state.used&&jumpHeld);
    const stop=vz<0?vz*vz/(2*(FOOT_JET_ACC-FOOT_JUMP_G)):0;
    const cushion=vz<-FOOT_FALL_SAFE_MPS*.8&&state.fuel>FOOT_JET_CUSHION_FUEL&&gapM<stop+.6;
    if(burst||cushion){
      state.thrusting=true;state.lastThrustAt=now;
      state.acc=cushion?FOOT_JET_ACC:Math.max(0,Math.min(FOOT_JET_CLIMB_ACC,FOOT_JUMP_G+(FOOT_JET_MAX_CLIMB_MPS-vz)*3));
      state.fuel=Math.max(0,state.fuel-FOOT_JET_FUEL_PER_S*dt*state.acc/FOOT_JET_ACC);
      if(burst)state.burstLeft-=dt;
      // Gravity is already on the body. Thrust is the extra upward acceleration.
      out.dvz+=state.acc*dt;
    }
  }
  if(!grounded)state.airborne=true;
  state.vz=vz+out.dvz;
  out.thrusting=state.thrusting;out.fuel=state.fuel;
  out.maxAccel=grounded?40:(state.thrusting?FOOT_JET_AIR_ACCEL:FOOT_AIR_ACCEL);
  return out;
}

export function paintJetpackFuel(state,{onFoot=false}={}){
  if(typeof document==="undefined")return;
  const view=document.getElementById("viewport");if(!view)return;
  let bar=document.getElementById("jetpackFuel");
  if(!bar){
    bar=document.createElement("div");bar.id="jetpackFuel";bar.innerHTML="<i></i>";view.appendChild(bar);
    const style=document.createElement("style");style.dataset.jetpackFuel="native";
    style.textContent="#jetpackFuel{position:absolute;left:50%;bottom:max(64px,env(safe-area-inset-bottom));transform:translateX(-50%);width:120px;height:6px;border-radius:3px;background:#0008;border:1px solid #ffffff44;z-index:24;pointer-events:none;opacity:0}#jetpackFuel.show{opacity:1}#jetpackFuel i{display:block;height:100%;width:100%;border-radius:3px;background:linear-gradient(90deg,#ff8a3a,#ffd46a)}#jetpackFuel.thrust i{background:linear-gradient(90deg,#ff5a2a,#fff0a0)}";
    document.head.appendChild(style);
  }
  const show=onFoot&&jetpackOn()&&(state.fuel<.999||state.thrusting);
  bar.classList.toggle("show",show);bar.classList.toggle("thrust",state.thrusting);
  bar.firstChild.style.width=`${Math.round(state.fuel*100)}%`;
}
