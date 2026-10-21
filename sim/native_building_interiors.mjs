// Production building_interiors.mjs (walkable buildings) on the native
// WebGL2 engine. Every real building of the map can be entered on foot
// through its front door(s): storeys that line up with the facade windows,
// a switchback stairwell from the lobby up to the roof, furnished floors
// (offices, apartments, a lobby with reception), window openings that look
// out onto the real city, ceiling lights and a stair house on the roof.
//
// Same constants, layout rules and API (globalThis.__buildingInteriors) as
// production. Only ONE interior exists at a time — the building the player is
// in or walking up to; nearby buildings only show their closed front doors
// (two instanced draws for all of them). Interior walls carry the same facade
// record as the outside walls (native_city_geometry.mjs), so the renderer's
// facade shader puts the window openings inside exactly where the windows are
// outside; the exterior gets a real hole for the open door and the roof hatch
// (renderer facade cutouts, production CUTOUT_GLSL).
//
// Walking: the native foot body is a Box3D body and buildings are static
// Box3D prisms. While the player is inside the active building or at one of
// its doors, the runtime hands the foot step to footStep(): the body stops
// colliding with the static world (terrain/building category), gravity is
// off, and resolveMove()/feetHeightAt() — production's 2-D wall collision and
// walkable-surface rule — drive its velocity, exactly like production's walk
// controller asks them first. Outside the door the normal physics returns.
import earcut from "./vendor/earcut.mjs";
import {buildingFootprintsFromFeatures} from "./world_building_collisions.mjs";
import {nativeOsmProjector} from "./native_osm_projector.mjs";
import {buildingGroundBase} from "./terrain_craters.mjs";
import {onElevationChange} from "./terrain_elevation.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";

export const BUILDING_INTERIORS_VERSION="walkable-interiors-v1-native";
const ACTIVATE_M=30,DOORS_RADIUS_M=95,MAX_CLOSED_DOORS=24,DOOR_W=1.8,DOOR_H=2.55,WALL_IN=.3,R_PLAYER=.3,STEP_MAX=.55;
const LANE=1.2,CORE_W=2*LANE+.2,LAND=1.3,RUN=3.6,CORE_L=2*LAND+RUN,GROUND_STOREY=4,SLAB=.25,MAX_LEVELS=12,ROOF_HOUSE=2.7;
const K={reveal:-1,wall:0,wood:1,tile:2,ceil:3,stone:4,metal:5,lamp:6,plain:7,concrete:8,carpet:9,accent:10,woodTrim:11,stairWall:12,riser:13,skirting:14};
const MAX_FACADE_CUTOUTS=6;
// native foot body: centre above the feet (Box3D "player-foot", see native_game_input setPose)
const FOOT_CENTRE=.97;
const TERRAIN_CATEGORY=1n;
let game=null;
const viewport=()=>typeof document!=="undefined"?document.getElementById("viewport"):null;
const setData=(k,v)=>{const el=viewport();if(el)el.dataset[k]=String(v);};
const renderer=()=>game?.world?.renderer||null;
const onFoot=()=>game?.mode==="foot";
const terrainAt=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
function playerFeet(){const p=game?.rigids?.pose?.("player-foot")?.position;return p?{x:p[0],y:p[1],z:p[2]-FOOT_CENTRE}:null;}

// ------------------------------------------------------------------ geometry utils
const area2=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return a/2;}; // >0 = CCW
function cleanRing(points){const r=[];for(const p of points||[]){const x=+p[0],y=+p[1];if(!Number.isFinite(x)||!Number.isFinite(y))continue;const q=r.at(-1);if(q&&Math.hypot(q[0]-x,q[1]-y)<.05)continue;r.push([x,y]);}if(r.length>2&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<.05)r.pop();return r;}
function pip(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],c=ring[j];if(((a[1]>y)!==(c[1]>y))&&x<(c[0]-a[0])*(y-a[1])/((c[1]-a[1])||1e-9)+a[0])inside=!inside;}return inside;}
function segDist(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy||1e-9,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l));return Math.hypot(px-ax-dx*t,py-ay-dy*t);}
function ringDist(x,y,ring){let d=Infinity;for(let i=0,j=ring.length-1;i<ring.length;j=i++)d=Math.min(d,segDist(x,y,ring[j][0],ring[j][1],ring[i][0],ring[i][1]));return d;}
// Offset to the LEFT of the travel direction (inside of a CCW outer ring,
// solid side of a CW hole ring) with clamped miters.
function offsetRing(r,d){const n=r.length,out=[];for(let i=0;i<n;i++){const p=r[(i+n-1)%n],c=r[i],q=r[(i+1)%n];let ax=c[0]-p[0],ay=c[1]-p[1],bx=q[0]-c[0],by=q[1]-c[1];const la=Math.hypot(ax,ay)||1,lb=Math.hypot(bx,by)||1;ax/=la;ay/=la;bx/=lb;by/=lb;const n0x=-ay,n0y=ax,n1x=-by,n1y=bx,dot=n0x*n1x+n0y*n1y;let mx=n0x+n1x,my=n0y+n1y;const k=1/Math.max(.25,1+dot);mx*=k;my*=k;out.push([c[0]+mx*d,c[1]+my*d]);}return out;}
function hashKey(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;}
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
// production world_city_buildings facadeParams(key) == native_city_geometry's per-building record
export function facadeParams(key){const h=hashKey(key);return{seed:(h%997)/997,floorH:3.1+.5*(((h>>>12)%1000)/1000)};}

// ------------------------------------------------------------------ colours
// Production shader constants are linear; the native renderer takes sRGB.
const lin2s=c=>c<=.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-.055;
const L=(r,g,b)=>[lin2s(r),lin2s(g),lin2s(b)];
function hex(h){let s=String(h).replace("#","");if(s.length===3)s=s.split("").map(c=>c+c).join("");const n=parseInt(s,16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
const WALL_COLORS=["#ece7dd","#e6e1d6","#dfe3e0","#efe9df","#e4ddd2","#e9e6e1"],ACCENTS=["#7f9a8a","#b0705a","#5f7590","#c9a35e","#8a7aa0","#6f8f7a","#a6644f","#4f6a7c"];
function kindColor(k,pal){
  switch(k){
    case K.reveal:case K.wall:return pal.wall;
    case K.wood:return L(.52,.35,.205);
    case K.tile:return L(.49,.46,.415);
    case K.ceil:return L(.55,.52,.47); // unlit: production's emissive fill + panel glow
    case K.stone:return L(.30,.26,.22);
    case K.metal:return L(.11,.12,.13);
    case K.lamp:return L(1,.93,.78);
    case K.plain:return pal.wall.map(v=>v*.97);
    case K.concrete:return L(.46,.46,.45);
    case K.carpet:return L(.34,.36,.39);
    case K.accent:return pal.accent;
    case K.woodTrim:return L(.40,.27,.17);
    case K.stairWall:return L(.86,.85,.82);
    case K.riser:return L(.66,.64,.60);
    case K.skirting:return L(.24,.18,.13);
    default:return pal.wall;
  }
}

// ------------------------------------------------------------------ shell builder
// Three draw parts per storey: lit (double sided, production DoubleSide),
// rev (the reveal: front faces only — "only seen from inside, never z-fights
// the facade") and glow (unlit ceilings and lamp panels).
const mkPart=()=>({p:[],n:[],c:[],uv:[],f:[]});
class Shell{
  constructor(b){this.b=b;this.parts={lit:mkPart(),rev:mkPart(),glow:mkPart()};}
  v(part,p,n,col,w){part.p.push(p[0],p[1],p[2]);part.n.push(n[0],n[1],n[2]);part.c.push(col[0],col[1],col[2]);
    if(w){part.uv.push(w[0],w[2]);part.f.push(w[1],w[3],this.b.params.seed,this.b.params.floorH);}else{part.uv.push(0,0);part.f.push(0,0,0,0);}}
  partOf(k){return k===K.reveal?this.parts.rev:k===K.ceil||k===K.lamp?this.parts.glow:this.parts.lit;}
  // a,b,c,d counter-clockwise as seen from the visible side
  quad(a,b,c,d,k,o={}){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;const n=[nx/l,ny/l,nz/l];
    const W=o.wall||null,pts=[a,b,c,a,c,d],ws=W?[W[0],W[1],W[2],W[0],W[2],W[3]]:null,part=this.partOf(k),col=kindColor(k,this.b.pal);
    for(let i=0;i<6;i++)this.v(part,pts[i],n,col,ws?ws[i]:null);}
  tri(a,b,c,k){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;const n=[nx/l,ny/l,nz/l],part=this.partOf(k),col=kindColor(k,this.b.pal);this.v(part,a,n,col);this.v(part,b,n,col);this.v(part,c,n,col);}
  // horizontal polygon (outer CCW + holes), facing up or down
  slab(outer,holes,z,k,up=true){if(outer.length<3)return;const rings=[outer,...holes.filter(r=>r.length>2)],flat=[],starts=[],all=[];for(const r of rings){if(all.length)starts.push(all.length);for(const p of r){flat.push(p[0],p[1]);all.push(p);}}
    let tris;try{tris=earcut(flat,starts,2);}catch{return;}
    for(let i=0;i+2<tris.length;i+=3){let a=all[tris[i]],b=all[tris[i+1]],d=all[tris[i+2]];const cw=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0])<0;if(cw===up)[b,d]=[d,b];this.tri([a[0],a[1],z],[b[0],b[1],z],[d[0],d[1],z],k);}}
  // oriented box around the segment p0→p1 (any slope), width w (horizontal), height h (vertical, centred)
  beam(p0,p1,w,h,k){const dx=p1[0]-p0[0],dy=p1[1]-p0[1],l=Math.hypot(dx,dy)||1,sx=-dy/l*w/2,sy=dx/l*w/2,hz=h/2;
    const c=(p,s,t)=>[p[0]+sx*s,p[1]+sy*s,p[2]+hz*t];const A=[c(p0,-1,-1),c(p0,1,-1),c(p0,1,1),c(p0,-1,1)],B=[c(p1,-1,-1),c(p1,1,-1),c(p1,1,1),c(p1,-1,1)];
    this.quad(A[3],A[2],B[2],B[3],k);this.quad(A[1],A[0],B[0],B[1],k);this.quad(A[0],A[3],B[3],B[0],k);this.quad(A[2],A[1],B[1],B[2],k);this.quad(A[0],A[1],A[2],A[3],k);this.quad(B[1],B[0],B[3],B[2],k);}
  geometries(){const out={};for(const[name,P]of Object.entries(this.parts)){if(!P.p.length)continue;out[name]={positions:new Float32Array(P.p),normals:new Float32Array(P.n),colors:new Float32Array(P.c),uvs:new Float32Array(P.uv),facade:new Float32Array(P.f)};}return out;}
}
// One shell per storey (index F = roof parts) so only the storeys around the
// player are drawn — no overdraw from the floors above and below.
class LevelShells{
  constructor(b){this.b=b;this.m=new Map();this.k=0;}
  at(k){this.k=k;return this;}
  cur(){let s=this.m.get(this.k);if(!s){s=new Shell(this.b);this.m.set(this.k,s);}return s;}
  quad(...a){this.cur().quad(...a);}tri(...a){this.cur().tri(...a);}slab(...a){this.cur().slab(...a);}beam(...a){this.cur().beam(...a);}
  geometries(){return[...this.m].map(([k,s])=>[k,s.geometries()]);}
}

