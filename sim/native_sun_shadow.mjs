// Native directional sun depth pass. One WebGL2 context, no Three.js.
import {lookAt,multiply4} from "./native_render_math.mjs";
import {extractFrustumPlanes,sphereVisible} from "./native_render_culling.mjs";
export const NATIVE_SUN_SHADOW_VERSION="native-sun-depth-v1";
export function ortho(l,r,b,t,n,f){
 if(!(r>l&&t>b&&n>0&&f>n))throw Error("invalid sun ortho");
 return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);
}
export function sunShadowMatrix(focus,sun,extent=120){
 if(focus?.length!==3||sun?.length!==3||!(extent>0))throw Error("invalid sun settings");
 const len=Math.hypot(...sun);if(!(len>1e-6))throw Error("invalid sun direction");
 const d=sun.map(x=>x/len),eye=focus.map((x,i)=>x+d[i]*extent*2),up=Math.abs(d[2])>.94?[0,1,0]:[0,0,1];
 return multiply4(ortho(-extent,extent,-extent,extent,.2,extent*4),lookAt(eye,focus,up));
}
const VERT="#version 300 es\n"+[
"precision highp float;",
"layout(location=0) in vec3 aPosition;",
"layout(location=4) in vec4 iModel0;",
"layout(location=5) in vec4 iModel1;",
"layout(location=6) in vec4 iModel2;",
"layout(location=7) in vec4 iModel3;",
"layout(location=12) in vec4 aJoints;",
"layout(location=13) in vec4 aWeights;",
"uniform mat4 uLightViewProjection,uBones[32];",
"uniform int uSkinned;",
"void main(){",
" mat4 model=mat4(iModel0,iModel1,iModel2,iModel3);",
" vec4 p=vec4(aPosition,1.0);",
" if(uSkinned==1){",
"  mat4 b=aWeights.x*uBones[int(aJoints.x)]+aWeights.y*uBones[int(aJoints.y)]",
"   +aWeights.z*uBones[int(aJoints.z)]+aWeights.w*uBones[int(aJoints.w)];",
"  p=b*p;",
" }",
" gl_Position=uLightViewProjection*model*p;",
"}"].join("\n");
const FRAG="#version 300 es\nprecision mediump float;\nvoid main(){}";
const shader=(gl,type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw Error("sun shadow shader "+e);}return sh;};
function makeProgram(gl){
 const vs=shader(gl,gl.VERTEX_SHADER,VERT),fs=shader(gl,gl.FRAGMENT_SHADER,FRAG),p=gl.createProgram();
 gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const e=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw Error("sun shadow program "+e);}
 return {handle:p,matrix:gl.getUniformLocation(p,"uLightViewProjection"),bones:gl.getUniformLocation(p,"uBones[0]"),skin:gl.getUniformLocation(p,"uSkinned")};
}
export class NativeSunShadowMap{
 constructor(gl,{resolution=512,extent=120,bias=.0012}={}){
  if(!gl?.createFramebuffer)throw Error("native WebGL2 required");
  if(!Number.isInteger(resolution)||resolution<128||resolution>2048||(resolution&(resolution-1)))throw Error("shadow resolution must be power of two 128-2048");
  if(!(extent>=10&&extent<=2000)||!(bias>=0&&bias<.04))throw Error("invalid sun shadow options");
  this.gl=gl;this.resolution=resolution;this.extent=extent;this.bias=bias;this.matrix=null;this.initialize();
 }
 initialize(){
  const gl=this.gl;this.gpu=makeProgram(gl);this.depth=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,this.depth);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,this.resolution,this.resolution,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  for(const [p,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE],[gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL]])gl.texParameteri(gl.TEXTURE_2D,p,v);
  this.fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.depth,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
  const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);
  if(status!==gl.FRAMEBUFFER_COMPLETE){this.dispose();throw Error("sun shadow framebuffer incomplete "+status);}
 }
 draw(meshes,{focus,sunDirection}){
  const gl=this.gl;this.matrix=sunShadowMatrix(focus,sunDirection,this.extent);
  const planes=extractFrustumPlanes(this.matrix);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,this.resolution,this.resolution);
  gl.colorMask(false,false,false,false);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);
  gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(2,3);
  gl.useProgram(this.gpu.handle);gl.uniformMatrix4fv(this.gpu.matrix,false,this.matrix);
  let draws=0;
  try{
   for(const m of meshes){
    if(!m.visible||m.material?.castShadow===false||m.material?.alphaMode==="blend"||m.material?.alphaMode==="mask")continue;
    if(!m.data.skin&&m.worldBounds&&!sphereVisible(planes,m.worldBounds.center,m.worldBounds.radius))continue;
    const d=m.data;
    gl.uniform1i(this.gpu.skin,d.skin?1:0);
    if(d.skin)gl.uniformMatrix4fv(this.gpu.bones,false,d.skin.bones);
    if(m.material?.doubleSided)gl.disable(gl.CULL_FACE);
    else {gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);}
    gl.bindVertexArray(m.vao);
    if(d.indices)gl.drawElementsInstanced(gl.TRIANGLES,d.indices.length,m.elementType,0,d.count);
    else gl.drawArraysInstanced(gl.TRIANGLES,0,d.p.length/3,d.count);
    draws++;
   }
  }finally{
   gl.bindVertexArray(null);gl.disable(gl.CULL_FACE);gl.disable(gl.POLYGON_OFFSET_FILL);
   gl.colorMask(true,true,true,true);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  return {drawCalls:draws,resolution:this.resolution};
 }
 dispose({contextLost=false}={}){
  if(!contextLost){if(this.fbo)this.gl.deleteFramebuffer(this.fbo);if(this.depth)this.gl.deleteTexture(this.depth);if(this.gpu?.handle)this.gl.deleteProgram(this.gpu.handle);}
  this.fbo=null;this.depth=null;this.gpu=null;
 }
}
