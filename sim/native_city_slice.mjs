import {NativeStaticBatches} from "./native_webgl2_static.mjs";

// Opt-in live vertical slice, not the production native engine.
// Draws the ACTUAL streamed city solids using the same WebGL2 context and depth
// buffer as the existing presentation renderer. The city will look UNLIT:
// facades, PBR, shadows and cutouts still require native shader equivalents.
// Do not enable this path by default until the full visual/GPU gate is green.
export const NATIVE_CITY_SLICE_VERSION="native-webgl2-live-city-unlit-experimental-v1";

export class NativeCitySlice {
  constructor(renderer){
    const gl=renderer?.getContext?.();
    if(!gl||typeof gl.createVertexArray!=="function")throw Error("Live city native path needs WebGL2");
    this.renderer=renderer;this.gl=gl;
    this.native=new NativeStaticBatches(gl,{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight});
    this.owners=[];this.entries=[];this.failures=0;this.shownFrames=0;
    this.geometryKeys=[];this.sources=[];
  }
  chunks(scene){
    const root=scene?.getObjectByName?.("WORLD_CITY_BUILDINGS");
    if(!root||root.visible===false)return [];
    const result=[];
    root.traverse?.(n=>{
      const p=n.geometry?.attributes?.position,c=n.geometry?.attributes?.color;
      if(n.isMesh&&n.name==="WORLD_CITY_CHUNK"&&n.visible&&p?.array instanceof Float32Array
        &&c?.array instanceof Float32Array&&p.array.length===c.array.length&&p.array.length%9===0)
        result.push(n);
    });
    return result;
  }
  prepare(scene){
    const objects=this.chunks(scene);
    if(!objects.length)return null;
    const ids=objects.map(n=>n.geometry.uuid);
    const changed=ids.length!==this.geometryKeys.length||ids.some((id,i)=>this.geometryKeys[i]!==id);
    if(changed){
      this.native.clear();this.entries=[];this.geometryKeys=ids;
      for(const mesh of objects){
        const a=mesh.geometry.attributes;
        this.entries.push(this.native.add(a.position.array,a.color.array));
      }
      this.sources=objects.map(n=>({p:n.geometry.attributes.position.version,c:n.geometry.attributes.color.version}));
    }else for(let i=0;i<objects.length;i++){
      const a=objects[i].geometry.attributes,prev=this.sources[i];
      if(prev.p===a.position.version&&prev.c===a.color.version)continue;
      this.native.update(this.entries[i],a.position.array,a.color.array);
      this.sources[i]={p:a.position.version,c:a.color.version};
    }
    // Only suppress city solids during the Three main pass; collision, actor,
    // damage and camera scene objects remain intact. Visibility is restored
    // immediately even if GPU work throws.
    this.owners=objects.map(mesh=>({mesh,visible:mesh.visible}));
    for(const owner of this.owners)owner.mesh.visible=false;
    return objects.length;
  }
  restore(){
    for(const o of this.owners)o.mesh.visible=o.visible;
    this.owners=[];
  }
  draw(camera){
    if(!this.entries.length)return null;
    const gl=this.gl,renderer=this.renderer;
    // Three caches the GL state: reset it before touching raw WebGL and again
    // afterwards, otherwise the next normal Three frame can inherit our VAO.
    renderer.resetState();
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
    gl.colorMask(true,true,true,true);gl.depthMask(true);
    const e=camera.projectionMatrix.elements,v=camera.matrixWorldInverse.elements;
    const m=new Float32Array(16);
    for(let col=0;col<4;col++)for(let row=0;row<4;row++){
      m[col*4+row]=e[row]*v[col*4]+e[4+row]*v[col*4+1]+e[8+row]*v[col*4+2]+e[12+row]*v[col*4+3];
    }
    this.native.resize(gl.drawingBufferWidth,gl.drawingBufferHeight);
    let result;
    try{result=this.native.render(m,{clear:false});this.shownFrames++;}
    finally{renderer.resetState();}
    return result;
  }
  dispose(){this.restore();this.native.dispose();this.geometryKeys=[];this.entries=[];}
}
