import assert from "node:assert/strict";
import {NativeWorldPresenter} from "../sim/native_world_presenter.mjs";

// Exercise the scheduling lifecycle without instantiating a GPU context.
function presenterWith(draw) {
 const owner=Object.create(NativeWorldPresenter.prototype);
 owner.running=false;owner.disposed=false;owner.frameEpoch=0;owner.draw=draw;
 return owner;
}
{
 const callbacks=[];
 const owner=presenterWith(()=>owner.stop());
 assert.equal(owner.start({requestFrame:cb=>callbacks.push(cb)}),true);
 assert.equal(callbacks.length,1);
 callbacks.shift()(100);
 assert.equal(callbacks.length,0,"stop during draw must not queue another frame");
 assert.equal(owner.running,false);
}
{
 const callbacks=[];
 const owner=presenterWith(()=>{owner.disposed=true;owner.running=false;});
 owner.start({requestFrame:cb=>callbacks.push(cb)});
 callbacks.shift()(100);
 assert.equal(callbacks.length,0,"dispose during draw must not queue another frame");
}
{
 const owner=presenterWith(()=>{});
 assert.throws(()=>owner.start({requestFrame:()=>{throw Error("scheduler unavailable");}}),/scheduler unavailable/);
 assert.equal(owner.running,false,"failed initial scheduling must rollback running state");
}
{
 const callbacks=[];
 let frames=0;
 const owner=presenterWith(()=>{frames++;});
 assert.equal(owner.start({requestFrame:cb=>callbacks.push(cb)}),true);
 assert.equal(owner.start({requestFrame:cb=>callbacks.push(cb)}),false);
 assert.equal(callbacks.length,1);
 callbacks.shift()(100);
 assert.equal(frames,1);
 assert.equal(callbacks.length,1,"running presenter must schedule the next frame");
 owner.stop();
 callbacks.shift()(116);
 assert.equal(frames,1,"stale callback after stop must not draw");
 assert.equal(callbacks.length,0);
}
console.log("native presenter frame lifecycle: ok");

{
 const callbacks=[];
 let draws=0;
 const owner=presenterWith(()=>{draws++;});
 const schedule=cb=>callbacks.push(cb);
 owner.start({requestFrame:schedule});
 const stale=callbacks.shift();
 owner.stop();
 owner.start({requestFrame:schedule});
 stale(100);
 assert.equal(draws,0,"callback from previous run must not render after restart");
 assert.equal(callbacks.length,1,"stale callback must not schedule a second loop");
 callbacks.shift()(116);
 assert.equal(draws,1);
 assert.equal(callbacks.length,1);
 owner.stop();
}
