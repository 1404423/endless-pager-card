# Changelog

## 1.0.0 (2026-10-16)
First public release. Developed and tested over 16 iterations on an iPhone (Home Assistant Companion app) against a smaller, finite pager first.
- Infinite horizontal paging on native `scroll-snap` scrolling; ~200 slots with lazily built cards (no clones, no jumps in normal use).
- Native vertical scrolling inside every page; pages whose content fits are locked (no vertical drag, no rubber band).
- Remembers the page when the dashboard tab is left and re-entered (Home Assistant detaches the card).
- Options: `pages`, `loop`, `top`, `slots`, `build_radius`, `keep_radius`, `debug`.
