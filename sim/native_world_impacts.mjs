// Production world_impacts.mjs + the procedural street trees of
// world_procedural_population.mjs on the native renderer.
//  * Bullet impacts: a hole decal on walls, ground and cars (oriented on the
//    surface, ground holes follow the terrain normal), a burst of chips in the
//    surface's colour (concrete, dirt, bark / leaves, sparks on metal, glass).
//    Window glass cracks instead of holing. Shots that miss everything still
//    hit the ground.
//  * Explosions: a draped scorch on the ground, a big chip burst, soot on the
//    walls in reach, trees in the blast radius fall away from it.
//  * Trees: the same 34 (20 on phones) seeded trees around the neighbourhood
//    anchor as production (same hash, same spots: never in a house, never on
//    the carriageway). Bullets shake them and shed leaves; 12 hits fell them.
// Far hits still read on screen (through the scope too): marks and debris grow
// with distance / zoom so they never fall below a few pixels.
import {nativeOsmProjector} from "./native_osm_projector.mjs";
export const NATIVE_WORLD_IMPACTS_VERSION="terrain-draped-decals+chips+tree-damage-v2-native";
const DECALS=420,CHIPS=220,TREE_HP=12,SCORCHES=40,SG=10;
const COLORS={building:[0xcfc6b4,0xa89f90],ground:[0x6b5a44,0x7a9a52],tree:[0x4f9a3a,0x6b4a32],vehicle:[0xffd27a,0xfff2c4],glass:[0xe4f0f6,0xa9c6d6],actor:[0x8a1a1a,0x5a1010],water:[0x9fd0ff,0xffffff]};
const MOBILE=/(?:android|iphone|ipad|ipod|macintosh.*mobile)/i.test(globalThis.navigator?.userAgent||"");
const TREE_COUNT=MOBILE?20:34;
let game=null,installed=false,lastFrame=performance.now();
const rand=(a,b)=>a+Math.random()*(b-a);
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
const norm=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const R=()=>game?.world?.renderer;
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
function groundNormal(x,y){const e=.6,dx=ground(x+e,y)-ground(x-e,y),dy=ground(x,y+e)-ground(x,y-e);return norm([-dx/(2*e),-dy/(2*e),1]);}
// matrix whose local +Z is n, spun by a around n, uniform scale s, at p
function basis(n,spin,s,p){
  n=norm(n);const ref=Math.abs(n[2])<.95?[0,0,1]:[1,0,0];let t=norm(cross(ref,n));let b=cross(n,t);
  const c=Math.cos(spin),si=Math.sin(spin),t2=[t[0]*c+b[0]*si,t[1]*c+b[1]*si,t[2]*c+b[2]*si],b2=cross(n,t2);
  return [t2[0]*s,t2[1]*s,t2[2]*s,0,b2[0]*s,b2[1]*s,b2[2]*s,0,n[0]*s,n[1]*s,n[2]*s,0,p[0],p[1],p[2],1];
}
function visibilityScale(point,basePx=3,base=.08){
  const cam=game?.world?.camera,v=globalThis.document?.getElementById?.("viewport");if(!cam?.eye||!point||!v)return 1;
  const d=Math.hypot(point[0]-cam.eye[0],point[1]-cam.eye[1],point[2]-cam.eye[2]);if(!(d>1))return 1;
  const pxPerM=v.clientHeight/(2*d*Math.tan((Number(cam.fov)||1.1)/2));return Math.max(1,Math.min(14,basePx/(base*pxPerM)));
}
// ------------------------------------------------------------------ geometry
function geo(){return {p:[],n:[],c:[],uv:[]};}
function f32(b){const o={positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};if(b.uv.length)o.uvs=new Float32Array(b.uv);return o;}
function push(b,v,n,c){b.p.push(...v);b.n.push(...n);b.c.push(...c);}
function circleGeo(segs=14){const b=geo();for(let k=0;k<segs;k++){const a0=k/segs*Math.PI*2,a1=(k+1)/segs*Math.PI*2;for(const v of [[0,0,0],[Math.cos(a0),Math.sin(a0),0],[Math.cos(a1),Math.sin(a1),0]])push(b,v,[0,0,1],[1,1,1]);}return f32(b);}
function crackGeo(){const b=geo();for(let k=0;k<7;k++){const a=k/7*Math.PI*2+(k%2)*.3,l=k%2?.75:1,w=.07,ca=Math.cos(a),sa=Math.sin(a),px=-sa*w,py=ca*w;
  for(const v of [[px,py,0],[-px,-py,0],[ca*l,sa*l,0]])push(b,v,[0,0,1],[1,1,1]);}
  for(let k=0;k<12;k++){const a0=k/12*Math.PI*2,a1=(k+1)/12*Math.PI*2;for(const v of [[0,0,0],[Math.cos(a0)*.22,Math.sin(a0)*.22,0],[Math.cos(a1)*.22,Math.sin(a1)*.22,0]])push(b,v,[0,0,1],[1,1,1]);}return f32(b);}