// ------------------------------------------------------------------ props (instanced furniture)
const ICO_T=(1+Math.sqrt(5))/2,ICO_V=[[-1,ICO_T,0],[1,ICO_T,0],[-1,-ICO_T,0],[1,-ICO_T,0],[0,-1,ICO_T],[0,1,ICO_T],[0,-1,-ICO_T],[0,1,-ICO_T],[ICO_T,0,-1],[ICO_T,0,1],[-ICO_T,0,-1],[-ICO_T,0,1]].map(v=>{const l=Math.hypot(...v);return v.map(c=>c/l);});
const ICO_F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
export function propGeometry(parts){
  const pos=[],nrm=[],col=[];
  const face=(a,b,cc,d,n,color)=>{for(const p of[a,b,cc,a,cc,d]){pos.push(...p);nrm.push(...n);col.push(...color);}};
  for(const part of parts){const color=hex(part.c);
    if(part.box){const[x,y,z,sx,sy,sz]=part.box,rz=part.rz||0,cs=Math.cos(rz),sn=Math.sin(rz),P=(dx,dy,dz)=>[x+dx*cs-dy*sn,y+dx*sn+dy*cs,z+dz],N=(nx,ny,nz)=>[nx*cs-ny*sn,nx*sn+ny*cs,nz];const hx=sx/2,hy=sy/2,hz=sz/2;
      face(P(-hx,-hy,hz),P(hx,-hy,hz),P(hx,hy,hz),P(-hx,hy,hz),N(0,0,1),color);face(P(-hx,hy,-hz),P(hx,hy,-hz),P(hx,-hy,-hz),P(-hx,-hy,-hz),N(0,0,-1),color);
      face(P(-hx,-hy,-hz),P(hx,-hy,-hz),P(hx,-hy,hz),P(-hx,-hy,hz),N(0,-1,0),color);face(P(hx,hy,-hz),P(-hx,hy,-hz),P(-hx,hy,hz),P(hx,hy,hz),N(0,1,0),color);
      face(P(hx,-hy,-hz),P(hx,hy,-hz),P(hx,hy,hz),P(hx,-hy,hz),N(1,0,0),color);face(P(-hx,hy,-hz),P(-hx,-hy,-hz),P(-hx,-hy,hz),P(-hx,hy,hz),N(-1,0,0),color);}
    else if(part.cyl){const[x,y,z0,r,h,seg=10,r2=r]=part.cyl;for(let i=0;i<seg;i++){const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1),am=(a0+a1)/2;
        face([x+c0*r,y+s0*r,z0],[x+c1*r,y+s1*r,z0],[x+c1*r2,y+s1*r2,z0+h],[x+c0*r2,y+s0*r2,z0+h],[Math.cos(am),Math.sin(am),0],color);
        pos.push(x,y,z0+h,x+c0*r2,y+s0*r2,z0+h,x+c1*r2,y+s1*r2,z0+h);for(let k=0;k<3;k++){nrm.push(0,0,1);col.push(...color);}}}
    else if(part.ico){const[x,y,z,r,sz=1]=part.ico;for(const f of ICO_F){const v=f.map(i=>[ICO_V[i][0]*r,ICO_V[i][1]*r,ICO_V[i][2]*r*sz]);let n=[(v[1][1]-v[0][1])*(v[2][2]-v[0][2])-(v[1][2]-v[0][2])*(v[2][1]-v[0][1]),(v[1][2]-v[0][2])*(v[2][0]-v[0][0])-(v[1][0]-v[0][0])*(v[2][2]-v[0][2]),(v[1][0]-v[0][0])*(v[2][1]-v[0][1])-(v[1][1]-v[0][1])*(v[2][0]-v[0][0])];const l=Math.hypot(...n)||1;n=n.map(c=>c/l);const m=[0,1,2].map(a=>(v[0][a]+v[1][a]+v[2][a])/3);if(n[0]*m[0]+n[1]*m[1]+n[2]*m[2]<0){n=n.map(c=>-c);v.reverse();}
        for(const p of v){pos.push(p[0]+x,p[1]+y,p[2]+z);nrm.push(...n);col.push(...color);}}}}
  return{positions:new Float32Array(pos),normals:new Float32Array(nrm),colors:new Float32Array(col)};
}
// Local frame: x across, y = depth (front faces −y), z up; origin on the floor.
const OAK="#b98b5c",WALNUT="#5e3f2a",DARK="#24262a",STEEL="#8b9096",WHITE="#eeece6",FABRIC="#f2f2f2";
export const PROP_DEFS={
  desk:{r:.95,parts:[{box:[0,0,.735,1.6,.8,.04],c:OAK},...[[-.74,-.34],[.74,-.34],[-.74,.34],[.74,.34]].map(([x,y])=>({box:[x,y,.36,.04,.04,.72],c:DARK})),{box:[0,.22,1.03,.62,.035,.38],c:"#111214"},{box:[0,.22,1.03,.58,.02,.34],c:"#2b3a4c"},{box:[0,.25,.8,.06,.06,.12],c:DARK},{box:[0,.25,.76,.22,.16,.015],c:DARK},{box:[0,-.12,.765,.46,.15,.02],c:"#2e3033"},{box:[.55,.1,.82,.08,.08,.14],c:"#c95a3a"}]},
  chair:{r:.36,parts:[{box:[0,0,.46,.5,.5,.08],c:"#3a3f47"},{box:[0,.23,.78,.48,.06,.52],c:"#3a3f47"},{cyl:[0,0,.08,.03,.38,6],c:STEEL},{box:[0,0,.06,.62,.06,.04],c:DARK},{box:[0,0,.06,.62,.06,.04],rz:Math.PI/2,c:DARK}]},
  sofa:{r:1.1,tint:true,parts:[{box:[0,0,.22,2.1,.92,.3],c:FABRIC},{box:[-.5,-.05,.45,.98,.78,.14],c:FABRIC},{box:[.5,-.05,.45,.98,.78,.14],c:FABRIC},{box:[0,.36,.66,2.1,.2,.5],c:FABRIC},{box:[-1.0,0,.4,.16,.92,.46],c:FABRIC},{box:[1.0,0,.4,.16,.92,.46],c:FABRIC},...[[-.95,-.4],[.95,-.4],[-.95,.4],[.95,.4]].map(([x,y])=>({box:[x,y,.04,.05,.05,.08],c:WALNUT}))]},
  art:{r:0,tint:true,parts:[{box:[0,.02,1.55,1.04,.035,.76],c:"#2a2522"},{box:[0,-.002,1.55,.94,.03,.66],c:FABRIC},{box:[-.18,-.02,1.6,.36,.01,.3],c:"#e8dcc4"},{box:[.2,-.02,1.45,.26,.01,.22],c:"#1f2f3c"},{box:[.05,-.022,1.72,.5,.01,.06],c:"#c4553b"}]},
  armchair:{r:.55,tint:true,parts:[{box:[0,0,.22,.86,.84,.3],c:FABRIC},{box:[0,-.04,.42,.62,.7,.12],c:FABRIC},{box:[0,.34,.66,.86,.18,.56],c:FABRIC},{box:[-.38,0,.48,.12,.84,.38],c:FABRIC},{box:[.38,0,.48,.12,.84,.38],c:FABRIC},...[[-.36,-.36],[.36,-.36],[-.36,.36],[.36,.36]].map(([x,y])=>({box:[x,y,.035,.05,.05,.07],c:WALNUT}))]},
  lounge:{r:1.25,tint:true,parts:[{box:[0,0,.006,2.7,1.9,.012],c:FABRIC},{box:[0,0,.4,1.0,.55,.04],c:WALNUT},...[[-.44,-.22],[.44,-.22],[-.44,.22],[.44,.22]].map(([x,y])=>({box:[x,y,.2,.04,.04,.38],c:DARK})),{box:[-.2,.05,.45,.25,.18,.05],c:"#d9c39a"},{cyl:[.25,-.05,.42,.06,.12,8],c:"#e8e1d5"}]},
  dining:{r:1.25,parts:[{box:[0,0,.75,1.8,.9,.05],c:WALNUT},...[[-.82,-.38],[.82,-.38],[-.82,.38],[.82,.38]].map(([x,y])=>({box:[x,y,.37,.06,.06,.74],c:WALNUT})),...[[-.45,-.68,0],[.45,-.68,0],[-.45,.68,Math.PI],[.45,.68,Math.PI]].flatMap(([x,y,r])=>{const s=r?-1:1;return[{box:[x,y,.45,.44,.42,.05],c:OAK},{box:[x,y-.19*s,.72,.44,.05,.5],c:OAK},{box:[x-.18,y,.22,.04,.04,.44],c:OAK},{box:[x+.18,y,.22,.04,.04,.44],c:OAK}];}),{cyl:[0,0,.775,.08,.18,8,.05],c:"#dfe6e9"},{ico:[0,0,1.0,.12],c:"#4f7d3a"}]},
  shelf:{r:.62,parts:[{box:[-.58,0,.95,.03,.36,1.9],c:WHITE},{box:[.58,0,.95,.03,.36,1.9],c:WHITE},{box:[0,.17,.95,1.16,.02,1.9],c:WHITE},...[.04,.5,.95,1.4,1.88].map(z=>({box:[0,0,z,1.16,.36,.025],c:WHITE})),...Array.from({length:14},(_,i)=>{const sh=[.06,.52,.97,1.42][i%4],x=-.5+((i*.37)%1)*.95,h=.22+((i*.53)%1)*.12;return{box:[x,0,sh+h/2,.06+((i*.29)%1)*.05,.24,h],c:["#a33b2f","#2f5d8a","#d8b14a","#2e6b4f","#e7e2d6","#3a3a3a"][i%6]};})]},
  plant:{r:.32,parts:[{cyl:[0,0,0,.2,.42,10,.24],c:"#d9d4ca"},{cyl:[0,0,.42,.21,.03,10],c:"#3b2b1f"},{ico:[0,0,.85,.36,1.25],c:"#3d6b33"},{ico:[.12,-.08,1.15,.26,1.2],c:"#4d7f3d"},{ico:[-.1,.1,1.3,.2,1.3],c:"#5b8f45"}]},
  lamp:{r:.25,parts:[{cyl:[0,0,0,.16,.03,12],c:DARK},{cyl:[0,0,.03,.015,1.45,6],c:DARK},{cyl:[0,0,1.42,.24,.26,12,.14],c:"#f4e4c2"}]},
  bed:{r:1.25,tint:true,parts:[{box:[0,0,.18,1.72,2.18,.3],c:WALNUT},{box:[0,-.02,.43,1.62,2.04,.22],c:WHITE},{box:[0,-.45,.55,1.66,1.2,.06],c:FABRIC},{box:[-.4,.78,.6,.6,.36,.14],c:WHITE},{box:[.4,.78,.6,.6,.36,.14],c:WHITE},{box:[0,1.07,.6,1.74,.08,1.0],c:WALNUT},{box:[-1.15,.85,.28,.45,.4,.56],c:OAK},{cyl:[-1.15,.85,.56,.07,.25,8,.12],c:"#f4e4c2"}]},
  counter:{r:.55,parts:[{box:[0,0,.45,2.4,.6,.86],c:WHITE},{box:[0,-.01,.9,2.44,.64,.04],c:"#3d3f42"},{box:[.55,-.02,.905,.5,.38,.02],c:"#b9bec3"},{cyl:[.55,.2,.92,.02,.3,6],c:STEEL},{box:[-.6,-.02,.93,.55,.45,.03],c:"#222"},...[-.9,-.3,.3,.9].map(x=>({box:[x,-.305,.6,.3,.01,.02],c:STEEL}))]},
  reception:{r:1.5,parts:[{box:[0,0,.55,2.8,.75,1.1],c:WALNUT},{box:[0,-.05,1.12,2.9,.85,.05],c:"#d9d6cf"},{box:[0,.3,.76,2.6,.2,.04],c:"#d9d6cf"},{box:[-.6,.15,1.32,.5,.03,.32],c:"#111214"},{box:[0,-.39,.55,2.6,.01,.5],c:"#c7a35a"}]},
  bench:{r:.9,parts:[{box:[0,0,.44,1.9,.46,.06],c:OAK},{box:[-.8,0,.21,.06,.4,.42],c:DARK},{box:[.8,0,.21,.06,.4,.42],c:DARK}]},
  ac:{r:1.0,parts:[{box:[0,0,.55,1.5,1.1,1.1],c:"#a9adb1"},{cyl:[0,0,1.1,.4,.05,14],c:"#2c2f33"},{box:[0,-.56,.55,1.3,.02,.8],c:"#7f8489"}]},
  table:{r:.55,parts:[{cyl:[0,0,.72,.45,.04,16],c:"#efe9df"},{cyl:[0,0,.04,.05,.68,8],c:DARK},{cyl:[0,0,0,.25,.04,12],c:DARK},{ico:[0,0,.86,.1],c:"#7a9b55"}]},
};
let propGeos=null;
const TINTS=["#4f6d7a","#8a4f3c","#c2a15c","#5a6b4a","#6f6a8f","#9b9a96","#2f4a66","#b87a5a"];
const PROP_MATERIAL={roughness:.7,metalness:0,doubleSided:true,castShadow:false};

