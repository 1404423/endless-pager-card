/* endless-pager-card 1.1.0 (developed as v1-v16 in 2026-10) - "practically infinite" horizontal pager on NATIVE scrolling, with NO jump in normal use.
   Idea: a jump is only needed because a strip has an end. So make the strip very long instead (n pages repeated up to ~200 slots, you start in the middle:
   ~100 swipes to either side before an end), and keep it cheap by creating the real cards LAZILY: all slots are empty placeholders (a div each), the cards
   are built only for the slots near the viewport (+-3) and dropped again when far (+-8). Slot s shows page s mod n; the dots show s mod n.
   Nothing ever touches the scroll position while you swipe, and in normal use nothing touches it at all. (A safety jump back to the middle exists for the day someone swipes
   100 pages in one direction; it only runs when idle and is invisible because slot s and slot s+-k*n show the same page.)
   Vertical: each page is a scroll container; a page whose content has (almost) no overflow is locked by CSS (overflow-y:hidden + touch-action:pan-x).
   Config: type: custom:endless-pager-card / pages: [card configs] / loop: true / top: <css length> / debug: false */
class EndlessPagerCard extends HTMLElement {
  static getStubConfig() {             // what the card picker adds: two small pages to start from
    return { type: "custom:endless-pager-card", pages: [{ type: "markdown", content: "Page 1" }, { type: "markdown", content: "Page 2" }] };
  }
  static getConfigElement() { return document.createElement("endless-pager-card-editor"); }
  static getConfigForm() {             // the visual editor (Home Assistant's own form); `pages` is a YAML box in it (the list of card configurations)
    const num = (name, min, max) => ({ name, selector: { number: { min, max, mode: "box" } } });
    const labels = { pages: "Pages (list of cards)", loop: "Endless paging", top: "Top offset (CSS length)", slots: "Strip length (slots)", build_radius: "Build radius", keep_radius: "Keep radius", debug: "Debug panel", edge_width: "Left-edge swipe (px, 0 = off)" };
    const helpers = {
      pages: "One card configuration per page, as a YAML list. Add an item to add a page.",
      loop: "Off = a normal strip with two ends. Default: on.",
      top: "Where the pager starts, below the Home Assistant header. Default: calc(56px + env(safe-area-inset-top, 0px)).",
      slots: "About how many slots the strip has; you start in the middle. Default: 200.",
      build_radius: "Cards are built for the slots this close to the current one. Default: 3.",
      keep_radius: "Cards farther away are dropped again to free memory. Default: 8.",
      debug: "Shows a small panel with slot, cards alive and scroll position.",
      edge_width: "A swipe to the right that starts this many pixels from the left edge opens the Home Assistant sidebar instead of paging. 0 = off. Default: 24.",
    };
    return {
      schema: [
        { name: "pages", selector: { object: {} } },
        { name: "loop", selector: { boolean: {} } },
        { name: "top", selector: { text: {} } },
        num("slots", 20, 2000), num("build_radius", 1, 10), num("keep_radius", 2, 30),
        { name: "debug", selector: { boolean: {} } },
        num("edge_width", 0, 60),
      ],
      computeLabel: (schema) => labels[schema.name] || schema.name,
      computeHelper: (schema) => helpers[schema.name],
    };
  }
  setConfig(config) {
    if (!config || !Array.isArray(config.pages) || !config.pages.length) throw new Error("pages: [..] is required");
    this._config = { loop: true, top: "calc(56px + env(safe-area-inset-top, 0px))", ...config };
    if (this.isConnected && !this._built && !this._building) this._build();
  }
  connectedCallback() {
    this._lockDocument(true);
    if (this._built) {                 // HA detaches / re-attaches the card when you switch tabs: the browser has reset scrollLeft to 0 meanwhile and the poll was stopped
      this._ready = false; this._starting = false; this._startPoll(); this._start();
      requestAnimationFrame(() => this._start()); setTimeout(() => this._start(), 100); setTimeout(() => this._start(), 400);
    } else if (this._config && !this._building) this._build();
  }
  disconnectedCallback() { clearInterval(this._poll); this._poll = null; this._ready = false; if (this._ro) this._ro.disconnect(); this._lockDocument(false); }
  _startPoll() { if (!this._poll) this._poll = setInterval(() => this._tick(), 150); if (this._ro && this._vp) { this._ro.disconnect(); this._ro.observe(this._vp); } }
  set hass(h) { this._hass = h; if (this._built) this._push(); }
  set preview(v) { this._preview = !!v; this.toggleAttribute("preview", !!v); }          // Home Assistant sets it in the card editor / picker: show a small box there, not the whole panel
  get preview() { return !!this._preview; }
  getCardSize() { return 8; }

