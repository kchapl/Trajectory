# trajectory

A single-user, browser-based tool for setting long-term ambitions and tracing implementation work back up to them. No account, no server, no database — see `docs/adr/0001-local-first-static-app-with-browser-store.md`.

## Run it

ES modules need a real origin, so serve the folder rather than opening the file:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works (`npx serve`, `php -S`, GitHub Pages); there is nothing to build and nothing to install.

## Test it

The domain model is pure and tested with Node's built-in runner, no dependencies:

```sh
node --test test/domain.test.mjs
```

## Where things are

- `src/domain.js` — the model: Quarters, carry-forward, gaps, review, Rank, Stages, Effort, the Inbox. Pure, no DOM, no storage.
- `src/store.js` — browser storage and the JSON export/import that makes the state portable.
- `src/app.js` — the shell: Planning and Implementation modes, the board, the Time Box timer.
- `CONTEXT.md` — the vocabulary. Read it before naming anything.

## Design

The interface is Material 3, built to the spec rather than themed by hand:

- `src/tokens.css` — **generated**, and the only file with a colour, a font size, a radius or a duration in it. 46 colour roles (light and dark), the fifteen type styles, the shape scale, elevation 0–5, state-layer opacities and the motion easings.
- `src/m3.css` — the component layer: buttons, icon buttons, segmented button, chips, cards, outlined text field with a floating label, checkbox, top app bar, menu, dialog, snackbar, state layers and ripple.
- `src/styles.css` — layout only. It composes those components and reads tokens; it never invents a value.

The palette is derived from one seed, `#a8431f`, by the official Material Color Utilities, so every role is a tonal-palette tone rather than a chosen hex:

```sh
npm install --no-save @material/material-color-utilities
node tools/make-tokens.mjs
```

That rewrites `src/tokens.css` for both schemes. Change `SEED` in `tools/make-tokens.mjs` to re-derive the whole palette.
