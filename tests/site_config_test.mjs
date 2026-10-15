import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync,readdirSync} from "node:fs";
import {SITE,canonicalGameUrl,controllerUrl,gameUrl,productFrontDoor} from "../sim/site_config.mjs";

assert.equal(SITE.productName,"SpawnCity");
assert.equal(SITE.productHost,"spawncity.de");
assert.equal(SITE.productHost.includes("-"),false,"product domain has no hyphen");
assert.equal(SITE.legacyHost,"kurzlernen.de");
assert.equal(SITE.multiplayerAppId,"arondight45-kurzlernen-vs-v3","room id stays stable across the domain move");
assert.equal(readFileSync("CNAME","utf8").trim(),SITE.pagesHost,"CNAME must be the Pages host");
assert.equal(SITE.pagesHost,SITE.productHost);
assert.equal(canonicalGameUrl(),`https://${SITE.pagesHost}${SITE.gamePath}`);
assert.equal(gameUrl(),canonicalGameUrl());
assert.equal(controllerUrl(),`https://${SITE.pagesHost}${SITE.controllerPath}`);

assert.equal(productFrontDoor("spawncity.de","/"),"/drone_simulator.html");
assert.equal(productFrontDoor("www.spawncity.de","/index.html"),"/drone_simulator.html");
assert.equal(productFrontDoor("nostack-dev.github.io","/spawncity-de/"),"/spawncity-de/drone_simulator.html");
assert.equal(productFrontDoor("nostack-dev.github.io","/spawncity-de/index.html"),"/spawncity-de/drone_simulator.html");
assert.equal(productFrontDoor("spawncity.de","/drone_simulator.html"),"");
assert.equal(productFrontDoor("spawncity.de","/cardio.html"),"");

const html=readFileSync("drone_simulator.html","utf8");
const canon=canonicalGameUrl();
assert.ok(html.includes("<title>SpawnCity</title>"));
assert.ok(html.includes(`<link rel="canonical" href="${canon}">`));
assert.ok(html.includes(`<meta property="og:url" content="${canon}">`));
assert.ok(html.includes('property="og:title" content="SpawnCity"'));
assert.ok(html.includes('name="description" content="SpawnCity'));
assert.ok(html.includes(`property="og:image" content="${`https://${SITE.pagesHost}/sim/icons/spawncity-512.png`}"`));
assert.ok(html.includes('fetch("./build.json?t="+'));

const index=readFileSync("index.html","utf8");
assert.ok(index.includes('p==="/"||p==="/index.html"'));
assert.ok(index.includes('spawncity-de'));
assert.ok(index.includes('base+"/drone_simulator.html"+location.search+location.hash'));

const controller=readFileSync("drone_controller.html","utf8");
assert.ok(controller.includes("<title>SpawnCity Remote</title>"));
assert.ok(controller.includes("SPAWNCITY · REMOTE"));

const lan=readFileSync("sim/lan_vs.mjs","utf8");
assert.ok(lan.includes("APP_ID=SITE.multiplayerAppId"));
const music=readFileSync("sim/music_player.mjs","utf8");
assert.ok(music.includes("pagesOrigin()"));
assert.equal(music.includes("https://kurzlernen.de"),false);
const hil=readFileSync("tools/s31_hil_bridge.mjs","utf8");
assert.ok(hil.includes("gameUrl()"));
assert.ok(hil.includes("controllerUrl()"));
assert.equal(hil.includes("https://kurzlernen.de"),false);

const changelog=readFileSync("sim/changelog_menu.mjs","utf8");
assert.ok(changelog.includes("spawncity.de wird die Adresse"));
assert.ok(changelog.includes("Mitspieler finden sich weiter im selben Raum"));

for(const name of readdirSync(".github/workflows")){
  if(!name.endsWith(".yml"))continue;
  const text=readFileSync(`.github/workflows/${name}`,"utf8");
  assert.equal(text.includes("https://kurzlernen.de"),false,`${name} must read the host from tools/public_site.mjs`);
  assert.equal(text.includes("https://spawncity.de"),false,`${name} must not hardcode the product host`);
}
assert.ok(readFileSync("docs/SPAWNCITY_DEPLOY.md","utf8").includes("spawncity.de"));

const built=spawnSync(process.execPath,["tools/public_site.mjs","build-json","abc1234"],{encoding:"utf8"});
assert.equal(built.status,0,built.stderr);
const json=JSON.parse(built.stdout);
assert.equal(json.sha,"abc1234");
assert.equal(json.product,"SpawnCity");
assert.equal(json.productHost,"spawncity.de");
assert.equal(json.pagesHost,SITE.pagesHost);
const origin=spawnSync(process.execPath,["tools/public_site.mjs","origin"],{encoding:"utf8"});
assert.equal(origin.stdout.trim(),`https://${SITE.pagesHost}`);

console.log("SpawnCity site config passed: product host spawncity.de, pages host still matches CNAME, multiplayer room unchanged.");
