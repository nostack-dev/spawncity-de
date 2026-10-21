// Water, pasture cows, pigeons, the ping and lasting hit marks.
// Counts and rules are the live ones. Geometry is the real OSM.
import {fromTRS} from "./native_render_math.mjs";

const EARTH=6378137;
const toMeters=(lon0,lat0,lon,lat)=>[(lon-lon0)*Math.PI/180*EARTH*Math.max(.01,Math.cos(lat0*Math.PI/180)),(lat-lat0)*Math.PI/180*EARTH];

const MAX_COWS=40,WALK=.55,FLOCKS=6,BIRDS=8;
let cows=[],flocks=[],pings=[],marks=[],drawn={};
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
function box(sx,sy,sz,color){
  const p=[],n=[],c=[];
  const add=(a,b,d,e,normal)=>{for(const q of [a,b,d,a,d,e]){p.push(...q);n.push(...normal);c.push(...color);}};
  const x=sx/2,y=sy/2,z=sz/2;
  add([-x,-y,-z],[-x,y,-z],[-x,y,z],[-x,-y,z],[-1,0,0]);
  add([x,y,-z],[x,-y,-z],[x,-y,z],[x,y,z],[1,0,0]);
  add([x,-y,-z],[-x,-y,-z],[-x,-y,z],[x,-y,z],[0,-1,0]);
  add([-x,y,-z],[x,y,-z],[x,y,z],[-x,y,z],[0,1,0]);
  add([-x,y,z],[x,y,z],[x,-y,z],[-x,-y,z],[0,0,1]);
  add([-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[0,0,-1]);
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
const COW=box(1.6,.7,.8,[.92,.9,.84]),BIRD=box(.18,.08,.1,[.55,.55,.58]),PING=box(.35,.35,1.4,[1,.55,.1]),MARK=box(.12,.12,.02,[.12,.1,.08]),WATER=box(1,1,.04,[.15,.45,.62]);
function project(origin,coordinates){
  const out=[];
  if(!Array.isArray(coordinates))return out;
  for(const p of coordinates){if(Array.isArray(p)&&p.length>=2)out.push(toMeters(origin.lon,origin.lat,Number(p[0]),Number(p[1])));}
  return out;
}
function centre(pts){
  let x=0,y=0;for(const p of pts){x+=p[0];y+=p[1];}
  return [x/pts.length,y/pts.length];
}
export function installNativeWorldLife(game,snapshot){
  const origin=snapshot?.origin;if(!origin)return;
  cows=[];
  for(const pasture of snapshot.pastures||[]){
    const ring=pasture.geometry?.coordinates?.[0];if(!ring||ring.length<4)continue;
    const pts=project(origin,ring),mid=centre(pts);
    const n=Math.max(2,Math.min(7,Math.round(pts.length/12)));
    for(let i=0;i<n&&cows.length<MAX_COWS;i++){
      const a=i/n*Math.PI*2;
      cows.push({id:`cow-${cows.length}`,x:mid[0]+Math.cos(a)*8,y:mid[1]+Math.sin(a)*8,yaw:a,hp:100,alive:true,home:mid});
    }
  }
  flocks=Array.from({length:FLOCKS},(_,i)=>({x:Math.cos(i)*40,y:Math.sin(i)*40,state:"ground",birds:Array.from({length:BIRDS},(_,k)=>({ox:Math.cos(k)*1.4,oy:Math.sin(k)*1.4}))}));
  globalThis.__arondightPing={version:"native-ping-v1",at(){const cam=game.world?.camera;if(!cam?.eye||!cam?.target)return false;const f=[cam.target[0]-cam.eye[0],cam.target[1]-cam.eye[1],cam.target[2]-cam.eye[2]];const l=Math.hypot(...f)||1;pings=[{x:cam.eye[0]+f[0]/l*18,y:cam.eye[1]+f[1]/l*18,born:performance.now()}];return true;}};
  const water=[];
  for(const feature of snapshot.water||[]){
    const coords=feature.geometry?.type==="Polygon"?feature.geometry.coordinates[0]:feature.geometry?.coordinates;
    if(!coords||coords.length<2)continue;
    const pts=project(origin,coords);
    for(let i=0;i<pts.length-1&&water.length<800;i++){
      const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<2)continue;
      water.push(...fromTRS([(a[0]+b[0])/2,(a[1]+b[1])/2,-.2],yawQuat(Math.atan2(dy,dx)),[len,feature.properties?.waterway==="river"?16:8,1]));
    }
  }
  installNativeWorldLife.water=water;
  globalThis.__arondightCows={list:()=>cows.filter(cow=>cow.alive).map(cow=>({id:cow.id,x:cow.x,y:cow.y,z:.8,dead:!cow.alive,hidden:false,liveBody:cow.id}))};
  return {cows:cows.length,flocks:flocks.length,water:water.length/16};
}
function pack(data){
  if(!data?.length)return null;
  if(data[0]?.length===16){
    const out=new Float32Array(data.length*16);
    for(let i=0;i<data.length;i++)if(data[i]?.length===16)out.set(data[i],i*16);
    return out;
  }
  if(data.length%16)return null;
  return data instanceof Float32Array?data:new Float32Array(data);
}
function paint(renderer,id,geo,data){
  const transforms=pack(data);
  if(!transforms){if(drawn[id]){renderer.remove(id);drawn[id]=false;}return;}
  if(drawn[id])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawn[id]=true;}
}
export function tickNativeWorldLife(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const p=globalThis.__arondightWalkMode?.position||{x:0,y:0};
  const cowData=[];
  for(const c of cows){
    if(!c.alive)continue;
    const dx=c.home[0]-c.x,dy=c.home[1]-c.y;
    if(Math.hypot(dx,dy)>6){c.x+=Math.sign(dx)*WALK/60;c.y+=Math.sign(dy)*WALK/60;c.yaw=Math.atan2(dy,dx);}
    cowData.push(...fromTRS([c.x,c.y,.8],yawQuat(c.yaw),[1,1,1]));
  }
  const birdData=[];
  for(const fl of flocks){
    if(fl.state==="ground"&&Math.random()<.002)fl.state="air";
    if(fl.state==="air"){fl.x+=(p.x-fl.x)*.01;fl.y+=(p.y-fl.y)*.01;if(Math.hypot(fl.x-p.x,fl.y-p.y)<12)fl.state="ground";}
    for(const b of fl.birds)birdData.push(...fromTRS([fl.x+b.ox,fl.y+b.oy,fl.state==="air"?6:.2],[0,0,0,1],[1,1,1]));
  }
  const pingData=pings.filter(m=>now-m.born<6000).map(m=>fromTRS([m.x,m.y,1],[0,0,0,1],[1,1,1]));
  pings=pings.filter(m=>now-m.born<6000);
  paint(renderer,"life/cows",COW,cowData);
  paint(renderer,"life/pigeons",BIRD,birdData);
  paint(renderer,"life/ping",PING,pingData);
  paint(renderer,"life/marks",MARK,marks.slice(-40));
  const raw=installNativeWorldLife.water;
  if(raw?.length&&raw.length%16===0&&!drawn.water){
    renderer.upsert("life/water",{...WATER,instances:{transforms:raw instanceof Float32Array?raw:new Float32Array(raw)},material:{color:[.2,.55,.7,1],doubleSided:true}});
    drawn.water=true;
  }
}
export function markNativeImpact(point){
  if(!point)return;
  marks.push(fromTRS(point,[0,0,0,1],[1,1,1]));
  if(marks.length>40)marks.shift();
}
export function applyCowDamage(id,amount){
  const cow=cows.find(c=>c.id===id&&c.alive);
  if(!cow||!(amount>0))return null;
  cow.hp-=amount;
  if(cow.hp<=0)cow.alive=false;
  return {hp:cow.hp,dead:!cow.alive};
}
export function hitNativeCows(origin,dir,range){
  let best=null,bestT=range;
  for(const c of cows){
    if(!c.alive)continue;
    const ox=c.x-origin[0],oy=c.y-origin[1],oz=.8-origin[2];
    const t=ox*dir[0]+oy*dir[1]+oz*dir[2];
    if(t<0||t>bestT)continue;
    const px=origin[0]+dir[0]*t-c.x,py=origin[1]+dir[1]*t-c.y,pz=origin[2]+dir[2]*t-.8;
    if(px*px+py*py+pz*pz<.7*.7){best=c;bestT=t;}
  }
  if(!best)return null;
  best.hp-=34;if(best.hp<=0)best.alive=false;
  return {point:[origin[0]+dir[0]*bestT,origin[1]+dir[1]*bestT,origin[2]+dir[2]*bestT]};
}
export function blastNativeCows(center,radius,maxDamage,falloff,exposure){
  let hit=0;
  for(const cow of cows){
    if(!cow.alive)continue;
    const dist=Math.hypot(cow.x-center[0],cow.y-center[1],.8-(center[2]||0));
    if(dist>=radius)continue;
    const amount=maxDamage*falloff(dist)*(exposure?.(cow.x,cow.y,.8)??1);
    if(amount<=2)continue;
    cow.hp-=amount;if(cow.hp<=0)cow.alive=false;hit++;
  }
  return hit;
}
