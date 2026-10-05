/* snap-pair docs: runs in <head> before first paint. Theme, loader and reveal opt-ins. */
(function () {
  'use strict';
  var root = document.documentElement;
  try {
    var t = localStorage.getItem('snap-pair-theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  } catch (e) { /* private mode */ }

  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm) return;

  if ('IntersectionObserver' in window) root.classList.add('js-reveal');

  // The loader plays once per tab session, only on pages that opt in with data-loader.
  var me = document.currentScript;
  if (!me || !me.hasAttribute('data-loader')) return;
  try {
    if (sessionStorage.getItem('snap-pair-loaded')) return;
    sessionStorage.setItem('snap-pair-loaded', '1');
  } catch (e) { /* still show it */ }
  root.classList.add('is-loading');
  // Failsafe: the CSS animation hides the loader by ~1s; drop the class afterwards either way.
  setTimeout(function () { root.classList.remove('is-loading'); }, 1500);
})();
