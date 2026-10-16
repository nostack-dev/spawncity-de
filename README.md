# SpawnCity

**Canonical game repository:** `nostack-dev/spawncity-de`. This is the only source of truth for the simulator. Do not develop or deploy the game from `nostack-dev/kurzlernen-de`.

- Game: https://spawncity.de/drone_simulator.html
- Main source: `drone_simulator.html`, `drone_controller.html`, `sim/`, `esp32/`, `drone_simulator.webmanifest`, `oppenheimer-sw.js`
- Game releases: `sim/changelog_menu.mjs` (newest first)
- Product host and multiplayer room: `sim/site_config.mjs`
- Pages build: `.github/workflows/deploy.yml`. It builds **only tracked files in this repository**, using no pinned checkout of Kurzlernen.
- Verification: `node tests/standalone_source_test.mjs` and `node tests/site_config_test.mjs`.

The game sources were consolidated from `nostack-dev/kurzlernen-de@2165abec7f59fe2cc27e82db3bba7d5531aaa9f9` on 2026-10-16. The original `kurzlernen.de` remains a separate site and must not be repurposed as a game-source mirror. Game feature changes, bug fixes and changelog updates now belong only here.
