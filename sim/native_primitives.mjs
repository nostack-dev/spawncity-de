// Three.js primitive geometries (Box / Cylinder / Cone / Sphere / Capsule)
// baked into native vertex buffers, with the Three axis conventions
// (cylinder, cone and capsule along +Y). Matrices are column-major 4x4
// arrays. Used by the native ports that rebuild production models from the
// same primitives (race gates, tow truck, flak gun). Same code as the
// primitives in native_military.mjs.
export const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
export function G(){return {p:[],n:[],c:[]};}
function push(b,v,n,c){b.p.push(...v);b.n.push(...n);b.c.push(...c);}
function xf(m,v){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
function xn(m,n){const v=[m[0]*n[0]+m[4]*n[1]+m[8]*n[2],m[1]*n[0]+m[5]*n[1]+m[9]*n[2],m[2]*n[0]+m[6]*n[1]+m[10]*n[2]],l=Math.hypot(...v)||1;return v.map(a=>a/l);}
export function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
export const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],S=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
export const RX=a=>{const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];};
export const RY=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
export const RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
// Three Euler XYZ (object.rotation.set(x,y,z)) as a matrix: Rx*Ry*Rz applied as R=Rx·Ry·Rz
export const EULER=(x,y,z)=>mul(RX(x),mul(RY(y),RZ(z)));
export function quatMatrix(q){const [x,y,z,w]=q||[0,0,0,1];return [1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,0,0,0,1];}
export function addMesh(b,mesh,m,col){for(let i=0;i<mesh.v.length;i++)push(b,xf(m,mesh.v[i]),xn(m,mesh.n[i]),col);}
export function finish(b){return {positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)};}
export function boxP(sx,sy,sz){const h=[sx/2,sy/2,sz/2],v=[],n=[],F=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]]],[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,1,-1],[-1,-1,-1],[-1,-1,1],[-1,1,1]]],[[0,1,0],[[1,1,-1],[-1,1,-1],[-1,1,1],[1,1,1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]];
  for(const [nn,q] of F){const vv=q.map(k=>[k[0]*h[0],k[1]*h[1],k[2]*h[2]]);for(const i of [0,1,2,0,2,3]){v.push(vv[i]);n.push(nn);}}return {v,n};}
export function cylP(rt,rb,h,seg){const v=[],n=[];for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1),sl=(rb-rt)/h;
  const A=[c0*rb,-h/2,s0*rb],B=[c1*rb,-h/2,s1*rb],C=[c1*rt,h/2,s1*rt],D=[c0*rt,h/2,s0*rt],n0=[c0,sl,s0],n1=[c1,sl,s1];
  for(const [p,q] of [[A,n0],[C,n1],[B,n1],[A,n0],[D,n0],[C,n1]]){v.push(p);n.push(q);}
  for(const [p,q] of [[[0,h/2,0],[0,1,0]],[C,[0,1,0]],[D,[0,1,0]],[[0,-h/2,0],[0,-1,0]],[A,[0,-1,0]],[B,[0,-1,0]]]){v.push(p);n.push(q);}}return {v,n};}
export const coneP=(r,h,seg)=>cylP(0,r,h,seg);
export function sphP(r,ws,hs){const v=[],n=[],P=(i,j)=>{const th=j/hs*Math.PI,ph=i/ws*Math.PI*2,q=[Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph)];return [q.map(a=>a*r),q];};
  for(let j=0;j<hs;j++)for(let i=0;i<ws;i++){const a=P(i,j),b=P(i+1,j),c=P(i+1,j+1),d=P(i,j+1);for(const [p,q] of [a,c,b,a,d,c]){v.push(p);n.push(q);}}return {v,n};}
export function capP(r,len,seg){const c=cylP(r,r,len,seg),top=sphP(r,seg,6);for(let i=0;i<top.v.length;i++){const p=top.v[i];c.v.push([p[0],p[1]+(p[1]>=0?len/2:-len/2),p[2]]);c.n.push(top.n[i]);}return c;}
export const geometry=(fn)=>{const b=G();fn(b);return finish(b);};
