/* snap-pair docs: theme, language, tabs, copy buttons, nav. No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'snap-pair-theme';
  var LANG_KEY = 'snap-pair-lang';

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /* ---------- Toast ---------- */
  var toastEl;
  var toastTimer;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  /* ---------- i18n ---------- */
  var dict = window.SNAP_I18N || { en: {}, ja: {} };
  var originals = new Map();
  var currentLang = 'en';

  function detectLang() {
    var saved = load(LANG_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    return /^ja\b/i.test(langs[0] || '') ? 'ja' : 'en';
  }

  function t(key) {
    var table = dict[currentLang] || {};
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    return (dict.en && dict.en[key]) || key;
  }

  function applyLang(lang) {
    currentLang = lang === 'ja' ? 'ja' : 'en';
    root.lang = currentLang;
    var table = dict[currentLang] || {};

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      var key = el.getAttribute('data-i18n');
      el.innerHTML = currentLang !== 'en' && table[key] != null ? table[key] : originals.get(el);
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        var attr = parts[0] && parts[0].trim();
        var key = parts[1] && parts[1].trim();
        if (!attr || !key) return;
        var origKey = 'data-orig-' + attr;
        if (!el.hasAttribute(origKey)) el.setAttribute(origKey, el.getAttribute(attr) || '');
        el.setAttribute(attr, currentLang !== 'en' && table[key] != null ? table[key] : el.getAttribute(origKey));
      });
    });

    var meta = document.querySelector('meta[name="description"]');
    if (meta && meta.dataset.i18nKey) {
      if (!meta.dataset.orig) meta.dataset.orig = meta.content;
      meta.content = currentLang !== 'en' && table[meta.dataset.i18nKey] ? table[meta.dataset.i18nKey] : meta.dataset.orig;
    }
    if (document.body.dataset.titleKey) {
      if (!document.body.dataset.origTitle) document.body.dataset.origTitle = document.title;
      var tk = document.body.dataset.titleKey;
      document.title = currentLang !== 'en' && table[tk] ? table[tk] : document.body.dataset.origTitle;
    }

    document.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
      btn.innerHTML = currentLang === 'ja'
        ? '<span class="lang-long">EN</span><span class="lang-short" aria-hidden="true">EN</span>'
        : '<span class="lang-long">日本語</span><span class="lang-short" aria-hidden="true">JA</span>';
      btn.setAttribute('aria-label', currentLang === 'ja' ? 'Switch to English' : '日本語に切り替え');
      btn.setAttribute('lang', currentLang === 'ja' ? 'en' : 'ja');
    });

    document.dispatchEvent(new CustomEvent('snap:lang', { detail: { lang: currentLang } }));
  }

  /* ---------- Theme ---------- */
  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function effectiveTheme() {
    var forced = root.getAttribute('data-theme');
    return forced || (systemDark() ? 'dark' : 'light');
  }
  function renderThemeButtons() {
    var dark = effectiveTheme() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
      btn.setAttribute('aria-label', dark ? t('ui.lightMode') : t('ui.darkMode'));
      btn.setAttribute('title', dark ? t('ui.lightMode') : t('ui.darkMode'));
    });
  }
  function initTheme() {
    var saved = load(THEME_KEY);
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        store(THEME_KEY, next);
        renderThemeButtons();
      });
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { renderThemeButtons(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    renderThemeButtons();
  }

  /* ---------- Tabs (WAI-ARIA tabs pattern) ---------- */
  function selectTab(tab, focus) {
    var list = tab.closest('[role="tablist"]');
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (other) {
      var selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(other.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
    var group = list.getAttribute('data-sync');
    if (group) {
      store('snap-pair-tab-' + group, tab.getAttribute('data-key'));
      document.querySelectorAll('[role="tablist"][data-sync="' + group + '"]').forEach(function (otherList) {
        if (otherList === list) return;
        var match = otherList.querySelector('[role="tab"][data-key="' + tab.getAttribute('data-key') + '"]');
        if (match && match.getAttribute('aria-selected') !== 'true') selectTab(match, false);
      });
    }
  }

  function initTabs() {
    document.querySelectorAll('[role="tablist"]').forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
      tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { selectTab(tab, false); });
        tab.addEventListener('keydown', function (e) {
          var next = null;
          if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
          else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
          else if (e.key === 'Home') next = tabs[0];
          else if (e.key === 'End') next = tabs[tabs.length - 1];
          if (next) { e.preventDefault(); selectTab(next, true); }
        });
      });
      var group = list.getAttribute('data-sync');
      var saved = group && load('snap-pair-tab-' + group);
      var initial = (saved && list.querySelector('[role="tab"][data-key="' + saved + '"]')) ||
        list.querySelector('[role="tab"][aria-selected="true"]') || tabs[0];
      if (initial) selectTab(initial, false);
    });
  }

  /* ---------- Copy buttons ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); }
      catch (err) { reject(err); }
      finally { document.body.removeChild(ta); }
    });
  }

  function makeCopyButton(getText) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = t('ui.copy');
    btn.setAttribute('data-copy-btn', '');
    btn.addEventListener('click', function () {
      copyText(getText()).then(function () {
        btn.textContent = t('ui.copied');
        btn.classList.add('copied');
        toast(t('ui.copiedToast'));
        setTimeout(function () { btn.textContent = t('ui.copy'); btn.classList.remove('copied'); }, 1400);
      }, function () { toast(t('ui.copyFailed')); });
    });
    return btn;
  }

  function initCopy() {
    document.querySelectorAll('.code').forEach(function (block) {
      var pre = block.querySelector('pre');
      if (!pre) return;
      block.appendChild(makeCopyButton(function () { return pre.innerText.replace(/\n$/, ''); }));
    });
    document.querySelectorAll('[data-copy]').forEach(function (el) {
      var target = el.getAttribute('data-copy');
      el.appendChild(makeCopyButton(function () {
        var src = document.getElementById(target);
        return src ? src.innerText.trim() : '';
      }));
    });
    document.addEventListener('snap:lang', function () {
      document.querySelectorAll('[data-copy-btn]').forEach(function (btn) {
        if (!btn.classList.contains('copied')) btn.textContent = t('ui.copy');
      });
      renderThemeButtons();
    });
  }

  /* ---------- Nav ---------- */
  function initNav() {
    var menuBtn = document.querySelector('[data-menu-toggle]');
    var menu = document.getElementById('mobile-menu');
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', function () {
        var open = menu.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', String(open));
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) { menu.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
      });
    }

    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        var a = byId[entry.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  /* ---------- Preset rows: select the code tab and swap the preview ---------- */
  function showPreset(key) {
    var row = null;
    document.querySelectorAll('[data-preset]').forEach(function (r) {
      var on = r.getAttribute('data-preset') === key;
      r.setAttribute('aria-pressed', String(on));
      if (on) row = r;
    });
    var img = document.querySelector('#preset-preview img');
    if (row && img && row.getAttribute('data-preview')) {
      img.src = row.getAttribute('data-preview');
      img.alt = row.getAttribute('data-alt') || '';
    }
  }

  function initPresetCards() {
    document.querySelectorAll('[data-preset]').forEach(function (row) {
      row.addEventListener('click', function () {
        var key = row.getAttribute('data-preset');
        var tab = document.querySelector('#preset-tabs [role="tab"][data-key="' + key + '"]');
        if (tab) selectTab(tab, false);
        showPreset(key);
      });
    });
    var list = document.getElementById('preset-tabs');
    if (list) {
      list.addEventListener('click', function (e) {
        var tab = e.target.closest('[role="tab"]');
        if (tab) showPreset(tab.getAttribute('data-key'));
      });
      list.addEventListener('keyup', function () {
        var sel = list.querySelector('[aria-selected="true"]');
        if (sel) showPreset(sel.getAttribute('data-key'));
      });
    }
  }

  /* ---------- Crowd convergence visual (respects reduced motion via CSS) ---------- */
  function initCrowdVisual() {
    var svg = document.querySelector('[data-crowd-svg]');
    if (!svg) return;
    var ns = 'http://www.w3.org/2000/svg';
    var count = 220;
    var cols = 22;
    var screenX = 318;
    var screenY = 118;
    var screenW = 68;
    var screenH = 88;

    var screen = document.createElementNS(ns, 'g');
    screen.setAttribute('class', 'crowd-screen-svg');
    var sRect = document.createElementNS(ns, 'rect');
    sRect.setAttribute('x', String(screenX));
    sRect.setAttribute('y', String(screenY - screenH / 2));
    sRect.setAttribute('width', String(screenW));
    sRect.setAttribute('height', String(screenH));
    sRect.setAttribute('rx', '5');
    var sInner = document.createElementNS(ns, 'rect');
    sInner.setAttribute('x', String(screenX + 6));
    sInner.setAttribute('y', String(screenY - screenH / 2 + 8));
    sInner.setAttribute('width', String(screenW - 12));
    sInner.setAttribute('height', String(screenH - 20));
    sInner.setAttribute('rx', '2');
    var stand = document.createElementNS(ns, 'path');
    stand.setAttribute('d', 'M' + (screenX + screenW / 2 - 14) + ' ' + (screenY + screenH / 2) +
      ' L' + (screenX + screenW / 2) + ' ' + (screenY + screenH / 2 + 14) +
      ' L' + (screenX + screenW / 2 + 14) + ' ' + (screenY + screenH / 2));
    screen.appendChild(sRect);
    screen.appendChild(sInner);
    screen.appendChild(stand);

    for (var i = 0; i < count; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var jitter = ((i * 17) % 7) - 3;
      var px = 6 + col * 12 + (row % 2) * 3 + jitter * 0.4;
      var py = 10 + row * 11 + ((i * 13) % 5);
      if (px > screenX - 24) px = screenX - 28 - (i % 8);
      var targetX = screenX + screenW * 0.35 + ((row % 5) - 2) * 4;
      var targetY = screenY - screenH / 2 + 12 + (row % 6) * (screenH / 7);

      var g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'crowd-unit');
      g.style.setProperty('--d', (i * 0.018) + 's');

      var line = document.createElementNS(ns, 'line');
      line.setAttribute('class', 'crowd-line');
      line.setAttribute('x1', String(px + 3));
      line.setAttribute('y1', String(py + 5));
      line.setAttribute('x2', String(targetX));
      line.setAttribute('y2', String(targetY));

      var phone = document.createElementNS(ns, 'rect');
      phone.setAttribute('class', 'crowd-phone');
      phone.setAttribute('x', String(px));
      phone.setAttribute('y', String(py));
      phone.setAttribute('width', '6');
      phone.setAttribute('height', '10');
      phone.setAttribute('rx', '1.5');

      g.appendChild(line);
      g.appendChild(phone);
      svg.appendChild(g);
    }
  }

  /* ---------- Quiet motion: nav hairline on scroll, section reveal ---------- */
  function initMotion() {
    var nav = document.querySelector('.nav');
    if (nav) {
      var ticking = false;
      var update = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); ticking = false; };
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    }

    var loader = document.querySelector('.loader');
    if (loader) {
      loader.addEventListener('animationend', function (e) {
        if (e.animationName === 'loader-out') root.classList.remove('is-loading');
      });
    }

    if (!root.classList.contains('js-reveal')) return;
    var targets = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Boot ---------- */
  window.snapPair = { t: t, toast: toast, copyText: copyText, getLang: function () { return currentLang; } };

  function boot() {
    initTheme();
    applyLang(detectLang());
    initTabs();
    initCopy();
    initNav();
    initPresetCards();
    initCrowdVisual();
    initMotion();
    document.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = currentLang === 'ja' ? 'en' : 'ja';
        store(LANG_KEY, next);
        applyLang(next);
      });
    });
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
