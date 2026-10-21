// Single WebGL2 sky pass: no dome meshes, fake city geometry, extra context,
// texture/network requests, or per-frame allocations. It draws into the same
// native depth framebuffer behind real Box3D-derived terrain and OSM meshes.
export const NATIVE_SKY_PASS_VERSION="native-webgl2-horizon-v1";
const VERT=`#version 300 es
precision highp float;
out vec2 vUv;
void main() {
 vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
 vUv=p*.5;
 gl_Position=vec4(p*2.0-1.0,1.0,1.0);
}`;
const FRAG=`#version 300 es
precision highp float;
in vec2 vUv;
uniform float uHorizon;
out vec4 outColor;
void main() {
 // Horizon moves with the real native camera's pitch, never from a
 // separately animated or invented world-space sky object.
 float h=max(-0.6,min(1.6,uHorizon));
 float elevation=clamp((vUv.y-h)*2.0,0.0,1.0);
 vec3 horizon=vec3(.788,.863,.937);
 vec3 azure=vec3(.173,.435,.769);
 vec3 zenith=vec3(.11,.28,.55);
 vec3 sky=mix(horizon,azure,smoothstep(0.0,.55,elevation));
 sky=mix(sky,zenith,smoothstep(.4,1.0,elevation)*.45);
 float mist=1.0-smoothstep(-.02,.16,vUv.y-h);
 vec3 color=mix(sky,vec3(.718,.788,.863),mist*.55);
 outColor=vec4(color,1.0);
}`;
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
  this.horizonUniform=gl.getUniformLocation(program,"uHorizon");
  this.disposed=false;
 }
 draw({eye,target,fov}){
  if(this.disposed)throw Error("native sky pass disposed");
  const gl=this.gl;
  if(!eye?.length||!target?.length||!(fov>0))throw Error("sky requires original native camera");
  const vertical=target[2]-eye[2],horizontal=Math.hypot(target[0]-eye[0],target[1]-eye[1]);
  const pitch=Math.atan2(vertical,horizontal);
  const horizon=.5-Math.tan(pitch)/(2*Math.tan(fov/2));
  gl.depthMask(false);gl.disable(gl.DEPTH_TEST);
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);
  gl.uniform1f(this.horizonUniform,horizon);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindVertexArray(null);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
 }
 dispose({contextLost=false}={}){
  if(this.disposed)return;this.disposed=true;
  if(!contextLost){this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
 }
}
