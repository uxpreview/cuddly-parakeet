# The Long Way Home

A browser-based narrative walking game. A boy chases his dog across one day on
the Dalmatian coast, canyon to old town to woods to shore, and learns at his
own front gate that the dog was leading him home the whole time.

Full color, flat-shaded, one continuous day where color is the clock.
Target: 40 to 50 minutes, four chapters, desktop and mobile.

## Source of truth

Read these before writing code. They outrank your own judgment.

| Document | Governs |
|---|---|
| `docs/story.md` | Narrative, the four rules of the dog, chapters, what is never stated |
| `docs/game-design.md` | Verbs, the whistle, the dog actor, tracking, camera, manifest schema |
| `docs/art-direction.md` | Every visual decision, palettes, the red rule |
| `docs/quality-bar.md` | Gates, critic loops, budgets, the red audit, definition of done |

## Laws of the project

**Red belongs to the dog.** No red anywhere in the game except the collar and
the route line on the map. This is enforced by an automated audit and it is not
negotiable at any prop, texture or lighting level.

**The dog is never in peril.** No system in this game can harm him, and no
moment may imply harm. He waits at danger until the boy is through. He looks
back. He is never fleeing.

**The dog is an actor, not an AI.** He runs an authored node route from the
chapter manifest. Do not build companion AI, pathfinding beyond the route, or
any simulation of him.

**No wayfinding UI exists.** No compass, waypoint, minimap, objective text or
quest log. The whistle's answer and the readable trail are the navigation
system. If a playtester is lost, fix the staging, never add UI.

**Do not invent story content.** No dialogue, no narration, no lore, no text in
the world. If a moment seems to need words, the spatial design is failing. Fix
the space or ask.

**Chapters are data, not code.** The engine reads JSON manifests. Chapters 2
through 4 must require zero new engine code. If a chapter forces an engine
change, that is an engine bug. Fix the engine.

**Mobile is not a port.** Every chapter completable on a touchscreen with one
thumb, in portrait, and fully comprehensible with sound off. Test at every
gate.

**Report actual numbers.** At performance gates, measure. Never assert.

**Ask before adding a verb.** The game is walk, whistle, and a rare context
action. A fourth verb is a design change requiring the human.

## Stack

Vite, React Three Fiber, Zustand, deployed to Vercel as a standalone app.

## Build order

One gate per working session. Do not advance past a gate without the human.
Gates are defined in `docs/quality-bar.md`.

1. Grey box Chapter 1: walking, the dog actor on a real route, the whistle loop
2. Art bible: one canyon-morning scene that nails the look
3. The two characters: gaits, prints, node vocabulary, camera
4. Chapter engine: manifests, menu, save, route logging, the map screen
5. Chapter 1 complete, end to end, on a physical phone
6. Chapters 2 to 4 as manifests only
7. Performance and polish

## Constraints

Never scrape, download, or reproduce assets from any existing site, game or
asset store. Everything original, modeled and painted for this game's forms.
