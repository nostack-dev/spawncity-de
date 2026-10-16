# SpawnCity — Betrieb und Zuständigkeit

## Verbindliches Hauptrepository
- **`nostack-dev/spawncity-de`** ist die einzige Quelle für Spielentwicklung, Spiellogik, Assets, Gamepad-/Touch-/Maussteuerung, Tests und Changelog.
- Die ursprüngliche Codebasis wurde am 2026-10-16 aus `nostack-dev/kurzlernen-de` (Snapshot `2165abec7f59fe2cc27e82db3bba7d5531aaa9f9`) übernommen.
- `nostack-dev/kurzlernen-de` ist **kein** Entwicklungsrepository für SpawnCity mehr. Dort keine Änderungen an Simulator-Code und keine neuen Spiel-Releases durchführen.

## Spiel und Build
- `drone_simulator.html` ist die HTML-Einstiegsseite, `drone_controller.html` die Fernsteuerung.
- `sim/` und `esp32/` enthalten die vollständigen spielrelevanten Quellen und Assets, inklusive Audio und Icons.
- `sim/changelog_menu.mjs` ist das Changelog (absteigend nach Erscheinungszeit).
- `sim/site_config.mjs` ist die zentrale Website-/Raum-Konfiguration.
- `.github/workflows/deploy.yml` baut ausschließlich aus diesem Repository und importiert **nicht** mehr aus Kurzlernen.
- `node tests/site_config_test.mjs` und `node tests/standalone_source_test.mjs` schützen Host, Multiplayer-Raum, Dateivollständigkeit und Changelog.
- Die Veröffentlichung baut WebAssembly, bundelt Simulator und Controller selbstenthaltend und veröffentlicht auf `gh-pages`, wenn die Pages-API die Workflow-Veröffentlichung nicht erlaubt.

## Seiten und Domain
- Game: `https://spawncity.de/drone_simulator.html`
- Einstieg `/`: `index.html` führt zum Game.
- Remote: `https://spawncity.de/drone_controller.html`
- `CNAME` ist `spawncity.de`.
- Die GitHub-Pages-Einstellung muss auf die tatsächliche Veröffentlichungsmethode (`gh-pages` oder Actions) zeigen.
- Multiplayer-ID: `arondight45-spawncity-vs-v1`. Ändert man sie, müssen alle offenen Clients neu laden.
- `kurzlernen.de` bleibt **eine eigenständige Website**. Weder die gesamte Domain noch ihre fremden Inhalte pauschal umleiten.

## DNS (nur bei einer tatsächlichen Umstellung prüfen)
Die aktuellen GitHub-Pages-IP-Adressen und Domainverifikation unbedingt anhand der offiziellen GitHub-Pages-Dokumentation prüfen, bevor DNS geändert wird. Dieser Repository-Umzug benötigt **keine** DNS-Änderung.

## Regel für zukünftige Bots
Bei Feature-Arbeiten am Spiel ausschließlich `nostack-dev/spawncity-de` ändern. Niemals den alten Kurzlernen-Simulator aktualisieren oder über einen Fetch aus Kurzlernen wieder zum Build-Input machen.
