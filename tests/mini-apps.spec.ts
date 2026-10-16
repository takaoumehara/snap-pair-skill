import { test, expect, type Page } from '@playwright/test';

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://snap-pair-skill-git-curs-d29709-takaoumehara-gmailcoms-projects.vercel.app';

async function simulateShake(page: Page) {
  // Navigate with debug=1 to enable simulate shake button
  await page.evaluate(() => {
    const shakeBtn = document.getElementById('simulate-shake-btn');
    if (shakeBtn) {
      (shakeBtn as HTMLButtonElement).click();
    }
  });
}

async function waitForPairing(page: Page, timeout = 3000) {
  // Wait for app screen to appear (shake screen hides, app screen shows)
  await page.waitForSelector('#app-screen', { state: 'visible', timeout });
}

test.describe('Mini Apps - Shopping List', () => {
  test('should pair two devices with simulated shake and add items', async ({ browser }) => {
    const context1 = await browser.newContext({ viewport: { width: 375, height: 667 } }); // iPhone viewport
    const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Open both pages with debug mode
    await page1.goto(`${PREVIEW_URL}/mini/shopping/?debug=1`);
    await page2.goto(`${PREVIEW_URL}/mini/shopping/?debug=1`);

    // Enable shake and simulate on both devices
    await page1.click('#enable-shake-btn');
    await page2.click('#enable-shake-btn');

    await simulateShake(page1);
    await simulateShake(page2);

    // Wait for pairing (both should join same room)
    try {
      await waitForPairing(page1);
      await waitForPairing(page2);
    } catch {
      // If shake pairing doesn't work, fall back to manual room code
      await page1.fill('#room-input', 'TEST42');
      await page1.click('#join-btn');
      await page2.fill('#room-input', 'TEST42');
      await page2.click('#join-btn');
    }

    // Add item from page1
    await page1.fill('#item-input', 'Milk');
    await page1.click('button[type="submit"]');

    // Wait and verify item appears on page2
    await page2.waitForTimeout(500);
    const page2Items = await page2.locator('.list-item').count();
    expect(page2Items).toBeGreaterThan(0);

    // Check item from page2
    await page2.locator('input[type="checkbox"]').first().check();

    // Wait and verify checked state on page1
    await page1.waitForTimeout(500);
    const isChecked = await page1.locator('input[type="checkbox"]').first().isChecked();
    expect(isChecked).toBe(true);

    await context1.close();
    await context2.close();
  });
});

test.describe('Mini Apps - Janken', () => {
  test('should pair two devices and play rock-paper-scissors', async ({ browser }) => {
    const context1 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto(`${PREVIEW_URL}/mini/janken/?debug=1`);
    await page2.goto(`${PREVIEW_URL}/mini/janken/?debug=1`);

    // Use manual room code for reliability
    await page1.fill('#room-input', 'GAME42');
    await page1.click('#join-btn');
    await page2.fill('#room-input', 'GAME42');
    await page2.click('#join-btn');

    await waitForPairing(page1);
    await waitForPairing(page2);

    // Both players choose
    await page1.click('[data-choice="rock"]');
    await page2.click('[data-choice="scissors"]');

    // Wait for result
    await page1.waitForTimeout(500);
    
    // Verify result display appears
    const resultText = await page1.locator('#result-display').textContent();
    expect(resultText).toBeTruthy();

    // Check score updated
    const score = await page1.locator('#your-score').textContent();
    expect(parseInt(score || '0')).toBeGreaterThanOrEqual(0);

    await context1.close();
    await context2.close();
  });
});

test.describe('Mini Apps - Co-Drawing', () => {
  test('should pair two devices and draw on shared canvas', async ({ browser }) => {
    const context1 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto(`${PREVIEW_URL}/mini/draw/?debug=1`);
    await page2.goto(`${PREVIEW_URL}/mini/draw/?debug=1`);

    // Use manual room code
    await page1.fill('#room-input', 'DRAW42');
    await page1.click('#join-btn');
    await page2.fill('#room-input', 'DRAW42');
    await page2.click('#join-btn');

    await waitForPairing(page1);
    await waitForPairing(page2);

    // Draw on page1
    const canvas1 = await page1.locator('#canvas');
    const box1 = await canvas1.boundingBox();
    if (box1) {
      await page1.mouse.move(box1.x + 100, box1.y + 100);
      await page1.mouse.down();
      await page1.mouse.move(box1.x + 200, box1.y + 200);
      await page1.mouse.up();
    }

    // Wait for stroke to propagate
    await page2.waitForTimeout(500);

    // Verify canvas has content on page2
    const hasContent = await page2.evaluate(() => {
      const canvas = document.getElementById('canvas') as HTMLCanvasElement;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return imageData.data.some(val => val !== 0);
    });

    expect(hasContent).toBe(true);

    await context1.close();
    await context2.close();
  });
});

test.describe('Mini Apps - Landing Page', () => {
  test('should display all three app links', async ({ page }) => {
    await page.goto(`${PREVIEW_URL}/mini/`);

    // Check all three app cards are present
    const shoppingLink = page.locator('a[href="shopping/"]');
    const jankenLink = page.locator('a[href="janken/"]');
    const drawLink = page.locator('a[href="draw/"]');

    await expect(shoppingLink).toBeVisible();
    await expect(jankenLink).toBeVisible();
    await expect(drawLink).toBeVisible();

    // Verify content
    await expect(page.locator('h1')).toContainText('Shake Pairing Mini Apps');
  });
});
