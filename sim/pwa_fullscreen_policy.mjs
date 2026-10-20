// Android Chrome shows a system "swipe down and Back" toast whenever JS
// requestFullscreen() runs. An installed fullscreen/standalone PWA is already
// in an app window: requesting DOM fullscreen there is redundant and may
// produce a false black status-bar strip plus an unwanted OS toast.
export function isInstalledGameApp({fullscreen=false,standalone=false,iosStandalone=false}={}){
  return fullscreen===true||standalone===true||iosStandalone===true;
}
export function shouldRequestGameFullscreen({displayModeFullscreen=false,displayModeStandalone=false,iosStandalone=false,alreadyFullscreen=false,apiAvailable=false}={}){
  return !alreadyFullscreen&&apiAvailable&&!isInstalledGameApp({
    fullscreen:displayModeFullscreen,standalone:displayModeStandalone,iosStandalone
  });
}
