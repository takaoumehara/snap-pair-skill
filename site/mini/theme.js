/**
 * Shared theme switcher for snap-pair mini apps
 * 
 * Usage:
 *   <script src="../theme.js"></script>
 *   <button id="theme-toggle">🌙</button>
 * 
 * Features:
 * - Explicit light/dark switching (no auto prefers-color-scheme)
 * - Persists choice in localStorage
 * - Default: light theme
 * - Applies [data-theme] attribute to <html>
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'snap-pair-theme';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';
  
  const ICONS = {
    light: '🌙', // Moon icon = "switch to dark"
    dark: '☀️'   // Sun icon = "switch to light"
  };

  // Get current theme from localStorage or default to light
  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || THEME_LIGHT;
    } catch (e) {
      return THEME_LIGHT;
    }
  }

  // Save theme to localStorage
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // localStorage may be blocked
    }
  }

  // Apply theme to document
  function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    
    // Update all toggle buttons
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach(btn => {
      btn.textContent = ICONS[theme];
      btn.setAttribute('aria-label', `Switch to ${theme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT} theme`);
    });
    
    return theme;
  }

  // Toggle between themes
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || THEME_LIGHT;
    const newTheme = currentTheme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
    applyTheme(newTheme);
    saveTheme(newTheme);
    return newTheme;
  }

  // Initialize theme on page load (before DOMContentLoaded to avoid flash)
  const initialTheme = getStoredTheme();
  applyTheme(initialTheme);

  // Wait for DOM to wire up buttons
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initButtons);
  } else {
    initButtons();
  }

  function initButtons() {
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleTheme();
      });
    });
  }

  // Export to global for programmatic access
  window.SnapPairTheme = {
    get current() {
      return document.documentElement.getAttribute('data-theme') || THEME_LIGHT;
    },
    toggle: toggleTheme,
    set: (theme) => {
      if (theme === THEME_LIGHT || theme === THEME_DARK) {
        applyTheme(theme);
        saveTheme(theme);
      }
    },
    LIGHT: THEME_LIGHT,
    DARK: THEME_DARK
  };
})();