function cubeGeo(){const b=geo(),h=.5;const F=[[[0,0,1],[[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]]],[[0,0,-1],[[-h,h,-h],[h,h,-h],[h,-h,-h],[-h,-h,-h]]],[[1,0,0],[[h,-h,-h],[h,h,-h],[h,h,h],[h,-h,h]]],[[-1,0,0],[[-h,h,-h],[-h,-h,-h],[-h,-h,h],[-h,h,h]]],[[0,1,0],[[h,h,-h],[-h,h,-h],[-h,h,h],[h,h,h]]],[[0,-1,0],[[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h]]]];
  for(const [n,[a,b2,c,d]] of F)for(const v of [a,b2,c,a,c,d])push(b,v,n,[1,1,1]);return f32(b);}
// zCylinder(.1,.15,2.3,7) of production, centred
function trunkGeo(){const b=geo(),rt=.1,rb=.15,h=2.3,seg=7,col=hex(0x5a4030),sl=(rb-rt)/h;
  for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const A=[c0*rb,s0*rb,-h/2],B=[c1*rb,s1*rb,-h/2],C=[c1*rt,s1*rt,h/2],D=[c0*rt,s0*rt,h/2],n0=norm([c0,s0,sl]),n1=norm([c1,s1,sl]);
    push(b,A,n0,col);push(b,B,n1,col);push(b,C,n1,col);push(b,A,n0,col);push(b,C,n1,col);push(b,D,n0,col);
    for(const v of [[0,0,h/2],D,C])push(b,v,[0,0,1],col);}
  return f32(b);}
