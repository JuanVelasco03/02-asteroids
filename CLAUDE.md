# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A from-scratch clone of the arcade game **Asteroids**, built with plain HTML5 Canvas and vanilla ES6+ JavaScript — no frameworks, no bundler, no dependencies, no build step. The entire game logic lives in one file: `game.js`.

## Running the game

Open `index.html` directly in a browser, or serve it locally:

```bash
npx serve .
```

Then visit `http://localhost:3000`. There is no build, lint, or test tooling in this repo — changes to `game.js` are live on page reload.

## Architecture

Everything is in `game.js`, organized top-to-bottom as: input handling → math utils → entity classes (`Bullet`, `Asteroid`, `Ship`, `Particle`) → game state → update loop → draw loop → main loop.

- **Fixed logical canvas size**: `W = 800`, `H = 600` (also set as `canvas` attributes in `index.html`). All entity positions are in these coordinates.
- **Toroidal space**: every entity wraps position via `wrap(v, max)` on both axes — there are no walls.
- **Input**: `keys[code]` tracks held state; `justPressed[code]`/`pressed(code)` tracks single-press edges (used for shooting and restart) and is consumed (reset to false) on read.
- **Entities are plain classes with `update(dt)` / `draw()`**, each carrying a `dead` flag. Dead entities are removed each frame via `array.filter(e => !e.dead)` rather than splicing in place.
- **Asteroids** have `size` 3 (large) → 1 (small); `RADII`, `SPEEDS`, `POINTS` arrays are indexed by size. `split()` produces two asteroids of `size - 1` (or `[]` at size 1). Each asteroid gets a random irregular polygon (`verts`) generated once at construction and rotated in `draw()`, not regenerated per frame.
- **Global mutable state** (`ship`, `bullets`, `asteroids`, `particles`, `score`, `lives`, `level`, `state`, `deadTimer`) lives at module scope, not inside a class/object. `state` is one of `'playing' | 'dead' | 'gameover'` and gates behavior in `update()`.
- **Collisions** are simple circle checks via `dist(a, b) < radiusSum` — bullets vs asteroids (O(n·m) nested loop) and ship vs asteroids (skipped while `ship.invincible > 0`).
- **Game loop**: `requestAnimationFrame`-driven; `dt` is delta time in seconds, clamped to `0.05` max to avoid large jumps after tab-switch/lag. `update(dt)` and `draw()` are called unconditionally every frame regardless of `state` (state-specific branching happens inside each).
- Respawn invincibility, level transitions (`nextLevel()`), and game-over/restart flow are handled inline in `update()`/`killShip()` rather than via a state machine abstraction — keep new features consistent with this direct-branching style rather than introducing one.

## Conventions

- UI text/strings (HUD, game-over screen) are in Spanish; keep new user-facing text consistent with that.
- Comment headers use the `// ── Section ──...` banner style to divide `game.js` into sections; follow this when adding a new section-level unit (e.g., a new entity type).