// door unit (local: x along the wall, y outward, z up; origin bottom centre at the facade)
let doorGeo=null,leafGeo=null,unitLeaf=null,unitPlank=null;
function doorGeometries(){if(doorGeo)return;const W=DOOR_W,H=DOOR_H;
  doorGeo=propGeometry([{box:[-W/2-.05,.04,H/2,.1,.14,H],c:"#1d1f22"},{box:[W/2+.05,.04,H/2,.1,.14,H],c:"#1d1f22"},{box:[0,.04,H+.06,W+.2,.14,.12],c:"#1d1f22"},{box:[0,.6,H+.42,W+.9,1.2,.08],c:"#2a2c30"},{box:[0,.75,H+.36,.3,.08,.04],c:"#fff2cf"},{box:[0,.02,.01,W+.3,.3,.02],c:"#6d6a64"},{box:[-W/2-.42,.04,H*.55,.16,.06,.5],c:"#3a3d42"}]);
  leafGeo=propGeometry([{box:[-W/4,.01,H/2,W/2-.04,.04,H-.04],c:"#1e2a33"},{box:[W/4,.01,H/2,W/2-.04,.04,H-.04],c:"#1e2a33"},{box:[-.08,.05,1.05,.03,.06,.5],c:"#9aa0a6"},{box:[.08,.05,1.05,.03,.06,.5],c:"#9aa0a6"}]);
  unitLeaf=propGeometry([{box:[0,0,0,1,1,1],c:"#1e2a33"}]);unitPlank=propGeometry([{box:[0,0,0,1,1,1],c:"#6b4a2c"}]);}

// ------------------------------------------------------------------ column-major 4x4 helpers
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
const RY=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
const S=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
const TRZ=(x,y,z,yaw)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return[c,s,0,0,-s,c,0,0,0,0,1,0,x,y,z,1];};

// ------------------------------------------------------------------ building analysis
function doorsFor(outer,area){
  const edges=[];for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<DOOR_W+1.4)continue;edges.push({i,a,b,len,dx:dx/len,dy:dy/len,nx:dy/len,ny:-dx/len});}
  edges.sort((p,q)=>q.len-p.len);const out=[];if(!edges.length)return out;
  const mk=e=>{const t=e.len/2;return{edge:e.i,t,len:e.len,ax:e.a[0],ay:e.a[1],dx:e.dx,dy:e.dy,nx:e.nx,ny:e.ny,cx:e.a[0]+e.dx*t,cy:e.a[1]+e.dy*t};};
  out.push(mk(edges[0]));if(area>260){const second=edges.find(e=>e!==edges[0]&&e.nx*edges[0].nx+e.ny*edges[0].ny<-.3);if(second)out.push(mk(second));}
  return out;
}
function findCore(inner,innerHoles,holes,doors,centroid,axis){
  let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;for(const p of inner){bx0=Math.min(bx0,p[0]);bx1=Math.max(bx1,p[0]);by0=Math.min(by0,p[1]);by1=Math.max(by1,p[1]);}
  const span=Math.max(bx1-bx0,by1-by0),step=Math.max(.8,span/18),cands=[];
  for(let x=bx0;x<=bx1;x+=step)for(let y=by0;y<=by1;y+=step)cands.push([x,y,Math.hypot(x-centroid[0],y-centroid[1])]);cands.sort((a,b)=>a[2]-b[2]);
  const okPoint=(x,y,clear)=>pip(x,y,inner)&&!innerHoles.some(h=>pip(x,y,h))&&ringDist(x,y,inner)>=clear&&innerHoles.every(h=>ringDist(x,y,h)>=clear);
  const dirs=[[axis[0],axis[1]],[-axis[0],-axis[1]],[-axis[1],axis[0]],[axis[1],-axis[0]]];
  for(const[cx,cy]of cands.slice(0,500)){
    if(doors.some(d=>Math.hypot(d.cx-cx,d.cy-cy)<CORE_L*.5+3.2))continue;
    for(const[vx,vy]of dirs){const ux=-vy,uy=vx,ox=cx-ux*CORE_W/2-vx*CORE_L/2,oy=cy-uy*CORE_W/2-vy*CORE_L/2,P=(u,v)=>[ox+ux*u+vx*v,oy+uy*u+vy*v];
      const pts=[P(0,0),P(CORE_W,0),P(0,CORE_L),P(CORE_W,CORE_L),P(CORE_W/2,CORE_L/2),P(0,CORE_L/2),P(CORE_W,CORE_L/2)];if(!pts.every(p=>okPoint(p[0],p[1],.12)))continue;
      const front=P(CORE_W/2,-1.4);if(!okPoint(front[0],front[1],.7))continue;
      const rect=[P(0,0),P(CORE_W,0),P(CORE_W,CORE_L),P(0,CORE_L)];if(holes.some(h=>h.some(p=>pip(p[0],p[1],rect))))continue;
      return{ox,oy,ux,uy,vx,vy,W:CORE_W,L:CORE_L,P,rect};}
  }
  return null;
}

// ------------------------------------------------------------------ interior build
let active=null,meshIds=[],levelIds=new Map(),propTypes=[],footprints=[];
// ------------------------------------------------------------------ swinging doors + barricades (active building)
// Double doors swing inwards when someone comes close and fall shut behind
// them. Every door also carries a barricade of planks on the outside: the
// undead (native_zombies.mjs) must smash them before they can get in; the
// player repairs them (points). Planks state lives per building key.
const PLANKS=6,doorState=new Map();let doorRigs=[],barricadesShown=false;
function plankState(key,n){let st=doorState.get(key);if(!st){st=Array.from({length:n},()=>PLANKS);doorState.set(key,st);if(doorState.size>400)doorState.delete(doorState.keys().next().value);}return st;}
function buildDoorRigs(b){const st=plankState(b.key,b.doors.length);doorRigs=b.doors.map((d,i)=>({d,i,angle:0,st}));}
function stepDoors(dt){
  if(!doorRigs.length||!active)return;const p=playerFeet(),z=globalThis.__zombies;
  for(const r of doorRigs){const near=(p&&onFoot()&&Math.hypot(p.x-r.d.cx,p.y-r.d.cy)<2.6)||Boolean(z?.atDoor?.(r.d.cx,r.d.cy)&&r.st[r.i]===0);const target=near?1.45:0;r.angle+=Math.max(-dt*3.2,Math.min(dt*3.2,target-r.angle));}
  // barricades only exist while the undead are out (night)
  barricadesShown=Boolean(z?.active);
}
function drawDoorRigs(){
  const r=renderer();if(!r)return;doorGeometries();const W=DOOR_W,H=DOOR_H,leaves=[],planks=[];
  if(active)for(const rig of doorRigs){const d=rig.d,root=TRZ(d.cx,d.cy,active.levels[0],Math.atan2(d.dy,d.dx)+Math.PI);
    // either or: at night the doorway is boarded up (no door leaves), by day there is a door and no planks
    if(!barricadesShown)for(const s of[-1,1])leaves.push(mul(root,mul(T(s*W/2,0,0),mul(RZ(s*rig.angle),mul(T(-s*(W/4),0,H/2),S(W/2-.04,.05,H-.04))))));
    else for(let k=0;k<rig.st[rig.i];k++)planks.push(mul(root,mul(T(k%2?.06:-.06,.22,.35+k*.36),mul(RY((k%2?1:-1)*(.08+.05*(k%3))),S(W+.5,.06,.2)))));}
  syncInstanced(r,"interiors/door-leaves-open",unitLeaf,leaves.length?packMatrices(leaves):null,{material:{roughness:.4,metalness:.35,castShadow:true}});
  syncInstanced(r,"interiors/planks",unitPlank,planks.length?packMatrices(planks):null,{material:{roughness:.85,castShadow:true}});
}
// API for the zombie mode: doors of the active building, breach / repair planks
function doorInfo(){if(!active)return[];return doorRigs.map(r=>({i:r.i,cx:r.d.cx,cy:r.d.cy,nx:r.d.nx,ny:r.d.ny,planks:r.st[r.i],z:active.levels[0]}));}
function damagePlank(i){const r=doorRigs[i];if(!r||r.st[r.i]<=0)return false;r.st[r.i]--;return true;}
function repairPlank(i){const r=doorRigs[i];if(!r||r.st[r.i]>=PLANKS)return false;r.st[r.i]++;return true;}
function playerInside(){const p=playerFeet();return Boolean(active&&p&&onFoot()&&region(active,p.x,p.y)==="in");}
function insideActive(x,y){return Boolean(active&&region(active,x,y)!=="out");}
function disposeActive(){
  const r=renderer();for(const id of meshIds){try{r?.remove(id);}catch{}}meshIds=[];levelIds.clear();
  for(const t of propTypes)syncInstanced(r,`interiors/prop/${t}`,propGeos?.[t],null);propTypes=[];
  doorRigs=[];if(r)syncInstanced(r,"interiors/door-leaves-open",unitLeaf,null),syncInstanced(r,"interiors/planks",unitPlank,null);
  active=null;shownLevel=-99;propsSeen=null;try{r?.setFacadeCutouts?.([]);}catch{}setData("buildingInterior","none");
}

