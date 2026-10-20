import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

// Reproduce the actual service worker's navigation handler in an isolated JS
// runtime. Visiting /native/ must not poison the canonical offline game and
// an offline /native/ request must not fall back to the old drone HTML.
const source=readFileSync("oppenheimer-sw.js","utf8");
const handlers={},writes=[],byName=new Map();
let offline=false;
const caches={
 async open(name){
  if(!byName.has(name))byName.set(name,new Map());
  const data=byName.get(name);
  return {async put(key,value){writes.push({name,key:String(key),value});data.set(String(key),value);},
          async match(key){return data.get(String(key))??null}};
 }
};
const network=async url=>{
 if(offline)throw Error("offline");
 return new Response(url.includes("/native/")?"NATIVE_CANDIDATE":"LEGACY_DRONE",{status:200,
  headers:{"content-type":"text/html"}});
};
const context=vm.createContext({
 self:{location:{origin:"https://spawncity.de"},addEventListener(type,fn){handlers[type]=fn;}},
 URL,Response,caches,fetch:network,console,Math
});
vm.runInContext(source,context,{filename:"oppenheimer-sw.js"});
assert.equal(typeof handlers.fetch,"function");
const fetchPage=async path=>{
 let response=null;
 handlers.fetch({request:{method:"GET",url:"https://spawncity.de"+path,mode:"navigate"},
  respondWith(p){response=Promise.resolve(p);}});
 assert.ok(response,"SW did not intercept navigation "+path);
 return response;
};
let game=await fetchPage("/drone_simulator.html");
assert.equal(await game.text(),"LEGACY_DRONE");
assert.ok(writes.some(w=>w.key==="./drone_simulator.html"),"offline game must be stored");
const saved=writes.length;
let native=await fetchPage("/native/");
assert.equal(await native.text(),"NATIVE_CANDIDATE");
assert.equal(writes.length,saved,"native test page must NOT overwrite the game cache");
let root=await fetchPage("/");
assert.equal(await root.text(),"LEGACY_DRONE");
assert.equal(writes.length,saved,"home page must not overwrite the game cache either");
offline=true;
native=await fetchPage("/native/");
assert.equal(native.status,503,"offline native preview cannot serve old game by mistake");
assert.notEqual(await native.text(),"LEGACY_DRONE");
game=await fetchPage("/drone_simulator.html");
assert.equal(await game.text(),"LEGACY_DRONE","canonical PWA retains proper offline support");
assert.ok([...byName.keys()].includes("spawncity-app-v2"),"new SW version replaces poisoned older cache");
console.log("PWA isolation: /native/ online/offline cannot poison cached canonical game");
