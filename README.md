# SpawnCity

Multiplayer drone and city simulator. Players open the game at https://spawncity.de/drone_simulator.html.

GitHub Pages deploys `main` with `.github/workflows/deploy.yml`. The workflow imports the game from `nostack-dev/kurzlernen-de` at `1508ec0f28d71b5cf9b6cd922335f856177012ef`, then publishes it for spawncity.de.

`CNAME` is exactly `spawncity.de`. kurzlernen.de stays on `nostack-dev/kurzlernen-de`.

DomainFactory DNS records are in `docs/SPAWNCITY_DEPLOY.md`.
