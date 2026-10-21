// Single WebGL2 sky pass: no dome meshes, fake city geometry, extra context,
// texture/network requests, or per-frame allocations. It draws into the same
// native depth framebuffer behind real Box3D-derived terrain and OSM meshes.
//
// The colour model is the production sky from stylized_world_style.mjs
// (SKY_FRAG, "realistic-pbr-sun-ibl-v4"): Rayleigh-like gradient, sun disc
// and Mie glow, golden-hour band, moon and stars at night and the drifting
// 5-octave fBm cloud layer. Production renders it through Three's
// ACESFilmicToneMapping (exposure 1.05) into an sRGB canvas, so the same
// tone map and sRGB encode are applied here. Each pixel gets its real view
// ray from the native camera basis (eye, target, Z-up, fov, aspect).
export const NATIVE_SKY_PASS_VERSION="native-webgl2-production-sky-v2";
export const NATIVE_SKY_WIND=Object.freeze([.012,.004]);
const VERT=`#version 300 es
precision highp float;
uniform vec3 uForward,uRight,uUp;
uniform vec2 uTanHalf;
out vec3 vDir;
void main() {
 vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
 vec2 ndc=p*2.0-1.0;
 vDir=uForward+ndc.x*uTanHalf.x*uRight+ndc.y*uTanHalf.y*uUp;
 gl_Position=vec4(ndc,1.0,1.0);
}`;
const FRAG=`#version 300 es
precision highp float;
in vec3 vDir;
uniform float uNight,uSunUp,uTime,uClouds,uExposure,uBlastAge;
uniform vec3 uSun,uMoon,uBlastDir;
uniform vec2 uWind;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outHdr;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.0;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+vec2(17.1,9.3);a*=.5;}return s;}
vec3 rrtOdt(vec3 v){vec3 a=v*(v+0.0245786)-0.000090537;vec3 b=v*(0.983729*v+0.4329510)+0.238081;return a/b;}
vec3 acesFilmic(vec3 c){
 const mat3 inM=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
 const mat3 outM=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
 c*=uExposure/0.6;c=inM*c;c=rrtOdt(c);c=outM*c;return clamp(c,0.0,1.0);
}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec3 d=normalize(vDir);float h=max(d.z,0.0);vec3 s=normalize(uSun);float mu=max(dot(d,s),0.0);
 // day -> golden hour -> moonlit night (never pitch black)
 float dusk=clamp(1.0-abs(s.z)*4.0,0.0,1.0)*(1.0-uNight*0.6);
 vec3 zen=mix(vec3(0.05,0.2,0.62),vec3(0.012,0.022,0.06),uNight),hor=mix(vec3(0.52,0.66,0.86),vec3(0.05,0.075,0.13),uNight);
 hor=mix(hor,vec3(0.95,0.48,0.22),dusk*0.55);zen=mix(zen,vec3(0.16,0.14,0.32),dusk*0.35);
 vec3 col=mix(hor,zen,pow(h,0.45));
 col+=vec3(1.0,0.62,0.32)*pow(1.0-h,5.0)*(0.18+0.5*dusk)*(0.5+0.5*dot(normalize(d.xy+1e-4),normalize(s.xy+1e-4)))*uSunUp;
 col+=(vec3(1.0,0.93,0.8)*(pow(mu,8.0)*0.22+pow(mu,64.0)*0.5)+vec3(1.0,0.97,0.9)*smoothstep(0.9993,0.99975,mu)*12.0)*uSunUp;
 if(uNight>0.01){vec3 m=normalize(uMoon);float mm=max(dot(d,m),0.0);
  col+=uNight*(vec3(0.55,0.65,0.9)*pow(mm,24.0)*0.12+vec3(0.9,0.94,1.0)*smoothstep(0.99955,0.9998,mm)*3.2);
  vec2 sp=vec2(atan(d.y,d.x)*90.0,asin(clamp(d.z,0.0,1.0))*120.0);vec2 cell=floor(sp);float r=h21(cell);
  float star=step(0.985,r)*smoothstep(0.5,0.0,length(fract(sp)-0.5))*(0.6+0.4*sin(uTime*2.0+r*40.0));
  col+=uNight*vec3(0.9,0.95,1.0)*star*smoothstep(0.05,0.3,d.z)*0.9;}
 if(uClouds>0.5&&d.z>0.02){
  vec2 uv=d.xy/(d.z+0.12)*1.6+uWind*uTime;
  if(uBlastAge>0.0){vec3 b=normalize(uBlastDir);float ang=acos(clamp(dot(normalize(vec3(d.xy,0.0)),normalize(vec3(b.xy,0.0))),-1.0,1.0));float push=uBlastAge*0.35*exp(-ang*1.4);uv+=normalize(d.xy-b.xy+1e-4)*push;}
  float c=fbm(uv*1.3);float cov=smoothstep(0.52,0.78,c)*smoothstep(0.02,0.25,d.z);
  float lit=0.75+0.35*fbm(uv*1.3+s.xy*0.08)-0.25*smoothstep(0.6,0.95,c);
  vec3 cc=mix(vec3(0.62,0.66,0.72),vec3(1.0,0.98,0.95),lit)+vec3(1.0,0.85,0.6)*pow(mu,6.0)*0.4*uSunUp;
  cc=mix(cc,mix(vec3(0.03,0.04,0.07),vec3(0.16,0.18,0.24),lit),uNight);cc=mix(cc,cc*vec3(1.1,0.75,0.6),dusk*0.6);
  col=mix(col,cc,cov*0.92);
 }
 col=mix(col,hor*0.92,smoothstep(0.0,-0.2,d.z));
 outHdr=vec4(max(col,vec3(0.0)),1.0);
 outColor=vec4(srgb(acesFilmic(col)),1.0);
}`;
const UNIFORMS=["uForward","uRight","uUp","uTanHalf","uNight","uSunUp","uTime","uClouds","uExposure","uBlastAge","uSun","uMoon","uBlastDir","uWind"];
const norm=v=>{const l=Math.hypot(v[0],v[1],v[2]);return l>1e-9?[v[0]/l,v[1]/l,v[2]/l]:null;};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Camera basis used for the per-pixel view ray. Exported for tests.
export function nativeSkyBasis({eye,target,up=[0,0,1]}){
 const forward=norm([target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]]);
 if(!forward)throw Error("sky requires a non-degenerate native camera");
 let right=norm(cross(forward,up));
 if(!right)right=norm(cross(forward,[0,1,0]))||[1,0,0];
 return {forward,right,up:cross(right,forward)};
}
export class NativeSkyPass{
 constructor(gl){
  if(!gl?.createProgram)throw Error("native sky requires existing WebGL2 context");
  this.gl=gl;
  const compile=(type,src)=>{
   const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);
    throw Error("native sky shader: "+error);
   }
   return shader;
  };
  const vertex=compile(gl.VERTEX_SHADER,VERT),fragment=compile(gl.FRAGMENT_SHADER,FRAG);
  const program=gl.createProgram();
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
   const error=gl.getProgramInfoLog(program);gl.deleteProgram(program);
   throw Error("native sky link: "+error);
  }
  this.program=program;this.vao=gl.createVertexArray();
  this.u={};for(const name of UNIFORMS)this.u[name]=gl.getUniformLocation(program,name);
  this.clouds=true;this.blastDir=[0,0,-1];this.blastAge=-1;
  this.disposed=false;
 }
 // Production sky state. sun: key-light direction; night 0..1; time in s.
 draw({eye,target,up=[0,0,1],fov,aspect=1,sun=[-.45,-.52,.72],moon=[.4,.5,.76],night=0,time=performance.now()/1000,exposure=1.05}){
  if(this.disposed)throw Error("native sky pass disposed");
  const gl=this.gl,u=this.u;
  if(!eye?.length||!target?.length||!(fov>0))throw Error("sky requires original native camera");
  const basis=nativeSkyBasis({eye,target,up}),t=Math.tan(fov/2);
  const sunN=norm(sun)||[-.45,-.52,.72],nightV=Math.min(1,Math.max(0,Number(night)||0));
  gl.depthMask(false);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);
  gl.uniform3f(u.uForward,...basis.forward);gl.uniform3f(u.uRight,...basis.right);gl.uniform3f(u.uUp,...basis.up);
  gl.uniform2f(u.uTanHalf,t*(aspect>0?aspect:1),t);
  gl.uniform1f(u.uNight,nightV);gl.uniform1f(u.uSunUp,sunN[2]>-.05?1:0);
  gl.uniform1f(u.uTime,time%3600);gl.uniform1f(u.uClouds,this.clouds?1:0);
  gl.uniform1f(u.uExposure,exposure);gl.uniform1f(u.uBlastAge,this.blastAge);
  gl.uniform3f(u.uSun,...sunN);gl.uniform3f(u.uMoon,...(norm(moon)||[.4,.5,.76]));gl.uniform3f(u.uBlastDir,...this.blastDir);
  gl.uniform2f(u.uWind,...NATIVE_SKY_WIND);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindVertexArray(null);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
 }
 dispose({contextLost=false}={}){
  if(this.disposed)return;this.disposed=true;
  if(!contextLost){this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
 }
}
