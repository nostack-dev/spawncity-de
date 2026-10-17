# SpawnCity

**Canonical game repository:** `nostack-dev/spawncity-de`. This is the only source of truth for the simulator. Do not develop or deploy the game from `nostack-dev/kurzlernen-de`.

- Game: https://spawncity.de/drone_simulator.html
- Main source: `drone_simulator.html`, `drone_controller.html`, `sim/`, `esp32/`, `drone_simulator.webmanifest`, `oppenheimer-sw.js`
- Game releases: `sim/changelog_menu.mjs` (newest first)
- Product host and multiplayer room: `sim/site_config.mjs`
- Pages build: `.github/workflows/deploy.yml`. It builds **only tracked files in this repository**, using no pinned checkout of Kurzlernen.
- Verification: `node tests/standalone_source_test.mjs` and `node tests/site_config_test.mjs`.

The game sources were consolidated from `nostack-dev/kurzlernen-de@2165abec7f59fe2cc27e82db3bba7d5531aaa9f9` on 2026-10-16. The original `kurzlernen.de` remains a separate site and must not be repurposed as a game-source mirror. Game feature changes, bug fixes and changelog updates now belong only here.

## Build, Tests und echte Live-Auslieferung

Alle Spiel-Features und Releases werden **hier** in `main` gepflegt. Der Source-Build `.github/workflows/deploy.yml` erstellt die fertige Website in `gh-pages`; er liest keine Game-Dateien mehr aus Kurzlernen.

Aktive Qualitätssicherung:
- `pr-checks.yml`: Spielquellen, Konfiguration, Touchpad-Pointerlock, Changelog.
- `gameplay-regression.yml`: Gameplay-, FPS-, Desktop-, Mobile-, Multiplayer- und C++-Contracts bei PR und Push.
- `esp32-hil.yml`: Flugregler-/Hardware-Tests und ESP-IDF-Build.
- `published-browser-regressions.yml`: Echter Live-SHA, aktuelles Changelog und Chromium-Checks für Desktop, Mobile, Physik und Grafik.
- `player-suggestions.yml`: Tägliche Spielervorschläge aus Nostr (Ergebnisse als Action-Artifacts).
- `deploy.yml`: WebAssembly, eigenständiger Browser-Build, Veröffentlichung sowie **harte** Live-SHA-/Changelog-Prüfung (kein `continue-on-error`).

**Temporärer Pages-Transport:** Aktuell ist `spawncity.de` weiterhin dem persönlichen Repository `ChristianHohlfeld/spawncity-de` zugeordnet. Dessen Action erstellt keinen eigenen Game-Build mehr, sondern kopiert die fertig gebauten Dateien aus **diesem** `gh-pages` alle fünf Minuten in den live bedienten `gh-pages`-Branch. Der Spielcode bleibt ausschließlich in diesem Repo. Ein künftiger Umzug der Pages-Domain in GitHub Settings kann die Spiegelung entfernen. Bis dahin die persönliche Publishing-Action nicht wieder auf eigenständige alte Game-Builds umstellen.

Bei Änderungen am Spiel die Changelog-Einträge in `sim/changelog_menu.mjs` ergänzen (neuester Zeitpunkt zuerst); Built-Artifact und Live-Version müssen mit `build.json` dieselbe Commit-SHA nachweisen. Ein reiner Erfolg des Artifact-Pushs genügt **nicht** als Live-Nachweis.
