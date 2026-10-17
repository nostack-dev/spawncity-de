import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(".github/workflows/deploy.yml","utf8");
const live=workflow.split(/^  live-e2e:\s*$/m)[1];
assert.ok(live,"the canonical host must have a live check after publish");
assert.match(live,/needs:\s*deploy/);
assert.match(live,/GH_TOKEN:\s*\$\{\{ github\.token \}\}/,
 "a private/limited GitHub repo API preflight must use the Actions token");
assert.match(live,/-H\s+"Authorization: Bearer \$\{GH_TOKEN\}"/);
assert.match(live,/api\.github\.com\/repos\/\$\{GITHUB_REPOSITORY\}/);
assert.match(live,/\/build\.json\?sha=/);
assert.match(live,/ARONDIGHT45_BUILD_SHA:/);
assert.doesNotMatch(live,/curl[^\n]*https:\/\/api\.github\.com\/repos\/\$\{GITHUB_REPOSITORY\}(?!.*Authorization)/,
 "unauthenticated REST preflight must not return under rate limits");
console.log("SpawnCity live origin verification uses authenticated GitHub Pages status and on-origin immutable SHA.");
