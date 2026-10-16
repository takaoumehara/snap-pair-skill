import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { lookup } from 'mime-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const siteDir = join(__dirname, '../site');

// Simple static file server
function createStaticServer(port: number) {
  const server = createServer((req, res) => {
    let filePath = join(siteDir, req.url === '/' ? '/index.html' : req.url || '');
    
    try {
      const content = readFileSync(filePath);
      const mimeType = lookup(filePath) || 'text/plain';
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch {
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
      { name: 'shopping', url: `${baseUrl}/mini/shopping/?room=TEST01`, title: 'Shopping List' },
      { name: 'janken', url: `${baseUrl}/mini/janken/?room=TEST02`, title: 'Janken' },
      { name: 'draw', url: `${baseUrl}/mini/draw/?room=TEST03`, title: 'Co-Drawing' },
    ];
    
    for (const app of apps) {
      const page = await context.newPage();
      await page.goto(app.url);
      
      // Wait for app to load
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('#app-screen', { state: 'visible', timeout: 5000 }).catch(() => {});
      
      // Take screenshot
      await page.screenshot({
        path: `mini-app-${app.name}.png`,
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