// DodecahedronGeometry(.92,0): flat-shaded pentagons
function crownGeo(){
  const t=(1+Math.sqrt(5))/2,r=1/t,V=[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1],[0,-r,-t],[0,-r,t],[0,r,-t],[0,r,t],[-r,-t,0],[-r,t,0],[r,-t,0],[r,t,0],[-t,0,-r],[t,0,-r],[-t,0,r],[t,0,r]];
  const I=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];
  const b=geo(),col=hex(0x3f6b2a);
  for(let i=0;i<I.length;i+=3){const a=norm(V[I[i]]).map(x=>x*.92),bb=norm(V[I[i+1]]).map(x=>x*.92),c=norm(V[I[i+2]]).map(x=>x*.92);
    const n=norm(cross([bb[0]-a[0],bb[1]-a[1],bb[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));const ctr=[(a[0]+bb[0]+c[0])/3,(a[1]+bb[1]+c[1])/3,(a[2]+bb[2]+c[2])/3];
    const fn=ctr[0]*n[0]+ctr[1]*n[1]+ctr[2]*n[2]<0?n.map(x=>-x):n;
    for(const v of fn===n?[a,bb,c]:[a,c,bb])push(b,v,fn,col);}
  return f32(b);}
// ------------------------------------------------------------------ decals, cracks, chips
const decals=new Array(DECALS).fill(null);let decalCursor=0,decalsDirty=false;
const cracks=new Array(80).fill(null);let crackCursor=0,cracksDirty=false;
const chips=Array.from({length:CHIPS},()=>({life:0,p:[0,0,0],v:[0,0,0],size:.1,spin:0,axis:[1,0,0],angle:0,c:[1,1,1]}));let chipCursor=0;
export function addDecal(point,normal,{size=.1,color=0x2a2622,ground:onGround=false}={}){
  if(!point)return;size*=Math.min(4,visibilityScale(point,2.2,size));
  const i=decalCursor++%DECALS;
  if(onGround){decals[i]={ground:true,x:point[0],y:point[1],size,spin:Math.random()*6.28,c:hex(color)};}
  else{const n=norm(normal||[0,0,1]);decals[i]={m:basis(n,Math.random()*6.28,size,[point[0]+n[0]*.012,point[1]+n[1]*.012,point[2]+n[2]*.012]),c:hex(color)};}
  decalsDirty=true;
}
function addCrack(point,normal,size=.16){const n=norm(normal||[0,0,1]);cracks[crackCursor++%cracks.length]={m:basis(n,Math.random()*6.28,size*Math.min(3,visibilityScale(point,3,size)),[point[0]+n[0]*.015,point[1]+n[1]*.015,point[2]+n[2]*.015])};cracksDirty=true;}
export function chipBurst(point,normal,surface="building",count=6,speed=4){
  if(!point)return;const vis=visibilityScale(point,3.2,.075);if(vis>1.5){count=Math.min(count+4,14);speed*=Math.min(3,Math.sqrt(vis));}
  const pal=COLORS[surface]||COLORS.building,n=norm(normal||[0,0,1]);
  for(let k=0;k<count;k++){const c=chips[chipCursor++%CHIPS];c.life=rand(.5,1.1);c.p=[point[0]+n[0]*.05,point[1]+n[1]*.05,point[2]+n[2]*.05];
    const d=norm([n[0]+rand(-.7,.7),n[1]+rand(-.7,.7),n[2]+rand(-.2,.9)]),sp=speed*rand(.5,1.2);c.v=d.map(x=>x*sp);
    c.size=rand(.04,.11)*(surface==="tree"?1.4:1)*vis;c.spin=rand(-14,14);c.axis=norm([rand(-1,1),rand(-1,1),rand(-1,1)]);c.angle=0;c.c=hex(pal[k%pal.length]);}
}
function axisAngle(ax,a,s,p){const [x,y,z]=ax,c=Math.cos(a),si=Math.sin(a),t=1-c;
  return [(t*x*x+c)*s,(t*x*y+si*z)*s,(t*x*z-si*y)*s,0,(t*x*y-si*z)*s,(t*y*y+c)*s,(t*y*z+si*x)*s,0,(t*x*z+si*y)*s,(t*y*z-si*x)*s,(t*z*z+c)*s,0,p[0],p[1],p[2],1];}
// ------------------------------------------------------------------ scorches (draped grids, procedural char texture)
const scorches=new Array(SCORCHES).fill(null);let scorchCursor=0,scorchDirty=false,scorchTex=null;
function scorchTexture(){
  const r=R();if(scorchTex||!r?.gl||typeof document==="undefined")return scorchTex;
  const S=128,cv=document.createElement("canvas");cv.width=cv.height=S;const ctx=cv.getContext("2d"),img=ctx.createImageData(S,S),seed=3.7;
  const h=(x,y)=>{const v=Math.sin(x*41.3+y*289.1)*43758.5;return v-Math.floor(v);};
  for(let j=0;j<S;j++)for(let i=0;i<S;i++){const px=i/(S-1)*2-1,py=j/(S-1)*2-1,rr=Math.hypot(px,py),a=Math.atan2(py,px);
    const edge=.78+.12*Math.sin(a*5+seed*7)+.07*Math.sin(a*11+seed*3)+.05*Math.sin(a*23+seed),o=(j*S+i)*4;
    if(rr>edge){img.data[o+3]=0;continue;}const k=rr/edge,ch=1-Math.min(1,Math.max(0,(k-.35)/.65)),charS=ch*ch*(3-2*ch),soot=.55+.45*h(Math.floor(px*9+seed),Math.floor(py*9+seed));
    const col=[.05+(.012-.05)*charS,.045+(.01-.045)*charS,.04+(.01-.04)*charS].map(v=>v*soot),al=.6*(1-Math.min(1,Math.max(0,(k-.7)/.3)))*(.75+.25*charS);
    img.data[o]=Math.round(Math.pow(col[0],1/2.2)*255);img.data[o+1]=Math.round(Math.pow(col[1],1/2.2)*255);img.data[o+2]=Math.round(Math.pow(col[2],1/2.2)*255);img.data[o+3]=Math.round(al*255);}
  ctx.putImageData(img,0,0);
  const gl=r.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return scorchTex=t;
}
export function addScorch(x,y,radius){if(!Number.isFinite(x)||!Number.isFinite(y))return;scorches[scorchCursor++%SCORCHES]={x,y,r:Math.max(.5,Math.min(4.2,radius*.72)),spin:Math.random()*6.28};scorchDirty=true;}
function drawScorches(r){
  if(!scorchDirty)return;scorchDirty=false;const list=scorches.filter(Boolean);if(!list.length){r.remove("impacts/scorch");return;}
  const tex=scorchTexture();if(!tex)return;const b=geo();
  for(const it of list){const c=Math.cos(it.spin),s=Math.sin(it.spin),P=(i,j)=>{const u=i/SG*2-1,v=j/SG*2-1,x=it.x+(u*c-v*s)*it.r,y=it.y+(u*s+v*c)*it.r;return {v:[x,y,ground(x,y)+.035],uv:[(u+1)/2,(v+1)/2]};};
    for(let j=0;j<SG;j++)for(let i=0;i<SG;i++){const a=P(i,j),bb=P(i+1,j),cc=P(i+1,j+1),d=P(i,j+1);for(const q of [a,bb,cc,a,cc,d]){push(b,q.v,[0,0,1],[1,1,1]);b.uv.push(...q.uv);}}}
  r.upsert("impacts/scorch",{...f32(b),texture:tex,material:{unlit:true,doubleSided:true,castShadow:false,alphaMode:"blend",color:[1,1,1,1]}});
}
// ------------------------------------------------------------------ trees (world_procedural_population)
function hashText(text){let h=2166136261;for(const c of String(text||"")){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const u01=(seed,salt)=>hashText(`${seed}:${salt}`)/4294967295,range=(seed,salt,a,b)=>a+(b-a)*u01(seed,salt);
const trees=[];let treeState={seed:0,anchor:[0,0],roads:[],prismKey:""},treesDrawn=false,treesDirty=false;
function prisms(){return game?.gameplayState?.carObstacleSnapshot?.prisms||game?.rigids?.buildingSnapshot?.prisms||[];}
function pointInRing(x,y,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=+pts[i][0],yi=+pts[i][1],xj=+pts[j][0],yj=+pts[j][1];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)inside=!inside;}return inside;}
function bbox(p){if(p.__bb)return p.__bb;const b=[Infinity,Infinity,-Infinity,-Infinity];for(const q of p.points||[]){b[0]=Math.min(b[0],+q[0]);b[1]=Math.min(b[1],+q[1]);b[2]=Math.max(b[2],+q[0]);b[3]=Math.max(b[3],+q[1]);}try{p.__bb=b;}catch{}return b;}
function buildingAt(x,y){for(const p of prisms()){if(!p.points||p.points.length<3||p.leveled)continue;const b=bbox(p);if(x<b[0]||x>b[2]||y<b[1]||y>b[3])continue;if(pointInRing(x,y,p.points))return true;}return false;}
function treeSpotFree(x,y){
  if(buildingAt(x,y))return false;for(let k=0;k<6;k++){const a=k*Math.PI/3;if(buildingAt(x+Math.cos(a)*2.4,y+Math.sin(a)*2.4))return false;}
  for(const r of treeState.roads){const bb=r.bb;if(x<bb[0]-5||x>bb[2]+5||y<bb[1]-5||y>bb[3]+5)continue;const pts=r.pts;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];if(Math.abs(a[0]-x)>60&&Math.abs(b[0]-x)>60)continue;const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/L2));if(Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)<4.2)return false;}}
  return true;
}
function positionTrees(){
  const {seed,anchor}=treeState;treeState.prismKey=String(prisms().length);trees.length=0;
  for(let i=0;i<TREE_COUNT;i++){let x=0,y=0,sc=0,ok=false;for(let k=0;k<10&&!ok;k++){const s=hashText(`${seed}:tree:${i}${k?`:${k}`:""}`);x=anchor[0]+range(s,1,-82,82);y=anchor[1]+range(s,2,-82,82);sc=range(s,3,.78,1.18);ok=treeSpotFree(x,y);}
    if(!ok)continue;trees.push({i,x,y,sc,hp:TREE_HP,fall:null,sway:null});}
  treesDirty=true;
}
export function installNativeTrees(snapshot){
  const training=Boolean(snapshot?.training);let key="training",anchor=[0,0],project=null;
  if(!training&&snapshot?.origin){const o=snapshot.origin,lat=Math.round(o.lat*1000)/1000,lon=Math.round(o.lon*1000)/1000;key=`${lat.toFixed(3)}:${lon.toFixed(3)}`;project=nativeOsmProjector(o).project;anchor=project(lon,lat);}
  else if(snapshot?.origin)project=nativeOsmProjector(snapshot.origin).project;
  const roads=[];
  for(const r of snapshot?.roads||[]){const cls=String(r.properties?.highway||r.properties?.class||"");if(/path|track|foot|cycle/.test(cls))continue;const c=r.geometry?.coordinates;if(!Array.isArray(c)||c.length<2||!project)continue;
    try{const pts=c.map(([lo,la])=>project(lo,la));const bb=[Infinity,Infinity,-Infinity,-Infinity];for(const q of pts){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}
      if(bb[0]>anchor[0]+96||bb[2]<anchor[0]-96||bb[1]>anchor[1]+96||bb[3]<anchor[1]-96)continue;roads.push({pts,bb});}catch{}}
  treeState={seed:hashText(`arondight-world-pop:${key}`),anchor,roads,prismKey:""};positionTrees();
  const v=globalThis.document?.getElementById?.("viewport");if(v){v.dataset.worldProceduralBucket=key;v.dataset.worldProceduralTrees=String(trees.length);}
}
function treeMatrices(t){
  const g=ground(t.x,t.y),s=t.sc;let axis=null,angle=0;
  if(t.fall){const k=t.fall.t/t.fall.dur;angle=1.45*k*k;axis=t.fall.axis;}
  else if(t.sway){axis=[-t.sway.dir[1],t.sway.dir[0],0];angle=.09*Math.exp(-t.sway.t*3.5)*Math.sin(t.sway.t*18);}
  const at=(h,sc)=>{if(!axis)return [sc,0,0,0,0,sc,0,0,0,0,sc,0,t.x,t.y,g+h,1];const m=axisAngle(axis,angle,sc,[0,0,0]),off=[m[8]/sc*h,m[9]/sc*h,m[10]/sc*h];m[12]=t.x+off[0];m[13]=t.y+off[1];m[14]=g+off[2];return m;};
  return {trunk:at(1.15*s,s),crown:at(2.75*s,s*1.12)};
}
function drawTrees(r){
  if(!treesDirty)return;treesDirty=false;
  if(!trees.length){if(treesDrawn){r.remove("trees/trunk");r.remove("trees/crown");treesDrawn=false;}return;}
  const tt=new Float32Array(trees.length*16),tc=new Float32Array(trees.length*16);trees.forEach((t,i)=>{const m=treeMatrices(t);tt.set(m.trunk,i*16);tc.set(m.crown,i*16);});
  if(!treesDrawn){r.upsert("trees/trunk",{...TRUNK,instances:{transforms:tt},material:{roughness:.95}});r.upsert("trees/crown",{...CROWN,instances:{transforms:tc},material:{roughness:.9}});treesDrawn=true;}
  else{r.updateInstances("trees/trunk",{transforms:tt});r.updateInstances("trees/crown",{transforms:tc});}
}
export function knockTree(t,fromX,fromY,force=1){
  if(!t||t.fall)return false;let d=[t.x-fromX,t.y-fromY,0];if(Math.hypot(d[0],d[1])<.1)d=[1,0,0];d=norm(d);
  t.fall={t:0,dur:Math.max(.45,1.3-.5*force),dir:d,axis:[-d[1],d[0],0]};chipBurst([t.x,t.y,ground(t.x,t.y)+2.4],[0,0,1],"tree",10,5);treesDirty=true;return true;
}
function hitTree(t,point,fromX,fromY){if(t.fall)return;t.hp-=1;t.sway={t:0,dir:norm([point[0]-fromX,point[1]-fromY,0])};chipBurst(point,norm([fromX-point[0],fromY-point[1],0]),"tree",5,3.2);if(t.hp<=0)knockTree(t,fromX,fromY,.6);treesDirty=true;}
function stepTrees(dt){
  for(const t of trees){
    if(t.fall&&!t.fall.landed){t.fall.t=Math.min(t.fall.dur,t.fall.t+dt);treesDirty=true;if(t.fall.t>=t.fall.dur){t.fall.landed=true;const g=ground(t.x,t.y);chipBurst([t.x+t.fall.dir[0]*3,t.y+t.fall.dir[1]*3,g+.3],[0,0,1],"tree",8,3);}}
    else if(t.sway){t.sway.t+=dt;if(t.sway.t>1.2)t.sway=null;treesDirty=true;}
  }
}
// first tree on a ray (trunk cylinder or crown sphere), before maxT
function treeOnRay(o,d,maxT){
  let best=null;for(const t of trees){if(t.fall)continue;const g=ground(t.x,t.y),s=t.sc;
    const cz=g+2.75*s,cr=.92*s*1.12,ax=t.x-o[0],ay=t.y-o[1],az=cz-o[2],tc=ax*d[0]+ay*d[1]+az*d[2];
    if(tc>0&&tc<maxT){const px=o[0]+d[0]*tc-t.x,py=o[1]+d[1]*tc-t.y,pz=o[2]+d[2]*tc-cz,dd=px*px+py*py+pz*pz;if(dd<cr*cr){const tt=tc-Math.sqrt(cr*cr-dd);if(!best||tt<best.t)best={tree:t,t:tt};}}
    // trunk: closest approach of the ray to the vertical axis, within its height
    const hx=d[0],hy=d[1],hl=hx*hx+hy*hy;if(hl>1e-6){const tt=((t.x-o[0])*hx+(t.y-o[1])*hy)/hl;if(tt>0&&tt<maxT){const px=o[0]+hx*tt-t.x,py=o[1]+hy*tt-t.y,z=o[2]+d[2]*tt;if(px*px+py*py<(.17*s)**2&&z>g&&z<g+2.3*s&&(!best||tt<best.t))best={tree:t,t:tt};}}
  }return best;
}
// ------------------------------------------------------------------ surfaces
// production facade layout (window cells 2.55 m wide, floors 3.2 m): is the hit on glass?
function wallCoords(point){
  let best=null;for(const p of prisms()){const pts=p.points;if(!pts||pts.length<3)continue;const b=bbox(p);if(point[0]<b[0]-.4||point[0]>b[2]+.4||point[1]<b[1]-.4||point[1]>b[3]+.4)continue;
    for(let i=0;i<pts.length;i++){const a=pts[i],c=pts[(i+1)%pts.length],ex=c[0]-a[0],ey=c[1]-a[1],L=Math.hypot(ex,ey)||1,t=Math.max(0,Math.min(L,((point[0]-a[0])*ex+(point[1]-a[1])*ey)/L)),dx=a[0]+ex/L*t-point[0],dy=a[1]+ey/L*t-point[1],dd=Math.hypot(dx,dy);
      if(dd<.4&&(!best||dd<best.d))best={d:dd,u:t,v:point[2]-(Number(p.base)||0),top:Number(p.top)||0};}}
  return best;
}
function onGlass(u,v){if(!Number.isFinite(u)||!Number.isFinite(v)||v<0)return false;const fl=Math.floor(v/3.2),cy=v/3.2-fl,cx=u/2.55-Math.floor(u/2.55),inset=fl<=0?.16:.22;return cx>inset&&cx<1-inset&&cy>.3&&cy<.8;}
// A bullet: hit {point,normal,surface,wallU,wallV} (may be null) along ray {origin,direction}.
export function nativeBulletImpact(ray,hit,{maxDistance=180}={}){
  const o=ray?.origin,d=ray?.direction?norm(ray.direction):null;
  let point=hit?.point?[...hit.point]:null,normal=hit?.normal?[...hit.normal]:null,surface=hit?.surface||null;
  if(o&&d&&surface!=="actor"){const maxT=point?Math.hypot(point[0]-o[0],point[1]-o[1],point[2]-o[2]):maxDistance,tr=treeOnRay(o,d,maxT);
    if(tr){const p=[o[0]+d[0]*tr.t,o[1]+d[1]*tr.t,o[2]+d[2]*tr.t];hitTree(tr.tree,p,o[0],o[1]);addDecal(p,d.map(x=>-x),{size:.07,color:0x3a2a1c});return true;}}
  if(!point&&o&&d&&d[2]<-1e-4){let t=(ground(o[0],o[1])-o[2])/d[2];if(t>0&&t<maxDistance){point=[o[0]+d[0]*t,o[1]+d[1]*t,0];point[2]=ground(point[0],point[1]);normal=groundNormal(point[0],point[1]);surface="ground";}}
  if(!point)return false;
  if(!surface){const n=normal||[0,0,1];surface=n[2]>.75&&point[2]-ground(point[0],point[1])<.6?"ground":"building";}
  normal??=d?d.map(x=>-x):[0,0,1];if(d&&normal[0]*d[0]+normal[1]*d[1]+normal[2]*d[2]>0)normal=normal.map(x=>-x);
  if(surface==="actor"){chipBurst(point,normal,"actor",3,2);return true;}
  if(surface==="building"){let u=hit?.wallU,v=hit?.wallV;if(!Number.isFinite(u)){const w=wallCoords(point);u=w?.u;v=w?.v;}
    if(onGlass(u,v)){addCrack(point,normal);chipBurst(point,normal,"glass",5,2.6);return true;}}
  addDecal(point,normal,{size:surface==="vehicle"?.06:.085,color:surface==="ground"?0x2e2a22:surface==="vehicle"?0x1c1c1c:0x34302a,ground:surface==="ground"});
  chipBurst(point,normal,surface,surface==="vehicle"?5:6,surface==="vehicle"?5:3.5);
  return true;
}
function onExplosion(event){
  const det=event?.detail||{},pos=det.position;const x=Array.isArray(pos)?+pos[0]:+pos?.x,y=Array.isArray(pos)?+pos[1]:+pos?.y,z=Array.isArray(pos)?+pos[2]:+pos?.z;if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const r=Math.max(1.5,Math.min(400,Number(det.radiusM)||6)),g=ground(x,y),nuke=det.kind==="nuke",zz=Number.isFinite(z)?z:g;
  if(!nuke){
    if(zz-g<r*.6)addScorch(x,y,Math.min(5.5,r*.5));
    chipBurst([x,y,zz+.2],[0,0,1],"ground",Math.min(26,8+r*2),6+r*.6);
    // soot on the walls in reach, laid on the wall itself (never in the air)
    for(const p of prisms()){const pts=p.points;if(!pts||pts.length<3)continue;const b=bbox(p);if(x<b[0]-r||x>b[2]+r||y<b[1]-r||y>b[3]+r)continue;
      for(let i=0;i<pts.length;i++){const a=pts[i],c=pts[(i+1)%pts.length],ex=c[0]-a[0],ey=c[1]-a[1],L=Math.hypot(ex,ey)||1,t=Math.max(0,Math.min(L,((x-a[0])*ex+(y-a[1])*ey)/L)),px=a[0]+ex/L*t,py=a[1]+ey/L*t,dd=Math.hypot(px-x,py-y);
        if(dd<r*.8&&zz<(Number(p.top)||0)+1){let nx=ey/L,ny=-ex/L;if(nx*(x-px)+ny*(y-py)<0){nx=-nx;ny=-ny;}addDecal([px,py,Math.max((Number(p.base)||0)+.4,zz)],[nx,ny,0],{size:Math.min(2.2,r*.32)*(1-dd/r*.6),color:0x15120f});}}}
  }
  const reach=nuke?Math.min(600,r*1.4):r*.85;
  for(const t of trees){const dist=Math.hypot(t.x-x,t.y-y);if(dist<reach){if(nuke)setTimeout(()=>knockTree(t,x,y,1.4),dist/343*1000);else knockTree(t,x,y,1-dist/reach);}}
}
// ------------------------------------------------------------------ per frame
const DISC=circleGeo(),CRACK=crackGeo(),CUBE=cubeGeo(),TRUNK=trunkGeo(),CROWN=crownGeo();
let chipsShown=false,decalsShown=false,cracksShown=false;
export function tickNativeWorldImpacts(now=performance.now()){
  const r=R();if(!r?.upsert)return;const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  // chips
  const live=[];for(const c of chips){if(c.life<=0)continue;c.life-=dt;if(c.life<=0)continue;c.v[2]-=9.81*dt;for(let k=0;k<3;k++)c.p[k]+=c.v[k]*dt;const g=ground(c.p[0],c.p[1]);
    if(c.p[2]<g+c.size*.5){c.p[2]=g+c.size*.5;c.v=c.v.map(x=>x*.35);c.v[2]=Math.abs(c.v[2])*.3;}c.angle+=c.spin*dt;live.push(c);}
  if(live.length){const tr=new Float32Array(live.length*16),ti=new Float32Array(live.length*4);live.forEach((c,i)=>{tr.set(axisAngle(c.axis,c.angle,c.size*Math.min(1,c.life*3),c.p),i*16);ti.set([...c.c,1],i*4);});
    r.upsert("impacts/chips",{...CUBE,instances:{transforms:tr,tints:ti},material:{castShadow:false,roughness:.9}});chipsShown=true;}
  else if(chipsShown){r.remove("impacts/chips");chipsShown=false;}
  if(decalsDirty){decalsDirty=false;const list=decals.filter(Boolean),tr=new Float32Array(list.length*16),ti=new Float32Array(list.length*4);
    list.forEach((dc,i)=>{const m=dc.ground?basis(groundNormal(dc.x,dc.y),dc.spin,dc.size,[dc.x,dc.y,ground(dc.x,dc.y)+.03]):dc.m;tr.set(m,i*16);ti.set([...dc.c,.86],i*4);});
    if(list.length){r.upsert("impacts/decals",{...DISC,instances:{transforms:tr,tints:ti},material:{unlit:true,doubleSided:true,castShadow:false,alphaMode:"blend",color:[1,1,1,1]}});decalsShown=true;}else if(decalsShown){r.remove("impacts/decals");decalsShown=false;}}
  if(cracksDirty){cracksDirty=false;const list=cracks.filter(Boolean),tr=new Float32Array(list.length*16);list.forEach((c,i)=>tr.set(c.m,i*16));
    if(list.length){r.upsert("impacts/cracks",{...CRACK,instances:{transforms:tr},material:{unlit:true,doubleSided:true,castShadow:false,alphaMode:"blend",color:[.9,.95,1,.85]}});cracksShown=true;}else if(cracksShown){r.remove("impacts/cracks");cracksShown=false;}}
  drawScorches(r);stepTrees(dt);
  if(trees.length&&treeState.prismKey!==String(prisms().length))positionTrees();
  drawTrees(r);
}
export function installNativeWorldImpacts(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  window.addEventListener("arondight:world-explosion",onExplosion);
  window.addEventListener("arondight:world-reset",()=>{for(const t of trees){t.hp=TREE_HP;t.fall=null;t.sway=null;}treesDirty=true;decals.fill(null);decalsDirty=true;cracks.fill(null);cracksDirty=true;scorches.fill(null);scorchDirty=true;});
  globalThis.__worldImpacts={bullet:nativeBulletImpact,decal:addDecal,scorch:addScorch,chips:chipBurst,knockTree,trees:()=>trees.map(t=>({x:t.x,y:t.y,sc:t.sc,hp:t.hp,fallen:Boolean(t.fall)})),version:NATIVE_WORLD_IMPACTS_VERSION};
  const v=document.getElementById("viewport");if(v)v.dataset.worldImpacts=NATIVE_WORLD_IMPACTS_VERSION;
}
