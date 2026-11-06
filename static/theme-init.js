// Applies the saved (or system) theme before the page renders, so there's no flash of the wrong theme.
// Loaded as a separate file (not inline) so the Content-Security-Policy can block all inline scripts.
(function () {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) { /* Storage unavailable */ }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));
})();