export function buildInterior(fp){
  const key=String(fp.key),params=facadeParams(key),seed=hashKey(key),R=rng(seed^0x9e3779b9);
  let outer=cleanRing(fp.outer);if(outer.length<3)return null;if(area2(outer)<0)outer.reverse();
  const holes=(fp.holes||[]).map(cleanRing).filter(r=>r.length>2).map(r=>area2(r)>0?r.reverse():r);
  const area=Math.abs(area2(outer))-holes.reduce((s,h)=>s+Math.abs(area2(h)),0);if(area<24||area>40000)return null;
  const rel=Number(fp.base)||0;if(rel>.6)return null;const elev=buildingGroundBase(fp.outer),base=rel+elev,top=Math.max(base+3,(Number(fp.fullTop??fp.top)||8)+elev);
  const inner=offsetRing(outer,WALL_IN),innerHoles=holes.map(h=>offsetRing(h,WALL_IN));
  let cx=0,cy=0;for(const p of outer){cx+=p[0]/outer.length;cy+=p[1]/outer.length;}
  let best=null;for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!best||l>best.l)best={l,dx:(b[0]-a[0])/l,dy:(b[1]-a[1])/l};}
  const axis=[best.dx,best.dy];
  const doors=doorsFor(outer,area);if(!doors.length)return null;
  // storeys aligned with the facade (ground storey 4 m, then the facade's storey height)
  const floorH=params.floorH,levels=[base+.03];let z=base+GROUND_STOREY,capped=false;
  const core=top-base>GROUND_STOREY+2.7?findCore(inner,innerHoles,holes,doors,[cx,cy],axis):null;
  if(core){while(z+2.7<=top-.05){if(levels.length>=MAX_LEVELS){capped=true;break;}levels.push(z);z+=floorH;}}
  const F=levels.length,roofAccess=Boolean(core)&&!capped&&top-levels[F-1]<=floorH+1.8&&area<12000;
  // top storey ceiling: under the roof, under the next (unreachable) storey when
  // capped, or the ground storey's ceiling in a tall building without a core
  const ceilTop=capped?levels[F-1]+floorH-SLAB:F===1&&top-base>GROUND_STOREY+.5?base+GROUND_STOREY-SLAB:top-.3;
  const ceilOf=k=>k<F-1?levels[k+1]-SLAB:ceilTop;
  const stairs=[];if(core){for(let k=0;k<F-1;k++)stairs.push({z0:levels[k],R:levels[k+1]-levels[k]});if(roofAccess)stairs.push({z0:levels[F-1],R:top-levels[F-1]});}
  const topWalk=roofAccess?top:levels[F-1];
  const h=hashKey(key),pal={wall:hex(WALL_COLORS[h%6]),accent:hex(ACCENTS[(h>>>5)%8])};
  const b={key,elev,outer,holes,inner,innerHoles,base,top,area,axis,doors,core,levels,stairs,roofAccess,roofZ:roofAccess?top:null,ceilOf,topWalk,params,pal,cx,cy,furniture:[],props:[]};
  placeProps(b,R);b.shell=buildShell(b);return b;
}

