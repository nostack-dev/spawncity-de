import {NativeCitySlice} from "../sim/native_city_slice.mjs";

// Install candidate raw-GL city pass into the LIVE game only for CI verification.
// The production branch and real player session are never modified.
// Keep a single renderer/renderReal override limited to scene draw calls.
globalThis.__installNativeCityTrial=()=>{
  const bridge=globalThis.__arondightRealWorld,renderer=bridge?.threeRenderer,scene=bridge?.threeScene;
  if(!bridge||!renderer||!scene)throw Error("live world renderer unavailable");
  const pass=new NativeCitySlice(renderer),previous=bridge.renderReal,info={draws:0,errors:[],passes:0};
  bridge.renderReal=function(...args){
    const oldRender=renderer.render;
    renderer.render=function(targetScene,camera){
      if(targetScene!==scene)return oldRender.call(renderer,targetScene,camera);
      const sameFrameRequested=info.captureNext===true&&info.passes>=4;
      const readPixels=()=>{
        const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        if(w<1||h<1)throw Error("Invalid real-game framebuffer");
        const rgba=new Uint8Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        if(gl.getError()!==gl.NO_ERROR)throw Error("readPixels failed");
        return {w,h,rgba:Array.from(rgba)};
      };
      // Capture reference and candidate from precisely the same game frame,
      // camera, time, DPR and world state. No asynchronous screenshot drift.
      let reference=null;
      if(sameFrameRequested){
        oldRender.call(renderer,targetScene,camera);
        reference=readPixels();
      }
      let n=0;
      try{n=pass.prepare(targetScene)||0;}catch(e){info.errors.push(String(e?.stack||e).slice(0,1200));pass.restore();}
      try{oldRender.call(renderer,targetScene,camera);}finally{pass.restore();}
      if(n)try{const stat=pass.draw(camera);info.passes++;info.draws+=Number(stat?.drawCalls)||0;
        const v=document.getElementById("viewport");if(v)v.dataset.nativeCityTrialCalls=String(stat?.drawCalls||0);
        if(reference){
          info.matched={reference,candidate:readPixels(),nativeDrawCalls:stat?.drawCalls||0,
            triangles:stat?.triangles||0,sceneTime:performance.now()};
          info.captureNext=false;
        }
      }catch(e){info.errors.push(String(e?.stack||e).slice(0,1200));oldRender.call(renderer,targetScene,camera);}
    };
    try{return previous.apply(this,args);}finally{renderer.render=oldRender;}
  };
  return {info,stop(){bridge.renderReal=previous;pass.dispose();}};
};
