# Changelog

## 1.2.0 (2026-11-16)
* New option `edge_width` (default 24, `0` = off, also in the card editor): a swipe to the right that starts within `edge_width` px of the left edge opens the Home Assistant sidebar (`hass-toggle-menu`) instead of paging. **On by default**: with the default a swipe that starts within the first 24 px no longer pages; set `edge_width: 0` to get the old behaviour.

## 1.1.0 (2026-10-25)
* Visual editor: the pages are a list with add, delete, move and edit buttons (the edit button opens the YAML of that one page under its row; all pages as YAML stay available in a fold); `loop`, `top`, `slots`, `build_radius`, `keep_radius` and `debug` can be changed in the card editor (Home Assistant's own form).
* The card picker adds the card with two small example pages (`getStubConfig`), instead of an error about missing `pages`.
* The card picker entry has `preview: false` (the card fills the whole panel, so it cannot be shown as a small preview) and a link to the documentation.
* The logic test now also checks the stub config, the editor fields and the registration.

## 1.0.1 (2026-10-24)
Security hardening from the HACS review: the `top` option was pasted into the card's HTML template as text. It is now passed as a CSS variable (`--endless-pager-top`, set with `style.setProperty`), so a crafted value can no longer become markup. Behaviour is unchanged; the logic test passes at phone size.

## 1.0.0 (2026-10-16)
First public release. Developed and tested over 16 iterations on an iPhone (Home Assistant Companion app) against a smaller, finite pager first.
- Infinite horizontal paging on native `scroll-snap` scrolling; ~200 slots with lazily built cards (no clones, no jumps in normal use).
- Native vertical scrolling inside every page; pages whose content fits are locked (no vertical drag, no rubber band).
- Remembers the page when the dashboard tab is left and re-entered (Home Assistant detaches the card).
- Options: `pages`, `loop`, `top`, `slots`, `build_radius`, `keep_radius`, `debug`.
