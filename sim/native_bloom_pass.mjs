// Production neon_bloom.mjs on the native WebGL2 renderer.
// Production renders the scene into a linear half-float target, extracts the
// bright parts (threshold .88, soft knee .35) at quarter resolution, blurs two
// levels (1/4 and 1/8) with the same 9-tap kernel and adds them back (.13 and
// .08) before the tone map + grade. The native scene shader already writes the
// graded sRGB picture, so it writes its linear pre-tone-map colour to a second
// attachment as well; the combine pass adds
//   grade(hdr + bloom) - grade(hdr)
// to the finished picture: the exact production glow, the scene untouched.
// Same frame-time guard: if the device cannot keep up (avg > 27 ms for 3.5 s)
// the glow switches off for the session, the output path stays the same.
export const NATIVE_BLOOM_VERSION="native-quarter-res-two-level-bloom-v3";
const DISABLE_FRAME_MS=27,DISABLE_AFTER_MS=3500,STRENGTH_NEAR=.13,STRENGTH_WIDE=.08,THRESHOLD=.88;
const VS=`#version 300 es
out vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const HEAD=`#version 300 es
precision highp float;in vec2 vUv;out vec4 o;`;
const BRIGHT=HEAD+`uniform sampler2D tSrc;uniform float uThreshold;void main(){vec3 c=max(texture(tSrc,vUv).rgb,0.0);float m=max(c.r,max(c.g,c.b));o=vec4(c*smoothstep(uThreshold,uThreshold+.35,m),1.0);}`;
const BLUR=HEAD+`uniform sampler2D tSrc;uniform vec2 uDir;void main(){vec3 c=texture(tSrc,vUv).rgb*.2270;c+=texture(tSrc,vUv+uDir*1.3846).rgb*.3162;c+=texture(tSrc,vUv-uDir*1.3846).rgb*.3162;c+=texture(tSrc,vUv+uDir*3.2308).rgb*.0703;c+=texture(tSrc,vUv-uDir*3.2308).rgb*.0703;o=vec4(c,1.0);}`;
const COPY=HEAD+`uniform sampler2D tSrc;void main(){o=vec4(texture(tSrc,vUv).rgb,1.0);}`;
const COMBINE=HEAD+`uniform sampler2D tScene,tHdr,tB1,tB2;uniform float uS1,uS2,uExposure;
vec3 linearToSrgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));}
vec3 rrtOdt(vec3 v){vec3 a=v*(v+0.0245786)-0.000090537;vec3 b=v*(0.983729*v+0.4329510)+0.238081;return a/b;}
vec3 acesFilmic(vec3 c){const mat3 inM=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
 const mat3 outM=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
 c*=uExposure/0.6;c=inM*c;c=rrtOdt(c);c=outM*c;return clamp(c,0.0,1.0);}
vec3 grade(vec3 rgb){rgb=acesFilmic(rgb);float luma=dot(rgb,vec3(0.2126,0.7152,0.0722));rgb=mix(vec3(luma),rgb,1.14);rgb=mix(rgb,rgb*rgb*(3.0-2.0*rgb),0.22);
 rgb+=vec3(0.016,0.006,-0.014)*smoothstep(0.35,1.0,luma)+vec3(-0.006,0.0,0.012)*(1.0-smoothstep(0.0,0.3,luma));return linearToSrgb(clamp(rgb,0.0,1.0));}
