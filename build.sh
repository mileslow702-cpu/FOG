#!/bin/sh
# game.js is the four source parts joined in order; no other build step
cd "$(dirname "$0")" && cat src/a_core.js src/b_world.js src/c_actors.js src/d_game.js > game.js
