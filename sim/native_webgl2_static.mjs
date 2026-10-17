// Low-level, first-party WebGL2 static triangle batches.
// Independent of Three.js: input is positions/colors (Float32Array), MVP matrix.
// Deliberately limited to opaque vertex-color triangles. Lighting, skinning,
// transparency, shadow maps, fog, PBR and dynamic scene objects are NOT covered.
export const NATIVE_STATIC_GL_VERSION="webgl2-opaque-batches-v1";

export class NativeStaticBatches {
  constructor(gl,{width,height}={}) {
    if(!gl||typeof gl.createVertexArray!=="function")throw Error("NativeStaticBatches requires WebGL2");
    this.gl=gl;this.batches=[];this.triangles=0;this.disposed=false;
    const vert=`#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 color;
uniform mat4 mvp;
out vec3 vColor;
void main(){vColor=color;gl_Position=mvp*vec4(position,1.0);}`;
    const frag=`#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main(){outColor=vec4(vColor,1.0);}`;
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message);}
      return shader;
    };
    const program=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vert),f=compile(gl.FRAGMENT_SHADER,frag);
    gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
    gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error(message);}
    this.program=program;this.mvp=gl.getUniformLocation(program,"mvp");
    this.resize(width??gl.canvas.width,height??gl.canvas.height);
  }
  resize(width,height){this.width=Math.max(1,Math.floor(width));this.height=Math.max(1,Math.floor(height));}
  add(positions,colors){
    if(this.disposed)throw Error("NativeStaticBatches is disposed");
    if(!(positions instanceof Float32Array)||!(colors instanceof Float32Array)
      ||positions.length===0||positions.length!==colors.length||positions.length%9)
      throw Error("Native batch needs matching positions/colors with whole triangles");
    const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
    const buffers=[];
    for(const [slot,values] of [[0,positions],[1,colors]]){
      const buffer=gl.createBuffer();buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(slot);gl.vertexAttribPointer(slot,3,gl.FLOAT,false,0,0);
    }
    gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    const batch={vao,buffers,count:positions.length/3};this.batches.push(batch);
    this.triangles+=positions.length/9;return batch;
  }
  render(mvp,{clear=true,finish=false}={}){
    if(this.disposed)throw Error("NativeStaticBatches is disposed");
    if(!mvp||mvp.length!==16)throw Error("Expected 4x4 column-major projection-view matrix");
    const gl=this.gl;gl.viewport(0,0,this.width,this.height);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
    if(clear){gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
    gl.useProgram(this.program);gl.uniformMatrix4fv(this.mvp,false,mvp);
    for(const {vao,count} of this.batches){gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,count);}
    gl.bindVertexArray(null);if(finish)gl.finish();
    return {drawCalls:this.batches.length,triangles:this.triangles};
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    const gl=this.gl;
    for(const b of this.batches){gl.deleteVertexArray(b.vao);for(const buffer of b.buffers)gl.deleteBuffer(buffer);}
    gl.deleteProgram(this.program);this.batches.length=0;this.triangles=0;
  }
}
