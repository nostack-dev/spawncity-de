// SpawnCity public-site settings. One place for the product name and the live host.
//
// This repository is the GitHub Pages site for spawncity.de. pagesHost must match
// the single line in ./CNAME. kurzlernen.de stays on nostack-dev/kurzlernen-de;
// do not put spawncity.de in that repo's CNAME.
//
// multiplayerAppId is the Trystero room key, not a brand string. Renaming it
// would split players who still have the previous build open.

export const SITE=Object.freeze({
  productName:"SpawnCity",
  productHost:"spawncity.de",
  legacyHost:"kurzlernen.de",
  pagesHost:"spawncity.de",
  gamePath:"/drone_simulator.html",
  controllerPath:"/drone_controller.html",
  multiplayerAppId:"arondight45-kurzlernen-vs-v3"
});

export function pagesOrigin(){return `https://${SITE.pagesHost}`;}
export function productOrigin(){return `https://${SITE.productHost}`;}
export function gameUrl(){return `${pagesOrigin()}${SITE.gamePath}`;}
export function controllerUrl(){return `${pagesOrigin()}${SITE.controllerPath}`;}
export function canonicalGameUrl(){return gameUrl();}

// Site root opens the game (apex, www, and the project Pages path). Other paths stay.
export function productFrontDoor(_hostname,pathname){
  const path=String(pathname||"/");
  if(path==="/"||path==="/index.html"||/\/spawncity-de\/?$/.test(path)||/\/spawncity-de\/index\.html$/.test(path)){
    const base=/\/spawncity-de(\/|$)/.test(path)?"/spawncity-de":"";
    return `${base}${SITE.gamePath}`;
  }
  return "";
}