function buildShell(b){
  const S=new LevelShells(b),{outer,inner,holes,innerHoles,base,top,levels,core,doors}=b,H=top-base,F=levels.length;
  const exteriorEdge=i=>{const a=outer[i],c=outer[(i+1)%outer.length],l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;return{a,l,dx:(c[0]-a[0])/l,dy:(c[1]-a[1])/l};};
  const holeEdge=(h,i)=>{const r=holes[h],a=r[i],c=r[(i+1)%r.length],l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;return{a,l,dx:(c[0]-a[0])/l,dy:(c[1]-a[1])/l};};
  const coreHole=core?[...core.rect].reverse():null;
  // walls (inner faces, facade window openings via the shared facade shader)
  const wallRing=(ring,edgeOf,kind=K.wall)=>{for(let i=0;i<ring.length;i++){const A=ring[i],B=ring[(i+1)%ring.length],e=edgeOf(i),uA=Math.max(.001,Math.min(e.l-.001,(A[0]-e.a[0])*e.dx+(A[1]-e.a[1])*e.dy)),uB=Math.max(.001,Math.min(e.l-.001,(B[0]-e.a[0])*e.dx+(B[1]-e.a[1])*e.dy));
    for(let k=0;k<F;k++){const z0=k===0?base:levels[k],z1=b.ceilOf(k)+.02;S.at(k).quad([B[0],B[1],z0],[A[0],A[1],z0],[A[0],A[1],z1],[B[0],B[1],z1],kind,{wall:[[uB,e.l,z0-base,H],[uA,e.l,z0-base,H],[uA,e.l,z1-base,H],[uB,e.l,z1-base,H]]});
      // skirting (production: dark wood where the wall meets the floor, vLocal<0.11)
      if(kind===K.wall){const lz=levels[k],dxw=B[0]-A[0],dyw=B[1]-A[1],lw=Math.hypot(dxw,dyw)||1,ox=-dyw/lw*.012,oy=dxw/lw*.012;S.quad([B[0]+ox,B[1]+oy,lz],[A[0]+ox,A[1]+oy,lz],[A[0]+ox,A[1]+oy,lz+.11],[B[0]+ox,B[1]+oy,lz+.11],K.skirting);}}}};
  wallRing(inner,i=>exteriorEdge(i));innerHoles.forEach((r,h)=>wallRing(r,i=>holeEdge(h,i)));
  // reveal: the inside face of the outer wall (2 cm in), same window holes —
  // closes the wall cavity so no sliver of the outside shows at window edges
  wallRing(offsetRing(outer,.02),i=>exteriorEdge(i),K.reveal);holes.forEach((r,h)=>wallRing(offsetRing(r,.02),i=>holeEdge(h,i),K.reveal));
  // window glass seen from inside: one quad per wall at the pane plane; the
  // glass mode of the facade shader keeps only the panes (same mask as outside)
  const G=new Shell(b),glassRing=(ring,edgeOf)=>{for(let i=0;i<ring.length;i++){const A=ring[i],B=ring[(i+1)%ring.length],e=edgeOf(i),uA=Math.max(.001,Math.min(e.l-.001,(A[0]-e.a[0])*e.dx+(A[1]-e.a[1])*e.dy)),uB=Math.max(.001,Math.min(e.l-.001,(B[0]-e.a[0])*e.dx+(B[1]-e.a[1])*e.dy));
    G.quad([B[0],B[1],base],[A[0],A[1],base],[A[0],A[1],top],[B[0],B[1],top],K.wall,{wall:[[uB,e.l,0,H],[uA,e.l,0,H],[uA,e.l,H,H],[uB,e.l,H,H]]});}};
  glassRing(offsetRing(outer,.035),i=>exteriorEdge(i));holes.forEach((r,h)=>glassRing(offsetRing(r,.035),i=>holeEdge(h,i)));b.glassGeometry=G.geometries().lit||null;
  // floors and ceilings (+ the ceiling light panels, production's emissive 3.6 m grid)
  const ax=b.axis[0],ay=b.axis[1];let qa0=Infinity,qa1=-Infinity,qc0=Infinity,qc1=-Infinity;for(const p of inner){const a=p[0]*ax+p[1]*ay,c=-p[0]*ay+p[1]*ax;qa0=Math.min(qa0,a);qa1=Math.max(qa1,a);qc0=Math.min(qc0,c);qc1=Math.max(qc1,c);}
  const inCore=(x,y,m)=>{if(!core)return false;const rx=x-core.ox,ry=y-core.oy,u=rx*core.ux+ry*core.uy,v=rx*core.vx+ry*core.vy;return u>-m&&u<core.W+m&&v>-m&&v<core.L+m;};
  for(let k=0;k<F;k++){const floorKind=k===0?K.tile:((b.params.seed*7+k)%2<1?K.wood:K.carpet);
    const hs=[...innerHoles];if(core&&k>0)hs.push(coreHole);S.at(k).slab(inner,hs,levels[k],floorKind,true);
    const ch=[...innerHoles];if(core&&(k<F-1||b.roofAccess))ch.push(coreHole);S.slab(inner,ch,b.ceilOf(k),K.ceil,false);
    const zc=b.ceilOf(k)-.008;for(let a=Math.ceil(qa0/3.6-.5)*3.6+1.8;a<qa1;a+=3.6)for(let c=Math.ceil(qc0/3.6-.5)*3.6+1.8;c<qc1;c+=3.6){
      const P=(da,dc)=>[(a+da)*ax-(c+dc)*ay,(a+da)*ay+(c+dc)*ax,zc],ctr=P(0,0);
      if(!pip(ctr[0],ctr[1],inner)||innerHoles.some(h2=>pip(ctr[0],ctr[1],h2))||ringDist(ctr[0],ctr[1],inner)<.8||inCore(ctr[0],ctr[1],.8))continue;
      S.quad(P(-.7,.3),P(.7,.3),P(.7,-.3),P(-.7,-.3),K.lamp);}}
  // roof parapet when the roof is walkable
  S.at(F);if(b.roofAccess){for(let i=0;i<inner.length;i++){const A=inner[i],B=inner[(i+1)%inner.length];S.quad([B[0],B[1],top],[A[0],A[1],top],[A[0],A[1],top+.95],[B[0],B[1],top+.95],K.plain);const C=outer[i],D=outer[(i+1)%outer.length];S.quad([B[0],B[1],top+.95],[A[0],A[1],top+.95],[C[0],C[1],top+.95],[D[0],D[1],top+.95],K.concrete);}}
  // doors: reveal tunnel, threshold, interior trim
  S.at(0);for(const d of doors){const t0=d.t-DOOR_W/2,t1=d.t+DOOR_W/2,P=(t,o,z)=>[d.ax+d.dx*t-d.nx*o,d.ay+d.dy*t-d.ny*o,z],z0=levels[0],zt=z0+DOOR_H;
    S.quad(P(t0,0,base),P(t0,WALL_IN+.02,base),P(t0,WALL_IN+.02,zt),P(t0,0,zt),K.plain);
    S.quad(P(t1,WALL_IN+.02,base),P(t1,0,base),P(t1,0,zt),P(t1,WALL_IN+.02,zt),K.plain);
    S.quad(P(t0,0,zt),P(t0,WALL_IN+.02,zt),P(t1,WALL_IN+.02,zt),P(t1,0,zt),K.plain);
    S.quad(P(t0,-.25,z0),P(t1,-.25,z0),P(t1,WALL_IN+.02,z0),P(t0,WALL_IN+.02,z0),K.stone);
    S.beam(P(t0-.05,WALL_IN+.03,z0),P(t0-.05,WALL_IN+.03,zt+.08),.1,.06,K.metal);S.beam(P(t1+.05,WALL_IN+.03,z0),P(t1+.05,WALL_IN+.03,zt+.08),.1,.06,K.metal);
    S.beam(P(t0-.1,WALL_IN+.03,zt+.05),P(t1+.1,WALL_IN+.03,zt+.05),.06,.1,K.metal);}
  // partition walls with doorways (rooms on the upper storeys)
  (b.partitions||[]).forEach((parts,k)=>{if(!parts?.length||k>=F)return;S.at(k);const z0=levels[k],z1=b.ceilOf(k)+.02;
    for(const w of parts){const dx=w.x1-w.x0,dy=w.y1-w.y0,l=Math.hypot(dx,dy)||1,nx=-dy/l*.06,ny=dx/l*.06,kind=w.accent?K.accent:K.plain;
      S.quad([w.x0+nx,w.y0+ny,z0],[w.x1+nx,w.y1+ny,z0],[w.x1+nx,w.y1+ny,z1],[w.x0+nx,w.y0+ny,z1],kind);
      S.quad([w.x1-nx,w.y1-ny,z0],[w.x0-nx,w.y0-ny,z0],[w.x0-nx,w.y0-ny,z1],[w.x1-nx,w.y1-ny,z1],K.plain);
      for(const[ex,ey]of[[w.x0,w.y0],[w.x1,w.y1]])S.quad([ex-nx,ey-ny,z0],[ex+nx,ey+ny,z0],[ex+nx,ey+ny,z1],[ex-nx,ey-ny,z1],K.plain);}
    for(const g of b.gaps?.[k]||[]){const hx=g.dx*.58,hy=g.dy*.58,nx=-g.dy*.07,ny=g.dx*.07,zl=z0+2.15;
      if(z1>zl+.02){S.quad([g.x-hx+nx,g.y-hy+ny,zl],[g.x+hx+nx,g.y+hy+ny,zl],[g.x+hx+nx,g.y+hy+ny,z1],[g.x-hx+nx,g.y-hy+ny,z1],K.plain);S.quad([g.x+hx-nx,g.y+hy-ny,zl],[g.x-hx-nx,g.y-hy-ny,zl],[g.x-hx-nx,g.y-hy-ny,z1],[g.x+hx-nx,g.y+hy-ny,z1],K.plain);S.quad([g.x-hx-nx,g.y-hy-ny,zl],[g.x+hx-nx,g.y+hy-ny,zl],[g.x+hx+nx,g.y+hy+ny,zl],[g.x-hx+nx,g.y-hy+ny,zl],K.plain);}
      for(const s2 of[-1,1])S.beam([g.x+g.dx*.58*s2,g.y+g.dy*.58*s2,z0],[g.x+g.dx*.58*s2,g.y+g.dy*.58*s2,zl+.04],.07,.16,K.woodTrim);
      S.beam([g.x-g.dx*.62,g.y-g.dy*.62,zl+.04],[g.x+g.dx*.62,g.y+g.dy*.62,zl+.04],.16,.07,K.woodTrim);}
  });
  if(core)buildCore(S,b);
  return S.geometries();
}
function buildCore(S,b){
  const c=b.core,{levels,stairs,top}=b,F=levels.length,P=(u,v,z)=>{const p=c.P(u,v);return[p[0],p[1],z];};
  const coreTop=b.roofAccess?top+ROOF_HOUSE:b.ceilOf(F-1)+.02,zBase=b.base,W=c.W,L=c.L,Tk=.075;
  // shaft walls (outside face towards the floors, inside face plain), per storey
  const spans=[];for(let k=0;k<F;k++)spans.push([k===0?zBase:levels[k],k<F-1?levels[k+1]:(b.roofAccess?top:coreTop),levels[k],k]);if(b.roofAccess)spans.push([top,coreTop,top,F]);
  for(const[z0,z1,lz,sk]of spans){S.at(sk);
    S.quad(P(-Tk,L,z0),P(-Tk,0,z0),P(-Tk,0,z1),P(-Tk,L,z1),K.accent);S.quad(P(Tk,0,z0),P(Tk,L,z0),P(Tk,L,z1),P(Tk,0,z1),K.stairWall);
    S.quad(P(W+Tk,0,z0),P(W+Tk,L,z0),P(W+Tk,L,z1),P(W+Tk,0,z1),K.accent);S.quad(P(W-Tk,L,z0),P(W-Tk,0,z0),P(W-Tk,0,z1),P(W-Tk,L,z1),K.stairWall);
    S.quad(P(-Tk,L+Tk,z0),P(W+Tk,L+Tk,z0),P(W+Tk,L+Tk,z1),P(-Tk,L+Tk,z1),K.accent);S.quad(P(W,L-Tk,z0),P(0,L-Tk,z0),P(0,L-Tk,z1),P(W,L-Tk,z1),K.stairWall);
    // central wall between the flights
    S.quad(P(W/2-.06,LAND+RUN,z0),P(W/2-.06,LAND,z0),P(W/2-.06,LAND,z1),P(W/2-.06,LAND+RUN,z1),K.stairWall);S.quad(P(W/2+.06,LAND,z0),P(W/2+.06,LAND+RUN,z0),P(W/2+.06,LAND+RUN,z1),P(W/2+.06,LAND,z1),K.stairWall);
    S.quad(P(W/2-.06,LAND,z0),P(W/2+.06,LAND,z0),P(W/2+.06,LAND,z1),P(W/2-.06,LAND,z1),K.plain);S.quad(P(W/2+.06,LAND+RUN,z0),P(W/2-.06,LAND+RUN,z0),P(W/2-.06,LAND+RUN,z1),P(W/2+.06,LAND+RUN,z1),K.plain);
    // lintel over the open side (both faces) and the wall ends
    const lt=Math.min(z1,lz+2.4);if(z1>lt+.02){S.quad(P(-Tk,0,lt),P(W+Tk,0,lt),P(W+Tk,0,z1),P(-Tk,0,z1),K.plain);S.quad(P(W+Tk,.02,lt),P(-Tk,.02,lt),P(-Tk,.02,z1),P(W+Tk,.02,z1),K.plain);S.quad(P(-Tk,.02,lt),P(W+Tk,.02,lt),P(W+Tk,0,lt),P(-Tk,0,lt),K.plain);}
    S.quad(P(-Tk,0,z0),P(Tk,0,z0),P(Tk,0,z1),P(-Tk,0,z1),K.plain);S.quad(P(W-Tk,0,z0),P(W+Tk,0,z0),P(W+Tk,0,z1),P(W-Tk,0,z1),K.plain);
  }
  // stair house roof
  if(b.roofAccess){S.at(F);S.slab([P(-Tk,-Tk,0),P(W+Tk,-Tk,0),P(W+Tk,L+Tk,0),P(-Tk,L+Tk,0)].map(p=>[p[0],p[1]]),[],coreTop,K.concrete,true);S.slab([P(0,0,0),P(W,0,0),P(W,L,0),P(0,L,0)].map(p=>[p[0],p[1]]),[],coreTop-.01,K.ceil,false);}
  // flights, landings, soffits, handrails
  for(let k=0;k<stairs.length;k++){S.at(k);const{z0,R}=stairs[k],half=R/2,n=Math.max(6,Math.round(half/.175)),rs=half/n,tr=RUN/n,uA0=.02,uA1=W/2-.07,uB0=W/2+.07,uB1=W-.02;
    for(let i=0;i<n;i++){const va=LAND+i*tr,vb=va+tr,za=z0+i*rs,zb=za+rs;
      S.quad(P(uA0,va,zb),P(uA1,va,zb),P(uA1,vb,zb),P(uA0,vb,zb),K.stone);S.quad(P(uA1,va,za),P(uA0,va,za),P(uA0,va,zb),P(uA1,va,zb),K.riser);
      const wb=LAND+RUN-i*tr,wa=wb-tr,zc=z0+half+i*rs,zd=zc+rs;S.quad(P(uB0,wa,zd),P(uB1,wa,zd),P(uB1,wb,zd),P(uB0,wb,zd),K.stone);S.quad(P(uB0,wb,zc),P(uB1,wb,zc),P(uB1,wb,zd),P(uB0,wb,zd),K.riser);}
    S.quad(P(uA0,LAND+RUN,z0+half-.22),P(uA1,LAND+RUN,z0+half-.22),P(uA1,LAND,z0-.22),P(uA0,LAND,z0-.22),K.concrete);
    S.quad(P(uB0,LAND,z0+R-.22),P(uB1,LAND,z0+R-.22),P(uB1,LAND+RUN,z0+half-.22),P(uB0,LAND+RUN,z0+half-.22),K.concrete);
    // far landing (with a ceiling light underneath)
    S.quad(P(0,LAND+RUN,z0+half),P(W,LAND+RUN,z0+half),P(W,L,z0+half),P(0,L,z0+half),K.stone);S.quad(P(0,L,z0+half-.2),P(W,L,z0+half-.2),P(W,LAND+RUN,z0+half-.2),P(0,LAND+RUN,z0+half-.2),K.ceil);
    S.quad(P(W*.3,LAND+RUN+LAND*.62,z0+half-.21),P(W*.7,LAND+RUN+LAND*.62,z0+half-.21),P(W*.7,LAND+RUN+LAND*.38,z0+half-.21),P(W*.3,LAND+RUN+LAND*.38,z0+half-.21),K.lamp);
    S.quad(P(W,LAND+RUN,z0+half-.2),P(0,LAND+RUN,z0+half-.2),P(0,LAND+RUN,z0+half),P(W,LAND+RUN,z0+half),K.concrete);
    // near landing of the storey above
    const zt=z0+R;S.quad(P(0,0,zt),P(W,0,zt),P(W,LAND,zt),P(0,LAND,zt),K.stone);S.quad(P(0,LAND,zt-SLAB),P(W,LAND,zt-SLAB),P(W,0,zt-SLAB),P(0,0,zt-SLAB),K.ceil);S.quad(P(0,LAND,zt-SLAB),P(0,LAND,zt),P(W,LAND,zt),P(W,LAND,zt-SLAB),K.concrete);
    // handrails on the central wall and the shaft walls
    for(const u of[W/2-.12,.1])S.beam(P(u,LAND,z0+.92),P(u,LAND+RUN,z0+half+.92),.05,.05,K.metal);
    for(const u of[W/2+.12,W-.1])S.beam(P(u,LAND+RUN,z0+half+.92),P(u,LAND,z0+R+.92),.05,.05,K.metal);}
  // guard rail across the top flight opening
  const zt=b.topWalk;S.at(b.roofAccess?F:F-1);S.beam(P(.05,LAND+.04,zt+1.0),P(W/2-.08,LAND+.04,zt+1.0),.05,.05,K.metal);S.beam(P(.05,LAND+.04,zt+.5),P(W/2-.08,LAND+.04,zt+.5),.03,.03,K.metal);
  for(const u of[.08,W/4,W/2-.1])S.beam(P(u,LAND+.04,zt),P(u,LAND+.04,zt+1.0),.04,.04,K.metal);
}

