/* remote-pager-card 1.0.0 (developed as v1-v16 in 2026-10) - "practically infinite" horizontal pager on NATIVE scrolling, with NO jump in normal use.
   Idea: a jump is only needed because a strip has an end. So make the strip very long instead (n pages repeated up to ~200 slots, you start in the middle:
   ~100 swipes to either side before an end), and keep it cheap by creating the real cards LAZILY: all slots are empty placeholders (a div each), the cards
   are built only for the slots near the viewport (+-3) and dropped again when far (+-8). Slot s shows page s mod n; the dots show s mod n.
   Nothing ever touches the scroll position while you swipe, and in normal use nothing touches it at all. (A safety jump back to the middle exists for the day someone swipes
   100 pages in one direction; it only runs when idle and is invisible because slot s and slot s+-k*n show the same page.)
   Vertical: each page is a scroll container; a page whose content has (almost) no overflow is locked by CSS (overflow-y:hidden + touch-action:pan-x).
   Config: type: custom:remote-pager-card / pages: [card configs] / loop: true / top: <css length> / debug: false */
class RemotePagerCard extends HTMLElement {
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
        :host { display: block; position: fixed; top: ${this._config.top}; left: 0; right: 0; bottom: 0; overflow: hidden; }
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
    const vp = this._vp = root.querySelector(".vp"), dots = root.querySelector(".dots");
    for (let i = 0; i < n; i++) dots.appendChild(Object.assign(document.createElement("div"), { className: "dot" }));
    this._build_r = this._config.build_radius ?? 3; this._keep_r = Math.max(this._build_r + 1, this._config.keep_radius ?? 8);
    this._dots = [...dots.children]; this._n = n; this._N = N; this._loop = loop; this._pages = []; this._cards = new Map(); this._making = new Set();
    this._key = this._config.key || (JSON.stringify(this._config.pages).length + ":" + JSON.stringify(this._config.pages).slice(0, 120));
    const saved = (RemotePagerCard._mem && RemotePagerCard._mem.get(this._key)) || 0;       // page you were on when this card was last alive
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
    const s = this._slot(); this._lastSlot = s; (RemotePagerCard._mem = RemotePagerCard._mem || new Map()).set(this._key, s % this._n);   // (also saved here: scroll events can be throttled)
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
customElements.define("remote-pager-card", RemotePagerCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "remote-pager-card", name: "Remote Pager Card", description: "Infinite horizontal pager with native scrolling (scroll-snap) and native vertical scrolling inside each page" });
