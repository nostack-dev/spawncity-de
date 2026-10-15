# spawncity.de — GitHub Pages

This repository (`nostack-dev/spawncity-de`) is the SpawnCity site. `CNAME` is exactly `spawncity.de`.

`nostack-dev/kurzlernen-de` keeps `CNAME` = `kurzlernen.de`. Do not change that file. GitHub Pages allows one custom domain per repository, so the game can move without taking the current site offline.

## DomainFactory DNS for spawncity.de

Remove the parking address `80.67.16.8`, any webspace, and any URL redirect on **spawncity.de**. Leave DomainFactory HTTPS/proxy off so it does not sit in front of GitHub’s certificate.

Confirm the addresses against [GitHub’s custom-domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) if they have changed, then set:

| Host | Type | Value |
| --- | --- | --- |
| `@` (apex) | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `@` | AAAA | `2606:50c0:8000::153` |
| `@` | AAAA | `2606:50c0:8001::153` |
| `@` | AAAA | `2606:50c0:8002::153` |
| `@` | AAAA | `2606:50c0:8003::153` |
| `www` | CNAME | `nostack-dev.github.io` |

`www` points at the org host `nostack-dev.github.io`, not a project subpath.

Check:

```bash
dig +short spawncity.de A
dig +short spawncity.de AAAA
dig +short www.spawncity.de CNAME
```

The apex should list the four GitHub A addresses. `www` should end at `nostack-dev.github.io`.

GitHub issues the certificate after those records are visible. Enforce HTTPS in the repository Pages settings once the certificate exists (the API toggle is refused until then).

## What players open

- Game: `https://spawncity.de/drone_simulator.html`
- Site root (`/` and `/index.html`) redirects to that game. Other paths stay.
- Same-origin update check: `./build.json` (no domain baked into the path).
- Multiplayer room id stays `arondight45-kurzlernen-vs-v3`, so phones already in a session still find each other.

Home-screen installs stay tied to the origin they were added from. After this domain answers, open the game once and add SpawnCity to the home screen again.

## kurzlernen.de

Leave its DNS on GitHub Pages until spawncity.de loads the game with a valid padlock. After that, a path-preserving 301 from `https://kurzlernen.de/<path>` to `https://spawncity.de/<path>` keeps old bookmarks. If DomainFactory only allows one target URL, send the whole old domain to `https://spawncity.de/drone_simulator.html`. Use a direct 301, not a frame redirect, and remove the old GitHub A/AAAA/CNAME records in the same change.
