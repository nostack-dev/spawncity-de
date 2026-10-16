// SpawnCity exit guard. The deploy workflow inlines this as a plain <script> at the end of
// drone_simulator.html. The game HUD has its own EXIT (#gameExitButton), but some states hide or
// cover it (a vehicle, a panel or dialog over the view, a HUD module that failed to load). Whenever
// a game is running and that EXIT can't be tapped for a moment, this shows a fallback EXIT in the
// top-left corner. "JA" leaves through the game's own exit; if the menu still isn't back after a
// short wait, the page reloads, which always lands on the start menu.
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var exitBtn=null,ask=null,missingSince=0;

  function menuShown(){var m=$("gameMenu");return Boolean(m&&!m.hidden&&getComputedStyle(m).display!=="none"); /* fixed: offsetParent is always null */}
  function gameRunning(){return document.body&&document.body.classList.contains("solo-flight")&&!menuShown();}
  function tappable(el){
    if(!el||el.hidden)return false;var r=el.getBoundingClientRect();if(r.width<8||r.height<8)return false;
    var cs=getComputedStyle(el);if(cs.display==="none"||cs.visibility==="hidden"||Number(cs.opacity)<.2)return false;
    var x=r.left+r.width/2,y=r.top+r.height/2;if(x<0||y<0||x>innerWidth||y>innerHeight)return false;
    var own=exitBtn&&!exitBtn.hidden;if(own)exitBtn.style.visibility="hidden"; /* don't count our own fallback as "covering" */
    var top=document.elementFromPoint(x,y);if(own)exitBtn.style.visibility="";
    return Boolean(top&&(top===el||el.contains(top)));
  }
  function ensure(){
    if(exitBtn&&exitBtn.isConnected)return;
    exitBtn=document.createElement("button");exitBtn.id="scExit";exitBtn.type="button";exitBtn.hidden=true;exitBtn.textContent="⟵ EXIT";exitBtn.setAttribute("aria-label","Zurück zum Hauptmenü");
    ask=document.createElement("div");ask.id="scExitAsk";ask.hidden=true;ask.setAttribute("role","dialog");ask.setAttribute("aria-modal","true");
    ask.innerHTML='<div class="box">ZURÜCK ZUM HAUPTMENÜ?<div class="row"><button type="button" data-yes>JA</button><button type="button" data-no>NEIN</button></div></div>';
    var stop=function(e){e.stopPropagation();};
    ["pointerdown","pointerup","touchstart","touchend","mousedown"].forEach(function(t){exitBtn.addEventListener(t,stop,true);ask.addEventListener(t,stop,true);});
    exitBtn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();ask.hidden=false;try{document.exitPointerLock&&document.exitPointerLock();}catch(_){}} ,true);
    ask.addEventListener("click",function(e){
      e.preventDefault();e.stopPropagation();var t=e.target;
      if(t&&t.closest&&t.closest("[data-yes]")){ask.hidden=true;leave();}
      else if(t&&t.closest&&(t.closest("[data-no]")||t===ask))ask.hidden=true;
    },true);
    document.body.appendChild(exitBtn);document.body.appendChild(ask);
  }
  function leave(){
    try{var q=$("quitConfirmDialog");if(q)q.remove();}catch(_){}
    try{var s=$("soloExit");if(s)s.click();}catch(_){}
    setTimeout(function(){if(!menuShown()){try{location.reload();}catch(_){}}},1200);
  }
  function tick(){
    try{
      if(!document.body){return;}ensure();
      var need=false;
      if(gameRunning()&&!$("quitConfirmDialog")&&ask.hidden){
        if(tappable($("gameExitButton"))){missingSince=0;}
        else{var now=performance.now();if(!missingSince)missingSince=now;need=now-missingSince>1200;}
      }else missingSince=0;
      if(exitBtn.hidden===need)exitBtn.hidden=!need;
      if(!gameRunning()&&!ask.hidden)ask.hidden=true;
      document.documentElement.dataset.scExitGuard=need?"shown":"idle";
    }catch(_){}
  }
  setInterval(tick,300);
})();
