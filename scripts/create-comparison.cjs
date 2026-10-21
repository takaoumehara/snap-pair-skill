const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function createComparison() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
  });
  
  const page = await context.newPage();
  
  // Create HTML for side-by-side comparison
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        margin: 0;
        padding: 40px;
        background: #fafbfc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
      }
      h1 {
        text-align: center;
        color: #1f2937;
        margin-bottom: 40px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 32px;
      }
      .app-preview {
        background: white;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      }
      .app-preview h2 {
        margin: 0 0 16px;
        font-size: 18px;
        color: #1f2937;
        text-align: center;
      }
      .app-preview img {
        width: 100%;
        border-radius: 8px;
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Mini Apps - Colorful but Calm Design</h1>
      <div class="grid">
        <div class="app-preview">
          <h2>🛒 Shopping List</h2>
          <img src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../mini-app-shopping.png'), 'base64')}" alt="Shopping List">
        </div>
        <div class="app-preview">
          <h2>✊✋✌️ Janken</h2>
          <img src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../mini-app-janken.png'), 'base64')}" alt="Janken">
        </div>
        <div class="app-preview">
          <h2>🎨 Co-Drawing</h2>
          <img src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../mini-app-draw.png'), 'base64')}" alt="Co-Drawing">
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
  
  await page.setContent(html);
  await page.waitForTimeout(500);
  
  await page.screenshot({
    path: path.join(__dirname, '../mini-apps-comparison.png'),
    fullPage: true,
  });
  
  console.log('✓ Comparison image created: mini-apps-comparison.png');
  
  await browser.close();
}

createComparison().catch(console.error);
