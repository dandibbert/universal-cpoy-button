// ==UserScript==
// @name         Universal Code Copy · 万能代码复制
// @name:en      Universal Code Copy
// @namespace    https://github.com/dandibbert/universal-cpoy-button
// @version      1.0.0
// @description  为任意网页的代码块/行内代码添加一个跟随光标的“轨道式”复制按钮：不占位、零 DOM 侵入、自动避开自带复制按钮的代码块；Alt+点击代码即可直接复制。适配 ChatGPT / Claude / Gemini / DeepSeek / GitHub 等各类网站。
// @description:en  A cursor-following "rail" copy button for every code block and inline code on any site. Zero layout impact, skips blocks that already have a copy button, Alt+Click any code to copy instantly.
// @author       dandibbert
// @license      MIT
// @match        *://*/*
// @match        file:///*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  'use strict';
  if (window.__uccLoaded) return;
  window.__uccLoaded = true;

  /* ------------------------------------------------------------------ *
   * 配置
   * ------------------------------------------------------------------ */
  const HIDE_DELAY = 260; // 离开代码后按钮保留的时间（给鼠标留出“够到”按钮的余量）
  const ZH = /^zh/i.test(navigator.language || '');
  const T = ZH
    ? { copy: '复制（Alt+点击代码也可复制）', done: '已复制', lines: (n) => `${n} 行`, fail: '失败' }
    : { copy: 'Copy (or Alt+Click the code)', done: 'Copied', lines: (n) => `${n} lines`, fail: 'Failed' };

  // 编辑器类区域不接管（它们是输入区，不是展示用代码）
  const EDITOR_SEL = '.monaco-editor,.CodeMirror,.cm-editor,.ace_editor,textarea,input,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';
  const INLINE_SEL = 'code,samp,tt';
  // 行号等不该被复制的装饰元素
  const LINE_NO_SEL = [
    '.line-numbers-rows', '.linenos', '.linenodiv', '.lineno', '.line-number', '.line-numbers',
    '.hljs-ln-numbers', '.hljs-ln-n', '.react-syntax-highlighter-line-number', '.gutter',
    '.code-line-number', '.ln', '[data-line-number]', '[aria-hidden="true"].line-number',
  ].join(',');
  const COPY_RE = /copy|clipboard|复制|拷贝|コピー|복사/i;
  const COPY_CANDIDATE_SEL = 'button,[role="button"],clipboard-copy,[data-clipboard-text],[data-clipboard-target],[class*="copy" i],[class*="clipboard" i],[aria-label],[title]';

  /* ------------------------------------------------------------------ *
   * UI（Shadow DOM 隔离，不受页面样式影响，也不影响页面）
   * ------------------------------------------------------------------ */
  const CSS = `
    :host { all: initial; }
    .btn {
      --s: 22px; --x: 0px; --y: 0px; --o: 1;
      --bg: rgba(255,255,255,.86); --fg: #64748b; --ring: rgba(15,23,42,.13); --hi: #4f46e5;
      position: fixed; left: 0; top: 0; box-sizing: border-box;
      display: flex; align-items: center; flex-direction: row;
      height: var(--s); min-width: var(--s); margin: 0; padding: 0; border: 0;
      border-radius: calc(var(--s) * .34);
      font: 600 11px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      letter-spacing: .02em; color: var(--fg); background: var(--bg);
      box-shadow: inset 0 0 0 1px var(--ring), 0 2px 6px -2px rgba(0,0,0,.18);
      -webkit-backdrop-filter: blur(8px) saturate(1.5); backdrop-filter: blur(8px) saturate(1.5);
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      transform-origin: right center;
      transform: translate3d(calc(var(--x) - 100%), var(--y), 0) scale(.55);
      opacity: 0; pointer-events: none; outline: none;
      transition: transform .18s cubic-bezier(.3,1.5,.55,1), opacity .16s ease, background-color .2s, color .2s, box-shadow .2s;
    }
    .btn.snap { transition: none !important; }
    .btn.on { opacity: var(--o); pointer-events: auto; transform: translate3d(calc(var(--x) - 100%), var(--y), 0) scale(1); }
    .btn.on:hover, .btn.on:focus-visible, .btn.ok, .btn.err { opacity: 1; color: var(--hi); box-shadow: inset 0 0 0 1px var(--hi), 0 3px 10px -3px var(--hi); }
    .btn.on:active { transform: translate3d(calc(var(--x) - 100%), var(--y), 0) scale(.88); }
    .btn[data-theme="dark"] { --bg: rgba(30,41,59,.78); --fg: #cbd5e1; --ring: rgba(255,255,255,.16); --hi: #a5b4fc; }
    .btn.ok  { --hi: #fff; background: #10b981; box-shadow: 0 3px 12px -3px rgba(16,185,129,.7); }
    .btn.err { --hi: #fff; background: #ef4444; box-shadow: 0 3px 12px -3px rgba(239,68,68,.7); }

    .lbl { max-width: 0; overflow: hidden; white-space: nowrap; padding-left: 0; transition: max-width .22s ease, padding .22s ease; }
    .ok .lbl:not(:empty), .err .lbl:not(:empty) { max-width: 72px; padding-left: 8px; }

    .ico { position: relative; flex: none; width: var(--s); height: var(--s); display: grid; place-items: center; }
    .ico svg { position: absolute; width: 62%; height: 62%; overflow: visible;
      fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
      transition: transform .22s cubic-bezier(.3,1.5,.55,1), opacity .15s; }
    .ico .back  { transition: transform .22s ease; }
    .btn.on:hover .ico .back { transform: translate(-1.5px, 1.5px); }
    .btn.on:hover .ico .front { transform: translate(1.5px, -1.5px); }
    .ico .chk { opacity: 0; stroke-width: 2.8; }
    .ico .chk path { stroke-dasharray: 24; stroke-dashoffset: 24; transition: stroke-dashoffset .3s .06s ease-out; }
    .ok .ico .cp { opacity: 0; transform: scale(.3) rotate(-25deg); }
    .ok .ico .chk { opacity: 1; }
    .ok .ico .chk path { stroke-dashoffset: 0; }
    .err .ico .cp { animation: shake .35s; }

    .flash { position: fixed; pointer-events: none; box-sizing: border-box;
      box-shadow: inset 0 0 0 1.5px rgba(16,185,129,.75);
      background: linear-gradient(100deg, transparent 35%, rgba(16,185,129,.22) 50%, transparent 65%) no-repeat;
      background-size: 300% 100%;
      animation: sweep .65s ease-out forwards; }
    @keyframes sweep { from { background-position: 100% 0; opacity: 1; } 70% { opacity: 1; } to { background-position: 0 0; opacity: 0; } }
    @keyframes shake { 0%,100% { translate: 0 } 25% { translate: -2px 0 } 75% { translate: 2px 0 } }
    @media (prefers-reduced-motion: reduce) { .btn, .ico svg, .lbl { transition: opacity .12s !important; } .flash { animation-duration: .01s; } }
  `;

  const host = document.createElement('ucc-copy-root');
  host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS); // Constructable stylesheet：不受页面 CSP 的 inline style 限制
    root.adoptedStyleSheets = [sheet];
  } catch {
    const st = document.createElement('style');
    st.textContent = CSS;
    root.append(st);
  }

  const NS = 'http://www.w3.org/2000/svg';
  const svg = (cls, children) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', cls);
    for (const [tag, attrs] of children) {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      s.append(n);
    }
    return s;
  };
  // 两张错位的卡片：悬停时向两侧轻微“拉开”，像要把代码复制出一份
  const icoBack = svg('cp back', [['path', { d: 'M15 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5' }]]);
  const icoFront = svg('cp front', [['rect', { x: '8', y: '8', width: '13', height: '13', rx: '2.5' }]]);
  const icoChk = svg('chk', [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]]);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.title = T.copy;
  btn.setAttribute('aria-label', T.copy);
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  const ico = document.createElement('span');
  ico.className = 'ico';
  ico.append(icoBack, icoFront, icoChk);
  btn.append(lbl, ico);
  root.append(btn);

  const mount = () => { if (!host.isConnected) document.documentElement.append(host); };
  mount();

  /* ------------------------------------------------------------------ *
   * 代码识别
   * ------------------------------------------------------------------ */
  function resolve(t) {
    if (t && t.nodeType !== 1) t = t.parentElement;
    if (!t || !t.closest || t === host) return null;
    if (t.closest(EDITOR_SEL)) return null;

    const pre = t.closest('pre');
    if (pre) {
      // Hexo / Pygments 等“行号一列 + 代码一列”的表格布局：整个表格视为一块，复制时剔除行号
      const tbl = pre.parentElement && pre.closest('table');
      if (tbl && tbl.querySelectorAll('pre').length <= 2 && tbl.querySelector(LINE_NO_SEL)) return { el: tbl, inline: false };
      return { el: pre, inline: false };
    }

    let c = t.closest(INLINE_SEL);
    if (!c) return null;
    for (let p = c.parentElement; p; p = p.parentElement) { // 取最外层 code
      if (p.matches(INLINE_SEL)) c = p; else break;
    }
    if (!c.textContent.trim()) return null;
    const cs = getComputedStyle(c);
    const blockish = /^(block|flex|grid|table)$/.test(cs.display) ||
      (/^pre/.test(cs.whiteSpace) && c.textContent.trim().includes('\n'));
    return { el: c, inline: !blockish };
  }

  // 代码块（或紧贴它的容器）里是否已有复制按钮
  const nativeYes = new WeakSet();
  function hasNativeCopy({ el, inline }) {
    if (nativeYes.has(el)) return true;
    const len = el.textContent.length;
    const slack = inline ? 40 : 400;
    const countSel = inline ? INLINE_SEL : 'pre';
    let scope = el;
    for (let i = 0; i < 4 && scope; i++) {
      for (const b of scope.querySelectorAll(COPY_CANDIDATE_SEL)) {
        if (looksLikeCopy(b)) { nativeYes.add(el); return true; }
      }
      const p = scope.parentElement;
      if (!p || p === document.body || p === document.documentElement) break;
      if (p.querySelectorAll(countSel).length > (inline ? 1 : scope.querySelectorAll('pre').length || 1)) break;
      if (p.textContent.length > len + slack) break; // 容器已经“不紧贴”代码块了（比如整条 AI 回复）
      scope = p;
    }
    return false;
  }
  function looksLikeCopy(b) {
    if (b.tagName === 'CLIPBOARD-COPY' || b.hasAttribute('data-clipboard-text') || b.hasAttribute('data-clipboard-target')) return true;
    const s = [b.getAttribute('aria-label'), b.getAttribute('title'), b.getAttribute('data-testid'),
      typeof b.className === 'string' ? b.className : b.getAttribute('class'), b.id].join(' ');
    if (COPY_RE.test(s)) return true;
    if (b.matches('button,[role="button"]')) {
      const tx = b.textContent.trim();
      if (tx.length <= 12 && COPY_RE.test(tx)) return true;
    }
    return false;
  }

  // 按“视觉”提取文本：块级元素换行、<br> 换行、跳过行号 / user-select:none 的装饰（如 $ 提示符）
  function extract(el) {
    const rootNoSelect = getComputedStyle(el).userSelect === 'none';
    let out = '';
    const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const walk = (node) => {
      if (node.nodeType === 3) { out += node.data; return; }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'BR') { out += '\n'; return; }
      if (/^(STYLE|SCRIPT|TEMPLATE|NOSCRIPT|BUTTON|svg)$/i.test(tag)) return;
      if (node !== el && node.matches(LINE_NO_SEL)) return;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (node !== el && !rootNoSelect && cs.userSelect === 'none') return;
      const block = node !== el && /^(block|flex|grid|table|table-row|list-item)$/.test(cs.display);
      if (block) nl();
      const start = out.length;
      for (const ch of node.childNodes) walk(ch);
      if (block) { if (out.length === start) out += '\n'; else nl(); }
    };
    walk(el);
    return out.replace(/ /g, ' ').replace(/[​﻿]/g, '').replace(/^\n+|\s+$/g, '');
  }

  function themeOf(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/[\d.]+/g);
      if (!m || m.length < 3) continue;
      if (m.length >= 4 && +m[3] < 0.5) continue;
      const k = c.startsWith('color(') ? 255 : 1;
      const lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) * k / 255;
      return lum < 0.5 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* ------------------------------------------------------------------ *
   * 定位：按钮沿代码块右侧“轨道”跟随光标高度 → 鼠标只需水平移动即可点到
   * ------------------------------------------------------------------ */
  let cur = null;        // { el, inline }
  let mx = -1, my = -1;  // 最近的鼠标坐标
  let hideT = 0, fbT = 0, touchT = 0;

  function place() {
    if (!cur) return;
    const el = cur.el;
    if (!el.isConnected) return hide(true);
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = document.documentElement.clientHeight || innerHeight;
    let r;
    if (cur.inline) {
      const rects = [...el.getClientRects()].filter((q) => q.width > 0);
      r = rects.find((q) => my >= q.top - 3 && my <= q.bottom + 3) || rects[rects.length - 1];
    } else {
      r = el.getBoundingClientRect();
    }
    if (!r || !r.width || r.bottom < 0 || r.top > vh) return hide(true);

    let s, x, y;
    if (cur.inline) {
      // 行内代码：右上角的小徽标，半压在边框上，不遮挡正文
      s = 16;
      x = Math.min(r.right + 7, vw - 2);
      y = Math.max(2, r.top - s / 2 - 1);
    } else {
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, vh);
      const h = bottom - top;
      s = h < 30 ? Math.max(16, Math.min(22, h - 6)) : 22; // 单行/挤在一起的小块自动缩小
      const pad = h < 30 ? (h - s) / 2 : 5;
      x = Math.min(r.right, vw) - Math.max(4, pad);
      const lo = top + pad, hi = bottom - s - pad;
      y = hi <= lo ? top + (h - s) / 2 : Math.min(hi, Math.max(lo, my - s / 2));
    }
    btn.style.setProperty('--s', s + 'px');
    btn.style.setProperty('--x', Math.round(x) + 'px');
    btn.style.setProperty('--y', Math.round(y) + 'px');
    // 距离越近越清晰：平时几乎“隐身”，靠近时浮现
    const d = Math.hypot(mx - (x - s / 2), my - (y + s / 2));
    btn.style.setProperty('--o', Math.max(0.4, Math.min(1, 1.15 - d / 260)).toFixed(2));
  }

  function show(res, force) {
    clearTimeout(hideT);
    const switching = !cur || cur.el !== res.el;
    // 只在切换代码块时检测（正向结果有缓存），逐帧移动不重复扫描 DOM
    if (switching && !force && hasNativeCopy(res)) { if (cur) hide(true); return; }
    mount();
    if (switching) {
      btn.classList.add('snap');
      btn.classList.remove('on');
      btn.dataset.theme = themeOf(res.el);
    }
    cur = res;
    place();
    if (switching) {
      void btn.offsetWidth; // 在新位置从缩小态弹出，而不是从旧位置滑过来
      btn.classList.remove('snap');
    }
    if (cur) btn.classList.add('on');
  }

  function hide(now) {
    clearTimeout(hideT);
    const doHide = () => { cur = null; btn.classList.remove('on'); };
    if (now === true) return doHide();
    const busy = btn.classList.contains('ok') || btn.classList.contains('err');
    hideT = setTimeout(doHide, busy ? 1100 : HIDE_DELAY);
  }

  /* ------------------------------------------------------------------ *
   * 复制
   * ------------------------------------------------------------------ */
  async function writeClip(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return true; } } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.documentElement.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  function flash(el) {
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'flash';
    Object.assign(f.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
      borderRadius: getComputedStyle(el).borderRadius || '6px',
    });
    root.append(f);
    f.addEventListener('animationend', () => f.remove());
    setTimeout(() => f.remove(), 1500);
  }

  async function copyTarget(res) {
    const text = extract(res.el);
    const ok = !!text && await writeClip(text);
    const lines = text ? text.split('\n').length : 0;
    btn.classList.remove('ok', 'err');
    void btn.offsetWidth;
    btn.classList.add(ok ? 'ok' : 'err');
    lbl.textContent = res.inline ? '' : !ok ? T.fail : lines > 1 ? T.lines(lines) : T.done;
    if (ok) flash(res.el);
    clearTimeout(fbT);
    fbT = setTimeout(() => { btn.classList.remove('ok', 'err'); lbl.textContent = ''; }, 1300);
  }

  /* ------------------------------------------------------------------ *
   * 事件（全局委托：无需 MutationObserver，SPA / 流式输出的 AI 页面天然适配）
   * ------------------------------------------------------------------ */
  const onOurUI = (e) => e.composedPath && e.composedPath().includes(host);
  const targetOf = (e) => (e.composedPath ? e.composedPath()[0] : e.target);

  let raf = 0, lastEvt = null;
  function evaluate() {
    raf = 0;
    const e = lastEvt;
    if (!e) return;
    if (e.over) { clearTimeout(hideT); return; }
    const res = resolve(e.target);
    if (res) show(res);
    else if (cur && !touchT) hide();
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    mx = e.clientX; my = e.clientY;
    lastEvt = { target: targetOf(e), over: onOurUI(e) };
    if (!raf) raf = requestAnimationFrame(evaluate);
  }, { passive: true, capture: true });

  // 触屏：点一下代码即在点按高度处出现按钮
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || onOurUI(e)) return;
    const res = resolve(targetOf(e));
    if (!res) return;
    mx = e.clientX; my = e.clientY;
    show(res);
    clearTimeout(touchT);
    touchT = setTimeout(() => { touchT = 0; hide(); }, 3000);
  }, { passive: true, capture: true });

  // Alt + 点击任意代码：零移动距离直接复制（对自带复制按钮的代码块同样有效）
  document.addEventListener('click', (e) => {
    if (!e.altKey || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || onOurUI(e)) return;
    const res = resolve(targetOf(e));
    if (!res) return;
    e.preventDefault();
    e.stopPropagation();
    mx = e.clientX; my = e.clientY;
    show(res, true);
    copyTarget(res);
    hide();
  }, true);

  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); // 不抢焦点、不清空页面选区
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (cur) copyTarget(cur);
  });

  const reflow = () => {
    if (!cur) return;
    // 滚动后光标下可能换成了另一块代码
    const t = mx >= 0 ? document.elementFromPoint(mx, my) : null;
    if (t && t !== host) {
      const res = resolve(t);
      if (res && res.el !== cur.el) return show(res);
      if (!res && !touchT) return hide();
    }
    place();
  };
  let scrollRaf = 0;
  addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; reflow(); }); }, { passive: true, capture: true });
  addEventListener('resize', () => hide(true), { passive: true });
  addEventListener('blur', () => hide());
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget && !onOurUI(e)) hide(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) hide(true); }, true);
})();
