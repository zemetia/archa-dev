/*
 * In-page helper library for the agent browser (blueprint BROWSER). Injected with
 * Runtime.evaluate before each call; installs `window.__archa` once per document.
 * Plain JS in a string: it runs in the page, not in Node. No backticks or `${` inside.
 */
export const PAGE_LIB = String.raw`(() => {
  if (window.__archa && window.__archa.v === 1) return;
  const refs = new Map();
  let seq = 0;
  const INTERACTIVE_ROLES = new Set(['button','link','checkbox','radio','switch','tab','menuitem','menuitemcheckbox','menuitemradio','option','textbox','searchbox','combobox','listbox','slider','spinbutton','treeitem','file']);
  const LANDMARKS = new Set(['navigation','main','banner','contentinfo','form','dialog','list','table','heading','img','iframe','video','region','search','complementary','tablist','menu','listbox','alert']);
  const clean = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function role(el) {
    const explicit = (el.getAttribute('role') || '').split(' ')[0];
    if (explicit) return explicit;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return el.hasAttribute('href') ? 'link' : '';
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (ty === 'hidden') return '';
      const m = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', submit: 'button', button: 'button', reset: 'button', image: 'button', file: 'file', search: 'searchbox' };
      return m[ty] || 'textbox';
    }
    if (t === 'textarea') return 'textbox';
    if (t === 'select') return el.multiple ? 'listbox' : 'combobox';
    if (t === 'img') return 'img';
    if (/^h[1-6]$/.test(t)) return 'heading';
    const m = { nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', form: 'form', dialog: 'dialog', ul: 'list', ol: 'list', table: 'table', iframe: 'iframe', video: 'video', aside: 'complementary', section: el.hasAttribute('aria-label') ? 'region' : '' };
    return m[t] || '';
  }

  function name(el) {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria, 80);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const txt = by.split(' ').map((id) => { const n = document.getElementById(id); return n ? n.innerText : ''; }).join(' ');
      if (txt.trim()) return clean(txt, 80);
    }
    const t = el.tagName.toLowerCase();
    if (t === 'input' || t === 'textarea' || t === 'select') {
      if (el.labels && el.labels[0]) return clean(el.labels[0].innerText, 80);
      if (el.placeholder) return clean(el.placeholder, 80);
      if (t === 'input' && /^(submit|button|reset)$/i.test(el.type)) return clean(el.value, 80);
      if (t === 'select') return clean(el.title, 80);
    }
    if (t === 'img') return clean(el.alt || el.title, 80);
    if (el.title) return clean(el.title, 80);
    return clean(el.innerText || el.textContent, 80);
  }

  function hidden(el) {
    const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || el.hidden;
  }

  function interactive(el, r, parentPointer) {
    if (INTERACTIVE_ROLES.has(r)) return true;
    if (el.isContentEditable && !(el.parentElement && el.parentElement.isContentEditable)) return true;
    if (el.hasAttribute('onclick')) return true;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && +ti >= 0) return true;
    return !parentPointer && getComputedStyle(el).cursor === 'pointer';
  }

  function refFor(el) {
    let id = el.getAttribute('data-archa-ref');
    if (!id || refs.get(id) !== el) { id = 'e' + (++seq); el.setAttribute('data-archa-ref', id); }
    refs.set(id, el);
    return id;
  }

  function kids(el) {
    if (el.tagName === 'SLOT') return el.assignedElements({ flatten: true });
    if (el.shadowRoot) return Array.from(el.shadowRoot.children);
    return Array.from(el.children);
  }

  function ownText(el) {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.textContent;
    return clean(s, 160);
  }

  function inViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  function info() {
    // documentElement is briefly null while a navigation commits.
    const d = document.documentElement ?? { scrollWidth: 0, scrollHeight: 0 };
    return { url: location.href, title: document.title, vw: innerWidth, vh: innerHeight, sx: Math.round(scrollX), sy: Math.round(scrollY), pw: d.scrollWidth, ph: d.scrollHeight };
  }

  function snapshot(opts) {
    opts = opts || {};
    const lines = [];
    const max = 700, maxChars = 30000;
    let chars = 0, skipped = 0;
    const push = (depth, line) => {
      if (lines.length >= max || chars > maxChars) { skipped++; return; }
      const l = '  '.repeat(depth) + '- ' + line;
      lines.push(l); chars += l.length;
    };
    const walk = (el, depth, parentPointer) => {
      if (hidden(el)) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'head' || el.id === '__archa_labels') return;
      const rect = el.getBoundingClientRect();
      const hasBox = rect.width > 0 && rect.height > 0;
      const r = role(el);
      const pointer = parentPointer || getComputedStyle(el).cursor === 'pointer';
      const inter = hasBox && interactive(el, r, parentPointer);
      const visibleHere = !opts.viewportOnly || inViewport(rect);
      if (inter && visibleHere) {
        let line = (r || tag) + ' "' + name(el) + '" [ref=' + refFor(el) + ']';
        if (r === 'link') line += ' → ' + clean(el.getAttribute('href'), 80);
        if (tag === 'select' && el.selectedOptions && el.selectedOptions[0]) line += ' selected="' + clean(el.selectedOptions[0].text, 60) + '" options=' + el.options.length;
        else if ((r === 'textbox' || r === 'searchbox' || r === 'spinbutton' || r === 'combobox') && el.value) line += ' value="' + clean(el.value, 60) + '"';
        if ((r === 'checkbox' || r === 'radio' || r === 'switch') && (el.checked || el.getAttribute('aria-checked') === 'true')) line += ' checked';
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') line += ' disabled';
        if (el.getAttribute('aria-expanded')) line += ' expanded=' + el.getAttribute('aria-expanded');
        push(depth, line);
        // A link or button is named by its content; descend only into big composite widgets.
        if (r === 'link' || r === 'button' || r === 'textbox' || r === 'searchbox' || r === 'combobox' || r === 'option' || r === 'menuitem' || r === 'tab') return;
        for (const c of kids(el)) walk(c, depth + 1, pointer);
        return;
      }
      let next = depth;
      if (!opts.interactiveOnly && hasBox && visibleHere) {
        if (r === 'heading') { push(depth, 'heading' + (tag[1] ? ' ' + tag[1] : '') + ' "' + name(el) + '"'); return; }
        if (r === 'img') { push(depth, 'img "' + name(el) + '"'); return; }
        if (r === 'iframe') { push(depth, 'iframe → ' + clean(el.src, 100) + ' (not traversed; use cdp for its content)'); return; }
        if (LANDMARKS.has(r)) { push(depth, r + (el.getAttribute('aria-label') ? ' "' + clean(el.getAttribute('aria-label'), 60) + '"' : '')); next = depth + 1; }
        const own = ownText(el);
        if (own) push(next, 'text "' + own + '"');
      }
      for (const c of kids(el)) walk(c, next, pointer);
    };
    let root = document.body || document.documentElement;
    if (opts.target) root = resolve(opts.target);
    walk(root, 0, false);
    const i = info();
    const head = [
      'URL: ' + i.url,
      'Title: ' + i.title,
      'Viewport ' + i.vw + '×' + i.vh + ' · scroll ' + i.sx + ',' + i.sy + ' · page ' + i.pw + '×' + i.ph,
      '',
    ];
    if (!lines.length) lines.push('(nothing visible' + (opts.viewportOnly ? ' in the viewport' : '') + ')');
    if (skipped) lines.push('… ' + skipped + ' more elements cut. Snapshot a section with ref/selector, or use viewportOnly.');
    return head.concat(lines).join('\n');
  }

  function deepQuery(sel, root) {
    const hit = root.querySelector(sel);
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const h = deepQuery(sel, el.shadowRoot); if (h) return h; }
    }
    return null;
  }

  function byText(text) {
    const want = clean(text, 400).toLowerCase();
    let exact = null, partial = null;
    const all = document.body ? document.body.querySelectorAll('*') : [];
    for (const el of all) {
      if (el.id === '__archa_labels' || hidden(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const label = clean(el.getAttribute('aria-label') || el.value || el.innerText, 400).toLowerCase();
      if (!label) continue;
      const r = role(el);
      const score = (INTERACTIVE_ROLES.has(r) ? 0 : 1);
      // Deeper matches come later in document order; prefer them, interactive first.
      if (label === want && (!exact || score <= exact.score)) exact = { el, score };
      else if (label.includes(want) && (!partial || score <= partial.score)) partial = { el, score };
    }
    const hit = exact || partial;
    if (!hit) throw new Error('No visible element with text "' + text + '". Call snapshot to see what is on the page.');
    return hit.el;
  }

  function resolve(t) {
    if (t.ref) {
      const el = refs.get(t.ref);
      if (!el || !el.isConnected) throw new Error('Ref "' + t.ref + '" is not on the page (refs reset when the page changes). Call snapshot again for fresh refs.');
      return el;
    }
    if (t.selector) {
      const el = deepQuery(t.selector, document);
      if (!el) throw new Error('No element matches selector "' + t.selector + '".');
      return el;
    }
    if (t.text) return byText(t.text);
    throw new Error('No target given.');
  }

  function describe(el) {
    if (!el) return 'nothing';
    const r = role(el) || el.tagName.toLowerCase();
    const n = name(el);
    return r + (n ? ' "' + clean(n, 50) + '"' : '') + (el.getAttribute('data-archa-ref') ? ' [ref=' + el.getAttribute('data-archa-ref') + ']' : '');
  }

  function point(t) {
    const el = resolve(t);
    let rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) throw new Error(describe(el) + ' has no size (hidden or collapsed). Pick another target.');
    if (rect.top < 0 || rect.left < 0 || rect.bottom > innerHeight || rect.right > innerWidth) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      rect = el.getBoundingClientRect();
    }
    const x = Math.round(rect.left + Math.min(rect.width, innerWidth) / 2);
    const y = Math.round(rect.top + Math.min(rect.height, innerHeight) / 2);
    const hit = document.elementFromPoint(x, y);
    const covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? describe(hit) : null;
    return { x, y, desc: describe(el), covered };
  }

  function rectOf(t) {
    const el = resolve(t);
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, desc: describe(el) };
  }

  const STYLE_KEYS = ['display','position','top','left','width','height','margin','padding','box-sizing','flex-direction','flex-wrap','justify-content','align-items','gap','grid-template-columns','grid-template-rows','font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform','color','background-color','background-image','border','border-radius','box-shadow','opacity','overflow','z-index','transform','transition'];
  function details(t) {
    const el = resolve(t);
    const s = getComputedStyle(el);
    const styles = {};
    for (const k of STYLE_KEYS) {
      const v = s.getPropertyValue(k);
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') styles[k] = v;
    }
    const r = el.getBoundingClientRect();
    let html = el.outerHTML.replace(/ data-archa-ref="e[0-9]+"/g, '');
    if (html.length > 12000) html = html.slice(0, 12000) + '\n… (' + (html.length - 12000) + ' more chars)';
    return { desc: describe(el), box: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, styles, html };
  }

  function prepareClear(t) {
    const el = t ? resolve(t) : document.activeElement;
    if (!el) return false;
    if (typeof el.select === 'function') { el.focus(); el.select(); return true; }
    if (el.isContentEditable) { el.focus(); document.execCommand('selectAll'); return true; }
    return false;
  }

  function valueOf(t) {
    const el = t ? resolve(t) : document.activeElement;
    if (!el) return null;
    if ('value' in el) return clean(el.value, 200);
    if (el.isContentEditable) return clean(el.innerText, 200);
    return null;
  }

  function focused() { return describe(document.activeElement); }

  function selectOption(t, value) {
    const el = resolve(t);
    if (el.tagName !== 'SELECT') throw new Error(describe(el) + ' is not a <select>. For custom dropdowns click it, snapshot, then click the option.');
    const want = String(value).trim().toLowerCase();
    const opt = Array.from(el.options).find((o) => o.value === value) || Array.from(el.options).find((o) => o.text.trim().toLowerCase() === want);
    if (!opt) throw new Error('No option "' + value + '". Options: ' + Array.from(el.options).map((o) => o.text.trim() + ' (' + o.value + ')').slice(0, 30).join(', '));
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.text.trim();
  }

  function present(c) {
    if (c.selector) {
      const el = deepQuery(c.selector, document);
      return !!el && !hidden(el) && el.getBoundingClientRect().width > 0;
    }
    if (c.text) return !!document.body && document.body.innerText.includes(c.text);
    return true;
  }

  function scrollEdge(t, edge) {
    const el = t ? resolve(t) : null;
    const box = el || document.scrollingElement || document.documentElement;
    const x = edge === 'left' ? 0 : edge === 'right' ? box.scrollWidth : box.scrollLeft;
    const y = edge === 'top' ? 0 : edge === 'bottom' ? box.scrollHeight : box.scrollTop;
    box.scrollTo({ left: x, top: y, behavior: 'instant' });
  }

  function scrollIntoView(t) {
    const el = resolve(t);
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    return describe(el);
  }

  function showLabels() {
    hideLabels();
    const box = document.createElement('div');
    box.id = '__archa_labels';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const legend = [];
    for (const [id, el] of refs) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || !inViewport(r)) continue;
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;border:2px solid #f97316;border-radius:3px;box-sizing:border-box;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;';
      const tag = document.createElement('div');
      tag.textContent = id;
      tag.style.cssText = 'position:absolute;left:-2px;top:-2px;transform:translateY(-100%);background:#f97316;color:#fff;font:600 11px/1.3 monospace;padding:0 3px;border-radius:3px 3px 3px 0;white-space:nowrap;';
      if (r.top < 16) tag.style.transform = 'none';
      o.appendChild(tag);
      box.appendChild(o);
      legend.push(id + ' ' + describe(el).replace(/ \[ref=e\d+\]$/, ''));
    }
    document.documentElement.appendChild(box);
    return legend;
  }

  function hideLabels() {
    const old = document.getElementById('__archa_labels');
    if (old) old.remove();
  }

  /** Visual cue for the person watching: a ripple where the agent clicked. */
  function ripple(x, y) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:' + (x - 14) + 'px;top:' + (y - 14) + 'px;width:28px;height:28px;border-radius:50%;border:2px solid #f97316;background:rgba(249,115,22,.25);transition:transform .45s ease-out,opacity .45s ease-out;';
    document.documentElement.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = 'scale(1.9)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 500);
  }

  window.__archa = { v: 1, info, snapshot, resolve, point, rectOf, details, prepareClear, valueOf, focused, selectOption, present, scrollEdge, scrollIntoView, showLabels, hideLabels, ripple, describe };
})()`;
