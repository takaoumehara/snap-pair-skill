const { chromium } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const siteDir = path.join(__dirname, '../site');

// Simple static file server
function createStaticServer(port) {
  const server = http.createServer((req, res) => {
    let filePath = path.join(siteDir, req.url === '/' ? '/index.html' : req.url || '');
    
    try {
      const content = fs.readFileSync(filePath);
      let contentType = 'text/html';
      if (filePath.endsWith('.css')) contentType = 'text/css';
      else if (filePath.endsWith('.js')) contentType = 'application/javascript';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.json')) contentType = 'application/json';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  server.listen(port);
  return server;
}

async function takeScreenshots() {
  const server = createStaticServer(8888);
  const baseUrl = 'http://localhost:8888';
  
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }, // iPhone 12 viewport
      deviceScaleFactor: 2,
    });
    
    const apps = [
      { name: 'shopping', url: `${baseUrl}/mini/shopping/?room=TEST01&debug=1`, title: 'Shopping List' },
      { name: 'janken', url: `${baseUrl}/mini/janken/?room=TEST02&debug=1`, title: 'Janken' },
      { name: 'draw', url: `${baseUrl}/mini/draw/?room=TEST03&debug=1`, title: 'Co-Drawing' },
    ];
    
    for (const app of apps) {
      const page = await context.newPage();
      await page.goto(app.url);
      
      // Wait for app to load
      await page.waitForLoadState('networkidle');
      
      // Try to join the room directly
      try {
        await page.waitForSelector('#room-input', { timeout: 2000 });
        await page.fill('#room-input', 'DEMO42');
        await page.click('#join-btn');
        await page.waitForSelector('#app-screen', { state: 'visible', timeout: 3000 });
        await page.waitForTimeout(500); // Let it render
      } catch (e) {
        // Already in app screen or different flow
      }
      
      // Take screenshot
      await page.screenshot({
        path: path.join(__dirname, `../mini-app-${app.name}.png`),
        fullPage: false,
      });
      
      console.log(`✓ Screenshot saved: mini-app-${app.name}.png`);
      await page.close();
    }
    
    await browser.close();
    console.log('\n✓ All screenshots captured successfully');
  } finally {
    server.close();
  }
}

takeScreenshots().catch(console.error);