// Furniture and rooms. Upper storeys are divided by partition walls (across
// the building's long axis, each with a doorway) into rooms; every room gets
// a theme — living room, bedroom, kitchen/dining, or an office with desks —
// the lobby gets a reception and seating groups, the roof AC units.
// Everything placed is a collision circle; partitions are collision walls.
function scanLine(rings,ax,ay,a){const px=-ay,py=ax,cs=[];for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const p=r[j],q=r[i],pa=p[0]*ax+p[1]*ay,qa=q[0]*ax+q[1]*ay;if((pa-a)*(qa-a)<0){const t=(a-pa)/(qa-pa),pc=p[0]*px+p[1]*py,qc=q[0]*px+q[1]*py;cs.push(pc+(qc-pc)*t);}}cs.sort((m,n)=>m-n);const out=[];for(let i=0;i+1<cs.length;i+=2)out.push([cs[i],cs[i+1]]);return out;}
function placeProps(b,R){
  const{inner,innerHoles,levels,core,doors,axis}=b,ax=axis[0],ay=axis[1],px=-ay,py=ax,props=b.props,F=levels.length,W=(a,c)=>[ax*a+px*c,ay*a+py*c];
  b.partitions=[];b.gaps=[];
  const coreBlock=(x,y,m)=>{if(!core)return false;const rx=x-core.ox,ry=y-core.oy,u=rx*core.ux+ry*core.uy,v=rx*core.vx+ry*core.vy;return u>-m&&u<core.W+m&&v>-m-2.4&&v<core.L+m;};
  const nearWalls=(x,y,r,k)=>(b.partitions[k]||[]).some(w=>segDist(x,y,w.x0,w.y0,w.x1,w.y1)<r+.35)||(b.gaps[k]||[]).some(g=>Math.hypot(g.x-x,g.y-y)<r+1.0);
  const free=(x,y,r,k,clear=.55)=>pip(x,y,inner)&&!innerHoles.some(h=>pip(x,y,h))&&ringDist(x,y,inner)>=r+clear&&innerHoles.every(h=>ringDist(x,y,h)>=r+clear)&&!coreBlock(x,y,r+.4)&&!(k===0&&doors.some(d=>Math.hypot(d.cx-x,d.cy-y)<r+3.6))&&!nearWalls(x,y,r,k)&&!b.furniture.some(f=>f.k===k&&Math.hypot(f.x-x,f.y-y)<f.r+r+.6);
  const z=k=>k>=F?b.top:levels[k];
  const add=(type,x,y,k,yaw,tint=null,solid=true)=>{const def=PROP_DEFS[type];props.push({type,x,y,z:z(k),yaw,tint:tint??(def.tint?TINTS[(R()*TINTS.length)|0]:null),k});if(solid)b.furniture.push({x,y,r:def.r,k});};
  const fwd=yaw=>[Math.sin(yaw),-Math.cos(yaw)]; // where a prop's front points
  let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;for(const p of inner){const a=p[0]*ax+p[1]*ay,c=p[0]*px+p[1]*py;bx0=Math.min(bx0,a);bx1=Math.max(bx1,a);by0=Math.min(by0,c);by1=Math.max(by1,c);}
  const yaw0=Math.atan2(ay,ax),residential=b.params.seed>.45;let total=0;
  const rings=[inner,...innerHoles];
  for(let k=0;k<=F;k++){
    if(k===F&&!b.roofAccess)break;const roof=k===F,lobby=k===0,office=!lobby&&!roof&&(!residential||k%4===1);
    // partitions
    const cuts=[];b.partitions[k]=[];b.gaps[k]=[];
    if(!lobby&&!roof){const spacing=office?12.5:6.8;for(let a=bx0+spacing*(.8+R()*.4);a<bx1-spacing*.55;a+=spacing*(.85+R()*.3)){let used=false;
      for(const[c0,c1]of scanLine(rings,ax,ay,a)){if(c1-c0<2.6)continue;let hitCore=false;for(let c=c0;c<=c1;c+=.5){const p=W(a,c);if(coreBlock(p[0],p[1],1.4)){hitCore=true;break;}}if(hitCore)continue;
        const gw=1.1,gc=c0+.75+gw/2+R()*Math.max(0,c1-c0-1.5-gw),g0=gc-gw/2,g1=gc+gw/2,accent=R()<.35,P0=W(a,c0),P1=W(a,g0),P2=W(a,g1),P3=W(a,c1);
        if(g0-c0>.1)b.partitions[k].push({x0:P0[0],y0:P0[1],x1:P1[0],y1:P1[1],accent});if(c1-g1>.1)b.partitions[k].push({x0:P2[0],y0:P2[1],x1:P3[0],y1:P3[1],accent});
        const G=W(a,gc);b.gaps[k].push({x:G[0],y:G[1],dx:px,dy:py});used=true;}if(used)cuts.push(a);}}
    const roomOf=a=>{let i=0;for(const c of cuts)if(a>c)i++;return i;};
    const roomUse=new Map(),theme=room=>office?"office":["living","bed","kitchen"][(room+k+Math.floor(b.params.seed*9))%3];
    if(lobby){const c=[b.cx,b.cy];if(free(c[0],c[1],1.5,k))add("reception",c[0],c[1],k,yaw0+Math.PI*(R()<.5?0:1));}
    const step=roof?6.5:lobby?5.2:office?3.4:2.6,off=R()*step,grid=[];
    for(let a=bx0+off+1.0;a<bx1-.8;a+=step)for(let c=by0+off*.7+1.0;c<by1-.8;c+=step)grid.push([a,c]);
    for(let i=grid.length-1;i>0;i--){const j=(R()*(i+1))|0;[grid[i],grid[j]]=[grid[j],grid[i]];}
    const budget=Math.min(roof?6:70,Math.max(8,Math.round(b.area/(office?14:20))));let n=0;
    for(const[a,c]of grid.slice(0,700)){if(n>=budget||total>620)break;const[x,y]=W(a,c),r=R(),flip=R()<.5?0:Math.PI,yaw=yaw0+flip;
      if(roof){if(free(x,y,1.0,k,.9)){add("ac",x,y,k,yaw0);n++;}continue;}
      if(lobby){if(r<.45&&free(x,y,1.6,k)){add("lounge",x,y,k,yaw,null,false);const f=fwd(yaw);if(free(x-f[0]*1.35,y-f[1]*1.35,1.0,k,.2))add("sofa",x-f[0]*1.35,y-f[1]*1.35,k,yaw);for(const s2 of[-1,1]){const ex=x+f[0]*1.3+Math.cos(yaw)*s2*.6,ey=y+f[1]*1.3+Math.sin(yaw)*s2*.6;if(free(ex,ey,.5,k,.1))add("armchair",ex,ey,k,yaw+Math.PI+s2*.25);}b.furniture.push({x,y,r:.6,k});n++;total++;}
        else if(r<.7&&free(x,y,.4,k)){add("plant",x,y,k,R()*6);n++;}else if(r<.85&&free(x,y,.95,k)){add("bench",x,y,k,yaw);n++;}else if(free(x,y,.6,k)){add("table",x,y,k,0);for(const s2 of[0,1,2]){const aa=s2*2.1+R()*.4,ex=x+Math.cos(aa)*.9,ey=y+Math.sin(aa)*.9;if(free(ex,ey,.36,k,0))add("chair",ex,ey,k,Math.atan2(x-ex,-(y-ey)));}n++;}
        continue;}
      const room=roomOf(a),th=theme(room),used=roomUse.get(room)||{};const has=t=>(used[t]||0)>0;roomUse.set(room,used);let type=null;
      if(th==="office")type=r<.7?"desk":r<.8?"plant":r<.9?"shelf":"dining";
      else if(th==="living")type=!has("sofa")?"sofa":!has("shelf")&&r<.4?"shelf":r<.55?"lamp":r<.75?"plant":"armchair";
      else if(th==="bed")type=!has("bed")?"bed":r<.4?"lamp":r<.7?"plant":"armchair";
      else type=!has("dining")?"dining":r<.5?"plant":r<.7?"table":null;
      const LIMIT={plant:2,lamp:1,table:1,armchair:2,shelf:1,dining:1,sofa:1,bed:1,desk:99};if(!type||(used[type]||0)>=(LIMIT[type]??1))continue;const def=PROP_DEFS[type];if(!free(x,y,def.r,k))continue;
      if(type==="desk"){add("desk",x,y,k,yaw);const f=fwd(yaw);props.push({type:"chair",k,x:x+f[0]*.72,y:y+f[1]*.72,z:levels[k],yaw:yaw+Math.PI+(R()-.5)*.6});}
      else if(type==="sofa"){add("sofa",x,y,k,yaw);const f=fwd(yaw);if(free(x+f[0]*1.35,y+f[1]*1.35,.9,k,.15)){add("lounge",x+f[0]*1.35,y+f[1]*1.35,k,yaw,null,false);b.furniture.push({x:x+f[0]*1.35,y:y+f[1]*1.35,r:.55,k});}const ex=x+f[0]*1.4+Math.cos(yaw)*1.5,ey=y+f[1]*1.4+Math.sin(yaw)*1.5;if(free(ex,ey,.5,k,.1))add("armchair",ex,ey,k,yaw-Math.PI/2);}
      else if(type==="bed"){add("bed",x,y,k,yaw);const f=fwd(yaw),lx=x+Math.cos(yaw)*1.3-f[0]*.75,ly=y+Math.sin(yaw)*1.3-f[1]*.75;if(free(lx,ly,.25,k,.05))add("lamp",lx,ly,k,0);}
      else add(type,x,y,k,type==="plant"||type==="lamp"||type==="table"?R()*6:yaw);
      used[type]=(used[type]||0)+1;n++;total++;}
    // pictures on the partition walls (both faces)
    for(const w of b.partitions[k]){const dx=w.x1-w.x0,dy=w.y1-w.y0,l=Math.hypot(dx,dy);if(l<1.7)continue;const nx=-dy/l,ny=dx/l,mx=(w.x0+w.x1)/2,my=(w.y0+w.y1)/2;
      for(const sd of[-1,1]){if(R()<.3)continue;const x=mx+nx*sd*.08,y=my+ny*sd*.08;props.push({type:"art",k,x,y,z:levels[k],yaw:Math.atan2(nx*sd,-ny*sd),tint:TINTS[(R()*TINTS.length)|0]});}}
    // wall pieces: kitchen counters, shelves, plants along the outer walls
    if(!roof){for(let i=0;i<inner.length;i++){const A=inner[i],B=inner[(i+1)%inner.length],dx=B[0]-A[0],dy=B[1]-A[1],l=Math.hypot(dx,dy);if(l<4)continue;const ux=dx/l,uy=dy/l,nx=-uy,ny=ux;
      for(let t=1.8;t<l-1.8;t+=R()<.5?4.5:6.5){const x0=A[0]+ux*t,y0=A[1]+uy*t,room=roomOf(x0*ax+y0*ay),th=lobby?"lobby":theme(room),r=R();
        const type=th==="lobby"?(r<.55?"plant":null):th==="office"?(r<.45?"shelf":r<.7?"plant":null):th==="kitchen"?(r<.75?"counter":"plant"):th==="living"?(r<.45?"shelf":r<.7?"plant":null):(r<.4?"shelf":r<.6?"plant":null);if(!type)continue;
        const depth=type==="counter"?.32:type==="shelf"?.2:.35,x=x0+nx*(depth+.05),y=y0+ny*(depth+.05),def=PROP_DEFS[type];
        if(!pip(x,y,inner)||coreBlock(x,y,def.r+.3)||nearWalls(x,y,Math.min(def.r,.6),k)||(k===0&&doors.some(d=>Math.hypot(d.cx-x,d.cy-y)<3.6))||b.furniture.some(f=>f.k===k&&Math.hypot(f.x-x,f.y-y)<f.r+def.r+.3))continue;
        props.push({type,k,x,y,z:levels[k],yaw:Math.atan2(nx,-ny)});b.furniture.push({x,y,r:Math.min(def.r,.5),k});}}}
  }
}
// Furniture is drawn only for the storey the player is on and the ones
// directly above/below (the rest is hidden behind slabs anyway), so a
// 12-storey tower costs the same as a 3-storey house.
let shownLevel=-99,propsSeen=null;
function showPropLevels(level,seen){
  if(level===shownLevel&&seen===propsSeen)return;shownLevel=level;propsSeen=seen;
  const r=renderer();if(!r||!active)return;const F=active.levels.length;
  for(const[k,ids]of levelIds)for(const id of ids)r.setVisible?.(id,Math.abs(k-level)<=1||k===F);
  propGeos??=Object.fromEntries(Object.entries(PROP_DEFS).map(([k,d])=>[k,propGeometry(d.parts)]));
  const byType=new Map();for(const p of active.props){if(!seen||Math.abs(p.k-level)>1)continue;let l=byType.get(p.type);if(!l){l=[];byType.set(p.type,l);}l.push(p);}
  for(const t of new Set([...propTypes,...byType.keys()])){const list=byType.get(t)||[];
    const tints=new Float32Array(list.length*4);list.forEach((p,i)=>{const c=p.tint?hex(p.tint):[1,1,1];tints.set([c[0],c[1],c[2],1],i*4);});
    syncInstanced(r,`interiors/prop/${t}`,propGeos[t],list.length?packMatrices(list.map(p=>TRZ(p.x,p.y,p.z,p.yaw))):null,{tints,material:PROP_MATERIAL});}
  propTypes=[...byType.keys()];
}
function currentLevel(b,feet){let best=0,d=Infinity;const zs=[...b.levels];if(b.roofZ!=null)zs.push(b.roofZ);zs.forEach((z,i)=>{const e=Math.abs(z-feet);if(e<d){d=e;best=i;}});return best;}
function activate(fp){
  const r=renderer();if(!r)return false;
  const b=buildInterior(fp);if(!b)return false;disposeActive();active=b;
  for(const[k,parts]of b.shell){const ids=[];
    if(parts.lit){const id=`interiors/L${k}/lit`;r.upsert(id,{...parts.lit,material:{doubleSided:true,castShadow:false,roughness:.85,metalness:0,facadeMode:1}});ids.push(id);}
    if(parts.rev){const id=`interiors/L${k}/rev`;r.upsert(id,{...parts.rev,material:{doubleSided:false,castShadow:false,roughness:.9,metalness:0,facadeMode:1}});ids.push(id);}
    if(parts.glow){const id=`interiors/L${k}/glow`;r.upsert(id,{...parts.glow,material:{doubleSided:true,castShadow:false,unlit:true}});ids.push(id);}
    levelIds.set(k,ids);meshIds.push(...ids);}
  if(b.glassGeometry){r.upsert("interiors/glass",{...b.glassGeometry,material:{alphaMode:"blend",doubleSided:false,castShadow:false,roughness:.05,metalness:0,facadeMode:2}});meshIds.push("interiors/glass");}
  shownLevel=-99;showPropLevels(0,true);buildDoorRigs(b);
  // open doorways + roof hatch in the exterior (production facadeCutouts)
  const cuts=[];for(const d of b.doors){if(cuts.length>=MAX_FACADE_CUTOUTS)break;const t0=d.t-DOOR_W/2,t1=d.t+DOOR_W/2;cuts.push({a:[d.ax+d.dx*t0,d.ay+d.dy*t0,d.ax+d.dx*t1,d.ay+d.dy*t1],b:[b.base-2,b.levels[0]+DOOR_H,.85,0]});}
  if(b.roofAccess&&cuts.length<MAX_FACADE_CUTOUTS){const c=b.core;cuts.push({a:[c.ox,c.oy,c.vx,c.vy],b:[b.top-.4,b.top+.8,c.W,1+c.L]});}
  try{r.setFacadeCutouts?.(cuts);}catch{}
  setData("buildingInterior",`${b.levels.length}F${b.roofAccess?"+roof":""}/${b.props.length}p`);setData("buildingInteriorVersion",BUILDING_INTERIORS_VERSION);
  return true;
}

