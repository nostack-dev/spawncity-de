import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const deploy=readFileSync(".github/workflows/deploy.yml","utf8");
const cutover=readFileSync("docs/ONE_REPO_PAGES_CUTOVER.md","utf8");
assert.match(deploy,/name: Deploy SpawnCity/);
assert.match(deploy,/on:\s*\n\s*push:/);
assert.match(deploy,/branches: \["main"\]/);
assert.match(deploy,/contents: write/);
assert.match(deploy,/git push --force "https:\/\/x-access-token:\$\{GH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git" HEAD:gh-pages/,
  "only publish into the same repository");
assert.match(deploy,/printf 'spawncity\.de\\n' > CNAME/);
assert.match(deploy,/node tests\/production_box3d_bundle_contract_test\.mjs/,
  "retain exact Box3D artifact identity");
assert.match(deploy,/live-e2e:/);
for(const pattern of [
  /ChristianHohlfeld\/spawncity-de/,
  /\/tmp\/served/,
  /spawncity-publication-mirror/,
  /WORKFLOW_PAGES=/,
  /api\.github\.com\/repos\/\$\{GITHUB_REPOSITORY\}\/pages/,
  /actions\/deploy-pages@/,
  /actions\/upload-pages-artifact@/,
  /actions\/configure-pages@/,
])assert.doesNotMatch(deploy,pattern,"no mirror, alternative publishing or failing 403-admin Pages API in release");
assert.match(cutover,/nostack-dev\/spawncity-de\/settings\/pages/);
assert.match(cutover,/ChristianHohlfeld\/spawncity-de\/settings\/pages/);
assert.match(cutover,/HTTP 403/);
assert.match(cutover,/remove/i);
console.log("Single-repository Pages publisher contract verified; owner-controlled Pages settings handoff documented.");
