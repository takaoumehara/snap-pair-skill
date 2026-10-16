# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mini-apps.spec.ts >> Mini Apps - Landing Page >> should display all three app links
- Location: tests/mini-apps.spec.ts:164:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('a[href="shopping/"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('a[href="shopping/"]') with timeout 5000ms
  - waiting for locator('a[href="shopping/"]')

```

```yaml
- link "Skip to content":
  - /url: "#geist-skip-nav"
- banner:
  - link "Vercel logo":
    - /url: /home
    - button "Vercel Logo":
      - img "Vercel Logo"
  - navigation:
    - navigation:
      - link "Sign Up":
        - /url: /signup?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fsnap-pair-skill-git-curs-d29709-takaoumehara-gmailcoms-projects.vercel.app%252Fmini%252F%26nonce%3D23bc14351eba0e2fdd4643f6739e122739b9fcb3cf8464f51f6b24a2f8ff3448
        - paragraph: Sign Up
- main:
  - heading "Log in to Vercel" [level=1]
  - textbox "Email Address"
  - button "Continue with Email"
  - button "Continue with Google"
  - button "Continue with GitHub"
  - button "Continue with ChatGPT"
  - button "Continue with SAML SSO":
    - img
    - text: Continue with SAML SSO
  - button "Continue with Passkey":
    - img
    - text: Continue with Passkey
  - button "Show other options"
  - paragraph:
    - text: Don't have an account?
    - link "Sign Up":
      - /url: /signup?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fsnap-pair-skill-git-curs-d29709-takaoumehara-gmailcoms-projects.vercel.app%252Fmini%252F%26nonce%3D23bc14351eba0e2fdd4643f6739e122739b9fcb3cf8464f51f6b24a2f8ff3448
  - link "Terms":
    - /url: /legal/terms
  - link "Privacy Policy":
    - /url: /legal/privacy-policy
- alert
- iframe
- img
```

# Test source

```ts
  72  | 
  73  | test.describe('Mini Apps - Janken', () => {
  74  |   test('should pair two devices and play rock-paper-scissors', async ({ browser }) => {
  75  |     const context1 = await browser.newContext({ viewport: { width: 375, height: 667 } });
  76  |     const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
  77  |     
  78  |     const page1 = await context1.newPage();
  79  |     const page2 = await context2.newPage();
  80  | 
  81  |     await page1.goto(`${PREVIEW_URL}/mini/janken/?debug=1`);
  82  |     await page2.goto(`${PREVIEW_URL}/mini/janken/?debug=1`);
  83  | 
  84  |     // Use manual room code for reliability
  85  |     await page1.fill('#room-input', 'GAME42');
  86  |     await page1.click('#join-btn');
  87  |     await page2.fill('#room-input', 'GAME42');
  88  |     await page2.click('#join-btn');
  89  | 
  90  |     await waitForPairing(page1);
  91  |     await waitForPairing(page2);
  92  | 
  93  |     // Both players choose
  94  |     await page1.click('[data-choice="rock"]');
  95  |     await page2.click('[data-choice="scissors"]');
  96  | 
  97  |     // Wait for result
  98  |     await page1.waitForTimeout(500);
  99  |     
  100 |     // Verify result display appears
  101 |     const resultText = await page1.locator('#result-display').textContent();
  102 |     expect(resultText).toBeTruthy();
  103 | 
  104 |     // Check score updated
  105 |     const score = await page1.locator('#your-score').textContent();
  106 |     expect(parseInt(score || '0')).toBeGreaterThanOrEqual(0);
  107 | 
  108 |     await context1.close();
  109 |     await context2.close();
  110 |   });
  111 | });
  112 | 
  113 | test.describe('Mini Apps - Co-Drawing', () => {
  114 |   test('should pair two devices and draw on shared canvas', async ({ browser }) => {
  115 |     const context1 = await browser.newContext({ viewport: { width: 375, height: 667 } });
  116 |     const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
  117 |     
  118 |     const page1 = await context1.newPage();
  119 |     const page2 = await context2.newPage();
  120 | 
  121 |     await page1.goto(`${PREVIEW_URL}/mini/draw/?debug=1`);
  122 |     await page2.goto(`${PREVIEW_URL}/mini/draw/?debug=1`);
  123 | 
  124 |     // Use manual room code
  125 |     await page1.fill('#room-input', 'DRAW42');
  126 |     await page1.click('#join-btn');
  127 |     await page2.fill('#room-input', 'DRAW42');
  128 |     await page2.click('#join-btn');
  129 | 
  130 |     await waitForPairing(page1);
  131 |     await waitForPairing(page2);
  132 | 
  133 |     // Draw on page1
  134 |     const canvas1 = await page1.locator('#canvas');
  135 |     const box1 = await canvas1.boundingBox();
  136 |     if (box1) {
  137 |       await page1.mouse.move(box1.x + 100, box1.y + 100);
  138 |       await page1.mouse.down();
  139 |       await page1.mouse.move(box1.x + 200, box1.y + 200);
  140 |       await page1.mouse.up();
  141 |     }
  142 | 
  143 |     // Wait for stroke to propagate
  144 |     await page2.waitForTimeout(500);
  145 | 
  146 |     // Verify canvas has content on page2
  147 |     const hasContent = await page2.evaluate(() => {
  148 |       const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  149 |       if (!canvas) return false;
  150 |       const ctx = canvas.getContext('2d');
  151 |       if (!ctx) return false;
  152 |       const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  153 |       return imageData.data.some(val => val !== 0);
  154 |     });
  155 | 
  156 |     expect(hasContent).toBe(true);
  157 | 
  158 |     await context1.close();
  159 |     await context2.close();
  160 |   });
  161 | });
  162 | 
  163 | test.describe('Mini Apps - Landing Page', () => {
  164 |   test('should display all three app links', async ({ page }) => {
  165 |     await page.goto(`${PREVIEW_URL}/mini/`);
  166 | 
  167 |     // Check all three app cards are present
  168 |     const shoppingLink = page.locator('a[href="shopping/"]');
  169 |     const jankenLink = page.locator('a[href="janken/"]');
  170 |     const drawLink = page.locator('a[href="draw/"]');
  171 | 
> 172 |     await expect(shoppingLink).toBeVisible();
      |                                ^ Error: expect(locator).toBeVisible() failed
  173 |     await expect(jankenLink).toBeVisible();
  174 |     await expect(drawLink).toBeVisible();
  175 | 
  176 |     // Verify content
  177 |     await expect(page.locator('h1')).toContainText('Shake Pairing Mini Apps');
  178 |   });
  179 | });
  180 | 
```