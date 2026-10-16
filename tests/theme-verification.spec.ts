import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Theme switching verification tests
 * Tests light/dark theme toggle, persistence, and captures screenshots
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_BASE_URL = 'http://localhost:8889';
const ARTIFACTS_DIR = path.join(__dirname, '../.github/pr-artifacts');

// Ensure artifacts directory exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Helper to get current theme from data-theme attribute
async function getCurrentTheme(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return document.documentElement.getAttribute('data-theme') || 'light';
  });
}

// Helper to get theme from localStorage
async function getStoredTheme(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    return localStorage.getItem('snap-pair-theme');
  });
}

// Helper to click theme toggle
async function toggleTheme(page: Page) {
  await page.click('[data-theme-toggle]');
}

// Helper to get background color
async function getBackgroundColor(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return window.getComputedStyle(document.documentElement).backgroundColor;
  });
}

test.describe('Theme Verification - Shopping List', () => {
  test('should default to light, toggle to dark, and persist', async ({ page }) => {
    await page.goto(`${LOCAL_BASE_URL}/mini/shopping/?debug=1&pkhost=localhost:1999`);
    
    // 1. Verify default light theme
    const initialTheme = await getCurrentTheme(page);
    expect(initialTheme).toBe('light');
    console.log('✓ Shopping: Default theme is light');
    
    const initialBg = await getBackgroundColor(page);
    expect(initialBg).toContain('rgb(250, 251, 252)'); // --color-bg light
    
    // Capture light theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'shopping-light.png'),
      fullPage: false
    });
    console.log('✓ Shopping: Light theme screenshot captured');
    
    // 2. Toggle to dark
    await toggleTheme(page);
    await page.waitForTimeout(200); // Wait for theme transition
    
    const darkTheme = await getCurrentTheme(page);
    expect(darkTheme).toBe('dark');
    console.log('✓ Shopping: Toggled to dark theme');
    
    const darkBg = await getBackgroundColor(page);
    expect(darkBg).toContain('rgb(15, 23, 42)'); // --color-bg dark
    
    // Verify localStorage persistence
    const stored = await getStoredTheme(page);
    expect(stored).toBe('dark');
    console.log('✓ Shopping: Dark theme persisted in localStorage');
    
    // Capture dark theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'shopping-dark.png'),
      fullPage: false
    });
    console.log('✓ Shopping: Dark theme screenshot captured');
    
    // 3. Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(100);
    
    const persistedTheme = await getCurrentTheme(page);
    expect(persistedTheme).toBe('dark');
    console.log('✓ Shopping: Dark theme persisted after reload');
    
    // Toggle back to light to clean up
    await toggleTheme(page);
    const lightAgain = await getCurrentTheme(page);
    expect(lightAgain).toBe('light');
    console.log('✓ Shopping: Toggled back to light');
  });
});

test.describe('Theme Verification - Janken', () => {
  test('should default to light, toggle to dark, and persist', async ({ page }) => {
    await page.goto(`${LOCAL_BASE_URL}/mini/janken/?debug=1&pkhost=localhost:1999`);
    
    // 1. Verify default light theme
    const initialTheme = await getCurrentTheme(page);
    expect(initialTheme).toBe('light');
    console.log('✓ Janken: Default theme is light');
    
    // Capture light theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'janken-light.png'),
      fullPage: false
    });
    console.log('✓ Janken: Light theme screenshot captured');
    
    // 2. Toggle to dark
    await toggleTheme(page);
    await page.waitForTimeout(200);
    
    const darkTheme = await getCurrentTheme(page);
    expect(darkTheme).toBe('dark');
    console.log('✓ Janken: Toggled to dark theme');
    
    const stored = await getStoredTheme(page);
    expect(stored).toBe('dark');
    console.log('✓ Janken: Dark theme persisted in localStorage');
    
    // Capture dark theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'janken-dark.png'),
      fullPage: false
    });
    console.log('✓ Janken: Dark theme screenshot captured');
    
    // 3. Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(100);
    
    const persistedTheme = await getCurrentTheme(page);
    expect(persistedTheme).toBe('dark');
    console.log('✓ Janken: Dark theme persisted after reload');
  });
});

test.describe('Theme Verification - Co-Drawing', () => {
  test('should default to light, toggle to dark, and persist', async ({ page }) => {
    await page.goto(`${LOCAL_BASE_URL}/mini/draw/?debug=1&pkhost=localhost:1999`);
    
    // 1. Verify default light theme
    const initialTheme = await getCurrentTheme(page);
    expect(initialTheme).toBe('light');
    console.log('✓ Co-Drawing: Default theme is light');
    
    // Capture light theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'draw-light.png'),
      fullPage: false
    });
    console.log('✓ Co-Drawing: Light theme screenshot captured');
    
    // 2. Toggle to dark
    await toggleTheme(page);
    await page.waitForTimeout(200);
    
    const darkTheme = await getCurrentTheme(page);
    expect(darkTheme).toBe('dark');
    console.log('✓ Co-Drawing: Toggled to dark theme');
    
    const stored = await getStoredTheme(page);
    expect(stored).toBe('dark');
    console.log('✓ Co-Drawing: Dark theme persisted in localStorage');
    
    // Capture dark theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'draw-dark.png'),
      fullPage: false
    });
    console.log('✓ Co-Drawing: Dark theme screenshot captured');
    
    // 3. Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(100);
    
    const persistedTheme = await getCurrentTheme(page);
    expect(persistedTheme).toBe('dark');
    console.log('✓ Co-Drawing: Dark theme persisted after reload');
  });
});

test.describe('Theme Verification - Index Page', () => {
  test('should support theme switching on landing page', async ({ page }) => {
    await page.goto(`${LOCAL_BASE_URL}/mini/`);
    
    // 1. Verify default light theme
    const initialTheme = await getCurrentTheme(page);
    expect(initialTheme).toBe('light');
    console.log('✓ Index: Default theme is light');
    
    // Capture light theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'index-light.png'),
      fullPage: true
    });
    console.log('✓ Index: Light theme screenshot captured');
    
    // 2. Toggle to dark
    await toggleTheme(page);
    await page.waitForTimeout(200);
    
    const darkTheme = await getCurrentTheme(page);
    expect(darkTheme).toBe('dark');
    console.log('✓ Index: Toggled to dark theme');
    
    // Capture dark theme screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'index-dark.png'),
      fullPage: true
    });
    console.log('✓ Index: Dark theme screenshot captured');
  });
});

// Create comparison image (side-by-side light/dark)
test.describe('Theme Comparison', () => {
  test('should generate comparison images', async ({ page }) => {
    // This test just validates that all screenshots were created
    const expectedFiles = [
      'shopping-light.png',
      'shopping-dark.png',
      'janken-light.png',
      'janken-dark.png',
      'draw-light.png',
      'draw-dark.png',
      'index-light.png',
      'index-dark.png'
    ];
    
    for (const file of expectedFiles) {
      const filePath = path.join(ARTIFACTS_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);
    }
    
    console.log(`✓ All ${expectedFiles.length} screenshots generated in .github/pr-artifacts/`);
  });
});