  _lockDocument(on) {
    const els = [document.documentElement, document.body];
    if (on) { this._savedOB = els.map((e) => e.style.overscrollBehavior); els.forEach((e) => { e.style.overscrollBehavior = "none"; }); }
    else if (this._savedOB) els.forEach((e, i) => { e.style.overscrollBehavior = this._savedOB[i]; });
  }

  async _build() {
    this._building = true;
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const n = this._config.pages.length, loop = this._config.loop && n > 1;
    const N = loop ? n * Math.max(3, Math.ceil((this._config.slots || 200) / n)) : n;                 // number of slots (about `slots`, default 200)
    root.innerHTML = `
      <style>
        :host { display: block; position: fixed; top: var(--endless-pager-top); left: 0; right: 0; bottom: 0; overflow: hidden; }
        :host([preview]) { position: relative; top: auto; left: auto; right: auto; bottom: auto; height: 420px; border-radius: 12px; }
        .vp { height: 100%; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; overscroll-behavior: none; scrollbar-width: none; touch-action: pan-x pan-y; }
        .vp::-webkit-scrollbar, .page::-webkit-scrollbar { display: none; }
        .page { position: relative; flex: 0 0 100%; width: 100%; height: 100%; box-sizing: border-box;      /* relative: the containing block of the cards' own absolute-positioned page titles */ scroll-snap-align: start; scroll-snap-stop: always;
                overflow-x: hidden; overflow-y: auto; overscroll-behavior: none; scrollbar-width: none; touch-action: pan-x pan-y; padding: 4px 6px 44px; -webkit-overflow-scrolling: touch; }
        .page.fit { overflow-y: hidden; touch-action: pan-x; }
        .page > * { display: block; margin-bottom: 8px; }
        .dots { position: absolute; left: 0; right: 0; bottom: 10px; display: flex; justify-content: center; gap: 8px; pointer-events: none; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--secondary-text-color, #888); opacity: .35; }
        .dot.on { opacity: 1; background: var(--primary-color, #03a9f4); }
      </style><div class="vp"></div><div class="dots"></div>`;
    this.style.setProperty("--endless-pager-top", String(this._config.top));     // a CSS variable, not text pasted into the template: `top` can never become markup
    const vp = this._vp = root.querySelector(".vp"), dots = root.querySelector(".dots");
    for (let i = 0; i < n; i++) dots.appendChild(Object.assign(document.createElement("div"), { className: "dot" }));
    this._build_r = this._config.build_radius ?? 3; this._keep_r = Math.max(this._build_r + 1, this._config.keep_radius ?? 8);
    this._dots = [...dots.children]; this._n = n; this._N = N; this._loop = loop; this._pages = []; this._cards = new Map(); this._making = new Set();
    this._key = this._config.key || (JSON.stringify(this._config.pages).length + ":" + JSON.stringify(this._config.pages).slice(0, 120));
    const saved = (EndlessPagerCard._mem && EndlessPagerCard._mem.get(this._key)) || 0;       // page you were on when this card was last alive
    this._mid = (loop ? Math.floor(N / 2 / n) * n : 0) + (saved % n);                      // start slot: in the middle of the strip, on that page
    const frag = document.createDocumentFragment();
    for (let s = 0; s < N; s++) { const page = document.createElement("div"); page.className = "page"; frag.appendChild(page); this._pages.push(page); }
    vp.appendChild(frag);
    this._helpers = await window.loadCardHelpers();
    this._built = true; this._building = false;
    this._ensureAround(this._mid, this._build_r);                                 // cards exist even if the view is still hidden / not laid out

    const act = () => { this._lastAct = performance.now(); };
    vp.addEventListener("scroll", act, { capture: true, passive: true });          // also the vertical scrolling inside a page
    vp.addEventListener("scroll", () => { if (!this._raf) { this._raf = true; requestAnimationFrame(() => { this._raf = false; this._dotsUpdate(); }); } }, { passive: true });
    vp.addEventListener("pointerdown", () => { this._down = true; act(); }, { capture: true, passive: true });
    const up = () => { this._down = false; act(); };
    vp.addEventListener("pointerup", up, { capture: true, passive: true }); vp.addEventListener("pointercancel", up, { capture: true, passive: true });
    const W = this._config.edge_width ?? 24;
    if (W > 0) {                                                    // a swipe to the right that starts at the left edge opens the HA sidebar (instead of paging)
      let e = null;
      const end = () => { e = null; };
      vp.addEventListener("touchstart", (ev) => { const t = ev.touches[0]; e = ev.touches.length === 1 && t.clientX <= W ? { x: t.clientX, y: t.clientY, done: false } : null; }, { capture: true, passive: true });
      vp.addEventListener("touchmove", (ev) => {
        if (!e || e.done) return;
        const t = ev.touches[0], dx = t.clientX - e.x, dy = t.clientY - e.y;
        if (dx > 3 && dx > Math.abs(dy) * 1.5) {                                        // decided on the first moves, while the browser can still be told not to scroll
          e.done = true; if (ev.cancelable) ev.preventDefault();
          this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true, detail: { open: true } }));
        } else if (Math.abs(dy) > 8) e = null;                                          // mostly vertical: a normal scroll
      }, { capture: true, passive: false });
      vp.addEventListener("touchend", end, { capture: true, passive: true }); vp.addEventListener("touchcancel", end, { capture: true, passive: true });
    }
    this._ro = new ResizeObserver(() => {
      const w = vp.clientWidth;
      if (!w) { this._hidden = true; return; }
      if (!this._ready) { this._start(); return; }                                  // view not shown (another tab): the browser resets scrollLeft to 0 - do not trust the position now
      if (this._ready && (this._hidden || w !== this._w)) {                    // shown again / resized: go back to the slot the user was on
        this._restoring = performance.now(); vp.scrollLeft = (this._lastSlot ?? this._mid) * w; this._ensureAround(this._lastSlot ?? this._mid, this._build_r);
      }
      this._hidden = false; this._w = w;
    }); this._ro.observe(vp);

    requestAnimationFrame(() => this._start()); setTimeout(() => this._start(), 60); setTimeout(() => this._start(), 300);
    this._startPoll();
    if (this._config.debug) this._debugInit();
  }

  async _start() {                     // first positioning: needs a real layout (width > 0); retried by the resize observer and by the tick until it succeeds
    const vp = this._vp; if (this._ready || this._starting || !vp || !vp.clientWidth) return; this._starting = true;
    await this._ensureAround(this._lastSlot ?? this._mid, this._build_r);
    if (!vp.clientWidth) { this._starting = false; return; }
    this._w = vp.clientWidth; vp.scrollLeft = (this._lastSlot ?? this._mid) * this._w; this._ready = true; this._starting = false; this._hidden = false; this._measure(); this._dotsUpdate();
  }
  _slot() { return Math.max(0, Math.min(this._N - 1, Math.round(this._vp.scrollLeft / (this._vp.clientWidth || 1)))); }
  _real(s) { return (s ?? this._slot()) % this._n; }
  _dotsUpdate() {
    if (this._vp.clientWidth && !this._hidden && !(this._restoring && performance.now() - this._restoring < 400)) this._lastSlot = this._slot();
    const r = this._real(this._lastSlot); this._dots.forEach((d, k) => d.classList.toggle("on", k === r));
  }

  async _make(s) {                     // build the card of slot s (once)
    if (s < 0 || s >= this._N || this._cards.has(s) || this._making.has(s)) return; this._making.add(s);
    let el; try { el = await this._helpers.createCardElement(this._config.pages[s % this._n]); } catch (e) { el = document.createElement("div"); el.textContent = "card error: " + e; }
    this._making.delete(s); if (this._hass) el.hass = this._hass;
    this._pages[s].appendChild(el); this._cards.set(s, el);
  }
  async _ensureAround(s, r) { const jobs = []; for (let k = s - r; k <= s + r; k++) jobs.push(this._make(k)); await Promise.all(jobs); }
  _drop(s, r) {                        // free the cards far from the viewport
    for (const [k, el] of this._cards) if (Math.abs(k - s) > r) { el.remove(); this._cards.delete(k); this._pages[k].classList.remove("fit"); }
  }
  _tick() {
    if (!this._ready) { this._start(); return; }
    if ( !this._vp.clientWidth || this._hidden || (this._restoring && performance.now() - this._restoring < 400)) return;
    const s = this._slot(); this._lastSlot = s; (EndlessPagerCard._mem = EndlessPagerCard._mem || new Map()).set(this._key, s % this._n);   // (also saved here: scroll events can be throttled)
    const left = this._vp.scrollLeft, moved = left !== this._lastLeft; this._lastLeft = left; if (moved) this._lastAct = performance.now();
    if (!this._down) this._ensureAround(s, this._build_r);                    // cards for the next swipes are built between swipes, never during one
    const idle = !this._down && performance.now() - (this._lastAct || 0) > 400;
    if (!idle) return;
    this._drop(s, this._keep_r);
    if (this._loop && (s <= 2 || s >= this._N - 3)) {                           // safety net only: ~100 pages in one direction
      const to = s + this._n * Math.round((this._N / 2 - s) / this._n);
      this._ensureAround(to, 1).then(() => { if (!this._down && Math.abs(this._slot() - s) === 0) { this._cards.get(to) && (this._pages[to].scrollTop = this._pages[s].scrollTop); this._vp.scrollLeft = to * this._vp.clientWidth; this._jumps = (this._jumps || 0) + 1; this._lastAct = performance.now(); } });
    }
    if (performance.now() - (this._lastMeasure || 0) > 500) { this._lastMeasure = performance.now(); this._measure(); }
    this._push();
  }
  _measure() { for (const [k] of this._cards) { const p = this._pages[k]; p.classList.toggle("fit", p.clientHeight > 0 && p.scrollHeight - p.clientHeight <= 12); } }
  _push() {                            // pages in view and their neighbours get HA state
    if (!this._hass) return; const s = this._ready ? this._slot() : this._mid;
    for (const [k, el] of this._cards) if (Math.abs(k - s) <= 1 && el.hass !== this._hass) el.hass = this._hass;
  }

  _debugInit() {
    const box = document.createElement("pre");
    box.style.cssText = "position:absolute;left:4px;top:4px;right:4px;margin:0;padding:6px 8px;background:rgba(0,0,0,.78);color:#9f9;font:10px/1.25 ui-monospace,Menlo,monospace;z-index:99;pointer-events:none;white-space:pre-wrap;border-radius:8px;";
    this.shadowRoot.appendChild(box); const vp = this._vp;
    setInterval(() => { box.textContent = "pager v15  slots " + this._N + "  slot " + this._slot() + "  page P" + (this._real() + 1) + "  cards alive " + this._cards.size + "  jumps " + (this._jumps || 0) +
      "\nscrollLeft " + Math.round(vp.scrollLeft) + "  clientW " + vp.clientWidth + "  ready " + !!this._ready + "  hidden " + !!this._hidden + "  lastSlot " + this._lastSlot; }, 300);
  }
}
customElements.define("endless-pager-card", EndlessPagerCard);