// ------------------------------------------------------------------ walking
function local(b,x,y){const c=b.core;if(!c)return null;const rx=x-c.ox,ry=y-c.oy;return{u:rx*c.ux+ry*c.uy,v:rx*c.vx+ry*c.vy};}
function ramp(u,v,R){const half=R/2;if(u<CORE_W/2){if(v<=LAND)return 0;if(v>=LAND+RUN)return half;return(v-LAND)/RUN*half;}if(v>=LAND+RUN)return half;if(v<=LAND)return R;return half+(LAND+RUN-v)/RUN*half;}
function surfaces(b,x,y){
  const out=[],l=local(b,x,y),inCore=l&&l.u>=0&&l.u<=CORE_W&&l.v>=0&&l.v<=CORE_L;
  if(!inCore||l.v<LAND){for(const z of b.levels)out.push(z);if(b.roofZ!=null)out.push(b.roofZ);}
  if(inCore)for(const s of b.stairs)out.push(s.z0+ramp(l.u,l.v,s.R));
  return out;
}
function bestSurface(b,x,y,feet){let best=null,d=Infinity;for(const z of surfaces(b,x,y)){const e=Math.abs(z-feet);if(e<d){d=e;best=z;}}return best;}
function region(b,x,y){if(!pip(x,y,b.outer)||b.holes.some(h=>pip(x,y,h)))return"out";if(pip(x,y,b.inner)&&!b.innerHoles.some(h=>pip(x,y,h)))return"in";return"wall";}
function inDoorTunnel(b,x,y){for(const d of b.doors){const rx=x-d.ax,ry=y-d.ay,t=rx*d.dx+ry*d.dy,o=-(rx*d.nx+ry*d.ny);if(Math.abs(t-d.t)<DOOR_W/2-R_PLAYER+.02&&o>-1&&o<WALL_IN+.6)return true;}return false;}
function nearDoor(b,x,y,m=2.8){return b.doors.some(d=>Math.hypot(x-d.cx,y-d.cy)<m);}
function collides(b,x,y,feet){
  const c=b.core;
  if(c){const l=local(b,x,y),z=feet,coreTop=b.roofAccess?b.top+ROOF_HOUSE:b.ceilOf(b.levels.length-1);if(z<coreTop&&l.u>-R_PLAYER-.08&&l.u<CORE_W+R_PLAYER+.08&&l.v>-R_PLAYER&&l.v<CORE_L+R_PLAYER+.08){
      const wall=(u0,v0,u1,v1)=>segDist(l.u,l.v,u0,v0,u1,v1)<R_PLAYER+.07;if(wall(0,0,0,CORE_L)||wall(CORE_W,0,CORE_W,CORE_L)||wall(0,CORE_L,CORE_W,CORE_L)||wall(CORE_W/2,LAND,CORE_W/2,LAND+RUN))return true;}}
  for(let k=0;k<(b.partitions||[]).length;k++){const lz=k>=b.levels.length?b.top:b.levels[k];if(Math.abs(lz-feet)>1)continue;for(const w of b.partitions[k])if(segDist(x,y,w.x0,w.y0,w.x1,w.y1)<R_PLAYER+.06)return true;}
  for(const f of b.furniture){const fz=f.k>=b.levels.length?b.top:b.levels[f.k];if(Math.abs(fz-feet)<1&&Math.hypot(f.x-x,f.y-y)<f.r+R_PLAYER*.6)return true;}
  return false;
}
function valid(b,x,y,feet){
  const reg=region(b,x,y),ground=feet<b.levels[0]+1.2;
  // outside next to a door the street level is whatever the terrain is there
  if(reg==="out")return nearDoor(b,x,y,3.4)?{z:null}:null;
  if(reg==="wall")return(ground||feet<b.levels[0]+STEP_MAX+2.5)&&inDoorTunnel(b,x,y)?{z:b.levels[0]}:null;
  // inside: keep off the inner walls (door openings excepted at street level)
  const dIn=ringDist(x,y,b.inner);if(dIn<R_PLAYER&&!(ground&&inDoorTunnel(b,x,y)))return null;if(b.innerHoles.some(h=>ringDist(x,y,h)<R_PLAYER))return null;
  const z=bestSurface(b,x,y,feet);if(z==null||Math.abs(z-feet)>STEP_MAX)return null;
  if(collides(b,x,y,z))return null;return{z};
}
function resolveMove(from,to,feet){
  const b=active;if(!b||!onFoot())return null;
  const rf=region(b,from.x,from.y),rt=region(b,to.x,to.y);
  if(rf==="out"&&rt==="out"&&!nearDoor(b,from.x,from.y)&&!nearDoor(b,to.x,to.y))return null;
  if(rf==="out"&&!nearDoor(b,from.x,from.y))return null;
  for(const p of[[to.x,to.y],[to.x,from.y],[from.x,to.y]]){const r=valid(b,p[0],p[1],feet);if(r){if(r.z===null&&region(b,p[0],p[1])==="out"&&!nearDoor(b,p[0],p[1],2.2))return null;return{x:p[0],y:p[1]};}}
  // Never a trap: if the player already stands somewhere invalid (terrain or
  // building changed under them, spawned into furniture, wrong storey) the
  // move is let through so they can walk out instead of being pinned forever.
  if(!valid(b,from.x,from.y,feet))return{x:to.x,y:to.y};
  return{x:from.x,y:from.y};
}
function feetHeightAt(x,y,feet){
  const b=active;if(!b||!onFoot())return null;const reg=region(b,x,y);if(reg==="out")return null;if(reg==="wall")return b.levels[0];
  return bestSurface(b,x,y,feet);
}

