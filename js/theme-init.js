// Classic (non-module) script loaded in <head> so the theme is set before
// first paint. Keeps "system" in sync with prefers-color-scheme.
(function () {
  var stored = null;
  try { stored = window.localStorage.getItem('da.theme'); } catch (e) { /* ignore */ }
  var choice = stored === 'light' || stored === 'dark' ? stored : 'system';
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function apply(c) {
    var resolved = c === 'system' ? (media.matches ? 'dark' : 'light') : c;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-choice', c);
  }

  apply(choice);
  media.addEventListener('change', function () {
    if (document.documentElement.getAttribute('data-theme-choice') === 'system') apply('system');
  });
  window.__applyTheme = apply;
})();