// The card editor: a list of the pages with add / delete / move buttons, the other options as Home Assistant's own form, `pages` as YAML in a fold.
class EndlessPagerCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config; if (!this._root) this._init();
    for (const f of this._forms) f.data = config;
    this._rows();
  }
  set hass(h) { this._hass = h; if (this._forms) for (const f of this._forms) f.hass = h; }
  _init() {
    const root = this._root = this.attachShadow({ mode: "open" }), form = EndlessPagerCard.getConfigForm();
    root.innerHTML = `<style>
      .row { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid var(--divider-color, #ddd); }
      .row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      button { font: inherit; min-width: 40px; min-height: 40px; border: 1px solid var(--divider-color, #ccc); border-radius: 8px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #000); }
      button:disabled { opacity: .35; }
      .add { width: 100%; margin: 8px 0; color: var(--primary-color, #03a9f4); }
      summary { margin: 8px 0; cursor: pointer; }
    </style><div class="rows"></div><button class="add">+ Add page</button><details><summary>Edit pages as YAML</summary><ha-form class="fp"></ha-form></details><ha-form class="fo"></ha-form>`;
    const mk = (cls, schema) => {
      const f = root.querySelector(cls); f.schema = schema; f.computeLabel = form.computeLabel; f.computeHelper = form.computeHelper; if (this._hass) f.hass = this._hass;
      f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._emit({ ...ev.detail.value }); }); return f;
    };
    this._forms = [mk(".fp", form.schema.filter((s) => s.name === "pages")), mk(".fo", form.schema.filter((s) => s.name !== "pages"))];
    root.querySelector(".add").addEventListener("click", () => { const p = this._pages(); this._emit({ ...this._config, pages: [...p, { type: "markdown", content: "Page " + (p.length + 1) }] }); });
  }
  _label(i, p) { return (i + 1) + ". " + ((p && p.type) || "card") + (p && p.content ? " - " + String(p.content).slice(0, 24) : ""); }
  _pages() { return Array.isArray(this._config.pages) ? this._config.pages : []; }
  _emit(config, rebuild = true) {
    this._config = config; for (const f of this._forms) f.data = config; if (rebuild) { this._open = -1; this._rows(); }
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
  _rows() {
    const box = this._root.querySelector(".rows"), pages = this._pages(); box.textContent = "";
    pages.forEach((p, i) => {
      const row = document.createElement("div"); row.className = "row";
      const label = document.createElement("span"); label.textContent = this._label(i, p); row.appendChild(label);
      const btn = (text, title, disabled, fn) => { const b = document.createElement("button"); b.textContent = text; b.title = title; b.disabled = disabled; b.addEventListener("click", fn); row.appendChild(b); };
      const move = (d) => { const a = [...pages]; [a[i], a[i + d]] = [a[i + d], a[i]]; this._emit({ ...this._config, pages: a }); };
      btn("\u270E", "Edit this page (YAML)", false, () => { this._open = this._open === i ? -1 : i; this._rows(); });
      btn("\u2191", "Move up", i === 0, () => move(-1)); btn("\u2193", "Move down", i === pages.length - 1, () => move(1));
      btn("\u{1F5D1}", "Delete page", pages.length < 2, () => this._emit({ ...this._config, pages: pages.filter((_, k) => k !== i) }));
      box.appendChild(row);
      if (this._open === i) {                 // the YAML of this one page, right under its row; typing in it does not rebuild the list (keeps the focus)
        const f = document.createElement("ha-form"); f.className = "fpage"; f.data = { page: p }; f.schema = [{ name: "page", selector: { object: {} } }];
        f.computeLabel = () => "Page " + (i + 1) + " (card configuration)"; if (this._hass) f.hass = this._hass;
        f.addEventListener("value-changed", (ev) => {
          ev.stopPropagation(); const a = [...this._pages()]; a[i] = ev.detail.value.page; this._emit({ ...this._config, pages: a }, false);
          label.textContent = this._label(i, a[i]);
        });
        box.appendChild(f);
      }
    });
  }
}
customElements.define("endless-pager-card-editor", EndlessPagerCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "endless-pager-card", name: "Endless Pager Card", description: "Infinite horizontal pager with native scrolling (scroll-snap) and native vertical scrolling inside each page", preview: false, documentationURL: "https://github.com/1404423/endless-pager-card" });