// ------------------------------------------------------------------ the native walk hook
// Called by NativeGameRuntime.moveActors for the foot body every 60 Hz step,
// before the Box3D walk target is set. Returns true when this module owns the
// step (inside / at the door of the active building): the foot body then does
// not collide with the static world, has no gravity, and its velocity carries
// it exactly to the resolveMove()/feetHeightAt() result in this step.
let engaged=false,savedFilters=null,fallVz=0;
function bodyRecord(rig){return rig?.records?.get?.("player-foot")||null;}
function setEngaged(rig,on){
  if(on===engaged)return;engaged=on;const rec=bodyRecord(rig),b3=rig?.b3;fallVz=0;
  if(rec&&b3&&typeof b3.b3Shape_GetFilter==="function"&&typeof b3.b3Shape_SetFilter==="function"){
    if(on){savedFilters=[];for(const sh of[rec.shape,...(rec.extraShapes||[])]){if(!sh)continue;const f=b3.b3Shape_GetFilter(sh);if(!f)continue;savedFilters.push([sh,f]);
        const big=typeof f.maskBits==="bigint",mask=big?f.maskBits&~TERRAIN_CATEGORY:Number(f.maskBits)&~Number(TERRAIN_CATEGORY);b3.b3Shape_SetFilter(sh,{...f,maskBits:mask},false);}}
    else{for(const[sh,f]of savedFilters||[]){try{b3.b3Shape_SetFilter(sh,f,false);}catch{}}savedFilters=null;}}
  try{rig?.setGravityScale?.("player-foot",on?0:(rec?.gravityScale>0?rec.gravityScale:1));}catch{}
  if(!on){try{if(rec?.body&&b3){b3.b3Body_SetGravityScale?.(rec.body,1);rec.gravityScale=1;}}catch{}}
  setData("buildingInteriorWalk",on?"engaged":"physics");
}
function footStep(runtime,pose,vel,dt){
  if(runtime&&runtime!==game)return false;const rig=game?.rigids;
  if(!active||!onFoot()||!pose?.position||globalThis.__arondightPlayerDamageModel?.dead||!(dt>0)){setEngaged(rig,false);return false;}
  const p=pose.position,feet=p[2]-FOOT_CENTRE,from={x:p[0],y:p[1]},to={x:p[0]+(Number(vel?.[0])||0)*dt,y:p[1]+(Number(vel?.[1])||0)*dt};
  const r=resolveMove(from,to,feet);
  if(!r){setEngaged(rig,false);return false;}
  let z=feetHeightAt(r.x,r.y,feet);if(!Number.isFinite(z))z=terrainAt(r.x,r.y);
  // ledge: fall (production walk controller LEDGE_DROP) instead of teleporting down
  let nf=z;if(feet-z>STEP_MAX+.05){fallVz=Math.max(-30,fallVz-9.80665*dt);nf=Math.max(z,feet+fallVz*dt);}else fallVz=0;
  setEngaged(rig,true);rig.clearTarget?.("player-foot");
  const rec=bodyRecord(rig),b3=rig?.b3,v=[(r.x-p[0])/dt,(r.y-p[1])/dt,(nf+FOOT_CENTRE-p[2])/dt];
  if(rec?.body&&b3?.b3Body_SetLinearVelocity){b3.b3Body_SetLinearVelocity(rec.body,v);b3.b3Body_SetAngularVelocity?.(rec.body,[0,0,0]);b3.b3Body_SetAwake?.(rec.body,true);}
  else rig?.setPose?.("player-foot",{position:[r.x,r.y,nf+FOOT_CENTRE]});
  return true;
}

// ------------------------------------------------------------------ closed doors on nearby buildings
const doorCache=new Map();let doorsDrawn=false;
function updateDoors(player){
  const r=renderer();if(!r)return;doorGeometries();
  const near=[];for(const fp of footprints){const c=fp.center||fp.outer?.[0];if(!c)continue;const d=Math.hypot(c[0]-player.x,c[1]-player.y);if(d<DOORS_RADIUS_M+40)near.push([d,fp]);}near.sort((a,b)=>a[0]-b[0]);
  const frames=[],leaves=[];
  for(const[,fp]of near){if(frames.length>=MAX_CLOSED_DOORS*2-2)break;const key=String(fp.key);if((Number(fp.base)||0)>.6)continue;
    let doors=doorCache.get(key);if(!doors){let outer=cleanRing(fp.outer);if(outer.length<3){doorCache.set(key,[]);continue;}if(area2(outer)<0)outer.reverse();const area=Math.abs(area2(outer));doors=area>=24&&area<=40000?doorsFor(outer,area):[];doors.elev=buildingGroundBase(outer);doorCache.set(key,doors);if(doorCache.size>3000)doorCache.delete(doorCache.keys().next().value);}
    const isActive=active?.key===key;
    for(const d of doors){const m=TRZ(d.cx,d.cy,(Number(fp.base)||0)+(doors.elev||0)+.03,Math.atan2(d.dy,d.dx)+Math.PI);frames.push(m);if(!isActive)leaves.push(m);}}
  syncInstanced(r,"interiors/door-frames",doorGeo,frames.length?packMatrices(frames):null,{material:{roughness:.45,metalness:.35,castShadow:false}});
  syncInstanced(r,"interiors/door-leaves",leafGeo,leaves.length?packMatrices(leaves):null,{material:{roughness:.45,metalness:.35,castShadow:false}});
  doorsDrawn=frames.length>0;
}
function hideDoors(){if(!doorsDrawn)return;const r=renderer();syncInstanced(r,"interiors/door-frames",doorGeo,null);syncInstanced(r,"interiors/door-leaves",leafGeo,null);doorsDrawn=false;}

// ------------------------------------------------------------------ driver
let lastTick=-Infinity,lastDoors=-Infinity,lastFrame=-Infinity,pinUntil=-Infinity;
function polyDistance(fp,x,y){const r=fp.outer||[];if(r.length<3)return Infinity;return pip(x,y,r)?0:ringDist(x,y,r);}
function select(now){
  if(now-lastTick<250)return;lastTick=now;
  if(!onFoot()){if(active)disposeActive();hideDoors();return;}
  const p=playerFeet();if(!p)return;
  if(now-lastDoors>900){lastDoors=now;try{updateDoors(p);}catch(e){console.warn("doors",e);}}
  const inActive=active&&region(active,p.x,p.y)!=="out";
  if(active){showPropLevels(inActive?currentLevel(active,p.z):0,Boolean(inActive||nearDoor(active,p.x,p.y,18)));}
  if(inActive||(active&&now<pinUntil))return;
  // stay with the current building while standing at its door / along its walls
  if(active&&polyDistance({outer:active.outer},p.x,p.y)<7)return;
  let best=null,bd=Infinity;for(const fp of footprints){const c=fp.center||fp.outer?.[0];if(!c||Math.hypot(c[0]-p.x,c[1]-p.y)>ACTIVATE_M+160)continue;const d=polyDistance(fp,p.x,p.y);if(d<bd){bd=d;best=fp;}}
  if(!best||bd>ACTIVATE_M){if(active&&polyDistance({outer:active.outer},p.x,p.y)>ACTIVATE_M+12)disposeActive();return;}
  if(active?.key===String(best.key))return;
  if(active&&polyDistance({outer:active.outer},p.x,p.y)<bd-2)return;
  try{if(activate(best))lastDoors=-Infinity;}catch(e){console.warn("interior",e);disposeActive();}
}
export function tickNativeBuildingInteriors(now=performance.now()){
  if(!game)return;const dt=Number.isFinite(lastFrame)?Math.min(.1,Math.max(0,(now-lastFrame)/1000)):0;lastFrame=now;
  try{select(now);}catch(e){console.warn("interiors",e);}
  stepDoors(dt);
  try{drawDoorRigs();}catch(e){console.warn("door rigs",e);}
  // a warm ceiling light over the player indoors (the production ceiling panels light the rooms)
  if(active&&engaged){const p=playerFeet();if(p&&region(active,p.x,p.y)==="in"){const k=currentLevel(active,p.z),ceil=k<active.levels.length?active.ceilOf(k):active.top+3;try{game.world?.requestLight?.([p.x,p.y,ceil-.3],{color:0xffe7c4,intensity:9,distance:11});}catch{}}}
}
// Diagnostics/teleport helper: put the player at the door, inside, on the stairs, upstairs or on the roof.
function placePlayer(where="door"){
  const b=active,rig=game?.rigids;if(!rig||!b)return null;const d=b.doors[0];let x=d.cx+d.nx*4,y=d.cy+d.ny*4,z=b.levels[0],yaw=Math.atan2(-d.nx,-d.ny);
  if(where==="door")z=terrainAt(x,y);
  if(where==="inside"){x=d.cx-d.nx*3.2;y=d.cy-d.ny*3.2;}
  if(b.core&&(where==="stairs"||where==="upper"||where==="roof")){const c=b.core,P=(u,v)=>c.P(u,v);let u=CORE_W*.25,v=LAND+RUN*.4,k=0;if(where==="upper"){k=Math.min(2,b.levels.length-1);u=CORE_W/2;v=-2.2;}if(where==="roof"&&b.roofAccess){u=CORE_W/2;v=-2.6;}
    const p=P(u,v);x=p[0];y=p[1];z=where==="roof"&&b.roofAccess?b.top:where==="upper"?b.levels[k]:b.stairs[0].z0+ramp(u,v,b.stairs[0].R);yaw=Math.atan2(where==="stairs"?c.vx:-c.vx,where==="stairs"?c.vy:-c.vy);}
  pinUntil=performance.now()+20000;
  // runtime yaw 0 looks along +y, x to the right (sin(yaw), cos(yaw))
  rig.setPose("player-foot",{position:[x,y,z+FOOT_CENTRE]});globalThis.__arondightWalkMode?.setPose?.({yaw,pitch:where==="roof"?-.15:-.05});
  return{x,y,z,where,levels:b.levels.length,roof:b.roofAccess};
}
// Diagnostics: activate the nearest enterable building regardless of distance
// (prefers multi-storey ones with a stairwell).
function activateNearest(){
  const p=playerFeet();if(!p)return null;
  const ranked=footprints.map(fp=>[polyDistance(fp,p.x,p.y),fp]).filter(([d])=>Number.isFinite(d)).sort((a,c)=>a[0]-c[0]).slice(0,40);
  for(const pass of[0,1])for(const[,fp]of ranked){const top=Number(fp.top)||0,base=Number(fp.base)||0,ar=Math.abs(area2(cleanRing(fp.outer)));if(pass===0&&(top-base<12||ar<150||ar>4000))continue;try{if(activate(fp)&&(pass===1||active.core)){lastDoors=-Infinity;return globalThis.__buildingInteriors.active;}}catch(e){console.warn(e);}}
  return null;
}
let elevationHooked=false;
// Install on the engine (prepareEngine) and again with each loaded OSM world.
export function installNativeBuildingInteriors(runtime,snapshot=null){
  if(runtime)game=runtime;
  if(snapshot?.origin&&Array.isArray(snapshot.buildings)){
    try{const{project}=nativeOsmProjector(snapshot.origin);footprints=buildingFootprintsFromFeatures(snapshot.buildings,{project,center:Array.isArray(snapshot.center)?snapshot.center:[0,0],radiusM:1250,maxFootprints:2600});}
    catch(e){console.warn("interiors footprints",e);footprints=[];}
    doorCache.clear();if(active)disposeActive();lastDoors=-Infinity;lastTick=-Infinity;
  }
  if(!elevationHooked){elevationHooked=true;try{onElevationChange(()=>{doorCache.clear();if(active)disposeActive();lastDoors=-Infinity;});}catch{}}
  globalThis.__buildingInteriors={version:BUILDING_INTERIORS_VERSION,resolveMove,feetHeightAt,footStep,placePlayer,activateNearest,doors:doorInfo,damagePlank,repairPlank,playerInside,insideActive,PLANKS,
    get engaged(){return engaged;},get footprints(){return footprints.length;},get _debug(){return active;},
    get active(){return active?{key:active.key,levels:active.levels.length,roof:active.roofAccess,props:active.props.length,core:Boolean(active.core)}:null;}};
  return{footprints:footprints.length};
}
// test hooks
export const __test={setFootprints(list){footprints=list;},activate,disposeActive,select,region,setActive(b){active=b;},get active(){return active;}};
