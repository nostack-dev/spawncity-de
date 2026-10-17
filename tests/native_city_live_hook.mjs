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
      let n=0;
      try{n=pass.prepare(targetScene)||0;}catch(e){info.errors.push(String(e));pass.restore();}
      try{oldRender.call(renderer,targetScene,camera);}finally{pass.restore();}
      if(n)try{const stat=pass.draw(camera);info.passes++;info.draws+=Number(stat?.drawCalls)||0;
        const v=document.getElementById("viewport");if(v)v.dataset.nativeCityTrialCalls=String(stat?.drawCalls||0);
      }catch(e){info.errors.push(String(e));oldRender.call(renderer,targetScene,camera);}
    };
    try{return previous.apply(this,args);}finally{renderer.render=oldRender;}
  };
  return {info,stop(){bridge.renderReal=previous;pass.dispose();}};
};
