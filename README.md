# spawncity.de

SpawnCity runs on [Kern](https://kernengine.de): C++20 compiled to WebAssembly, WebGL2, Box3D.
Its source is the game in [ChristianHohlfeld/kernengine.de](https://github.com/ChristianHohlfeld/kernengine.de)
(`kern/games/spawncity`).

This repository only publishes it: `.github/workflows/deploy.yml` takes Kern's built drop-in
(the branch `spawncity-de-dropin` of kernengine.de, made by its CI from every green `main`) and
puts it on GitHub Pages under spawncity.de. It runs on every push here, every 30 minutes and by
hand (Actions → Deploy SpawnCity → Run workflow).

The former JavaScript version is kept in the branches `legacy-javascript` (source) and
`legacy-javascript-pages` (its last published site).
