# LOW VISIBILITY

A Miles Low first-person shooter — Do Better Network.

Static site, no build server: open `index.html`. The game code is `game.js`, which is the four files in `src/`
joined in order (`./build.sh` rebuilds it after edits):

- `src/a_core.js` — renderer, height fog, post-processing, textures, collision
- `src/b_world.js` — the Westside neighborhood (built from `layout.js`), quarantine fence, sky and the Strip
- `src/c_actors.js` — audio, effects, Haze Runners, drones, neighbors, first-person weapons
- `src/d_game.js` — player movement, combat, AI, HUD, menus, settings, input

`layout.js` lays out the streets, houses and props. The 3D models are packed into
`world.model.js`, `runner.model.js` and `michelle.model.js` (generated with Higgsfield).

Soundtrack: add songs to `CONFIG.tracks` at the top of `src/a_core.js` as `{ title, src }` and drop the
MP3s in a `music/` folder — or load MP3s in-game from SETTINGS. M toggles the music.