void main(){vec3 scene=texture(tScene,vUv).rgb;vec3 b=texture(tB1,vUv).rgb*uS1+texture(tB2,vUv).rgb*uS2;
 if(max(b.r,max(b.g,b.b))<1e-4){o=vec4(scene,1.0);return;}
 vec3 h=max(texture(tHdr,vUv).rgb,0.0);o=vec4(clamp(scene+grade(h+b)-grade(h),0.0,1.0),1.0);}`;
function compile(gl,vs,fs){
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error("bloom shader: "+gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error("bloom link: "+gl.getProgramInfoLog(p));
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const info=gl.getActiveUniform(p,i);u[info.name]=gl.getUniformLocation(p,info.name);}
  return {p,u};
}
export class NativeBloomPass{
  constructor(gl){this.gl=gl;this.enabled=true;this.bloomOn=true;this.frameAvg=16;this.lastFrameAt=0;this.slowSince=0;this.w=0;this.h=0;this.res=null;
    try{const q=new URLSearchParams(location.search).get("bloom");if(q==="0")this.enabled=false;if(q==="1")this.forced=true;}catch{}}
  init(){
    const gl=this.gl;if(!gl.getExtension("EXT_color_buffer_float")&&!gl.getExtension("EXT_color_buffer_half_float")){this.enabled=false;return false;}
    this.prog={bright:compile(gl,VS,BRIGHT),blur:compile(gl,VS,BLUR),copy:compile(gl,VS,COPY),combine:compile(gl,VS,COMBINE)};
    this.vao=gl.createVertexArray();this.res={};return true;
  }
  tex(w,h,internal,format,type){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  target(w,h,hdr){const gl=this.gl,t=this.tex(w,h,hdr?gl.RGBA16F:gl.RGBA8,gl.RGBA,hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE),f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return {t,f,w,h};}
  free(){const gl=this.gl,r=this.res;if(!r)return;for(const k of Object.keys(r)){const x=r[k];if(x?.t)gl.deleteTexture(x.t);if(x?.f)gl.deleteFramebuffer(x.f);if(x?.depth)gl.deleteRenderbuffer(x.depth);if(x?.hdr)gl.deleteTexture(x.hdr);}this.res={};}
  resize(w,h){
    const gl=this.gl;if(this.w===w&&this.h===h&&this.res?.main)return;this.free();this.w=w;this.h=h;
    const main=this.target(w,h,false);main.hdr=this.tex(w,h,gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT);gl.bindFramebuffer(gl.FRAMEBUFFER,main.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,main.hdr,0);
    main.depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,main.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,main.depth);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.free();this.enabled=false;return;}
    const q=[Math.max(1,w>>2),Math.max(1,h>>2)],e=[Math.max(1,w>>3),Math.max(1,h>>3)];
    this.res={main,a1:this.target(...q,true),b1:this.target(...q,true),a2:this.target(...e,true),b2:this.target(...e,true)};
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  track(now){
    if(this.lastFrameAt){const dt=now-this.lastFrameAt;if(dt<200)this.frameAvg+=(dt-this.frameAvg)*.05;}this.lastFrameAt=now;
    if(globalThis.document?.hidden){this.slowSince=0;return;}
    if(this.frameAvg>DISABLE_FRAME_MS&&!this.forced){this.slowSince||=now;if(now-this.slowSince>DISABLE_AFTER_MS&&this.bloomOn){this.bloomOn=false;const v=globalThis.document?.getElementById?.("viewport");if(v)v.dataset.neonBloom="glow-off-slow-device";}}else this.slowSince=0;
  }
  // Binds the scene target; returns false when the plain path must be used.
  begin(w,h){
    if(!this.enabled)return false;const gl=this.gl;
    try{if(!this.prog&&!this.init())return false;if(this.res?.main&&!gl.isFramebuffer(this.res.main.f)){this.res={};this.w=0;}this.resize(w,h);if(!this.enabled)return false;}
    catch(error){this.enabled=false;console.warn("native bloom disabled",error);return false;}
    this.track(performance.now());
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.res.main.f);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    const v=globalThis.document?.getElementById?.("viewport");if(v&&!v.dataset.neonBloom)v.dataset.neonBloom=NATIVE_BLOOM_VERSION;
    return true;
  }
  draw(prog,target,setup){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.f:null);gl.viewport(0,0,target?target.w:this.w,target?target.h:this.h);gl.useProgram(prog.p);setup(prog.u);gl.drawArrays(gl.TRIANGLES,0,3);}
  bind(unit,t){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
  blur(src,tmp){const P=this.prog.blur;this.bind(0,src.t);this.draw(P,tmp,u=>{this.gl.uniform1i(u.tSrc,0);this.gl.uniform2f(u.uDir,1/src.w,0);});this.bind(0,tmp.t);this.draw(P,src,u=>{this.gl.uniform1i(u.tSrc,0);this.gl.uniform2f(u.uDir,0,1/src.h);});}
  end(exposure=1){
    const gl=this.gl,r=this.res;
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.depthMask(false);gl.bindVertexArray(this.vao);
    if(this.bloomOn){
      this.bind(0,r.main.hdr);this.draw(this.prog.bright,r.a1,u=>{gl.uniform1i(u.tSrc,0);gl.uniform1f(u.uThreshold,THRESHOLD);});
      this.blur(r.a1,r.b1);
      this.bind(0,r.a1.t);this.draw(this.prog.copy,r.a2,u=>gl.uniform1i(u.tSrc,0));
      this.blur(r.a2,r.b2);
    }
    this.bind(0,r.main.t);this.bind(1,r.main.hdr);this.bind(2,r.a1.t);this.bind(3,r.a2.t);
    this.draw(this.prog.combine,null,u=>{gl.uniform1i(u.tScene,0);gl.uniform1i(u.tHdr,1);gl.uniform1i(u.tB1,2);gl.uniform1i(u.tB2,3);
      gl.uniform1f(u.uS1,this.bloomOn?STRENGTH_NEAR:0);gl.uniform1f(u.uS2,this.bloomOn?STRENGTH_WIDE:0);gl.uniform1f(u.uExposure,exposure);});
    gl.activeTexture(gl.TEXTURE0);gl.bindVertexArray(null);gl.depthMask(true);
  }
  dispose({contextLost=false}={}){if(!contextLost)this.free();this.res=null;this.prog=null;this.w=this.h=0;}
}
