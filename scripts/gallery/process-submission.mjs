#!/usr/bin/env node
/**
 * Gallery submission processor
 * Parses issue body, validates site, detects Snap Pair usage, takes screenshot
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { parseIssueBody } from './parse-issue.mjs';
import { validateUrl, detectSnapPair, generateSlug } from './validator.mjs';

const GALLERY_FILE = 'site/gallery/gallery.json';
const THUMBS_DIR = 'site/gallery/thumbs';

async function main() {
  const issueNumber = process.env.ISSUE_NUMBER;
  const issueBody = process.env.ISSUE_BODY;
  const issueTitle = process.env.ISSUE_TITLE || '';

  if (!issueNumber || !issueBody) {
    console.error('Missing ISSUE_NUMBER or ISSUE_BODY environment variables');
    process.exit(1);
  }

  console.log(`Processing issue #${issueNumber}`);

  // Parse the issue form
  let parsed;
  try {
    parsed = parseIssueBody(issueBody);
  } catch (error) {
    setOutput('status', 'rejected');
    setOutput('reason', `Failed to parse issue: ${error.message}`);
    process.exit(0);
  }

  console.log('Parsed submission:', JSON.stringify(parsed, null, 2));

  // Validate URL format and safety
  const urlValidation = validateUrl(parsed.siteUrl);
  if (!urlValidation.valid) {
    setOutput('status', 'rejected');
    setOutput('reason', `Invalid URL: ${urlValidation.reason}`);
    process.exit(0);
  }

  // Check for duplicates
  const gallery = await loadGallery();
  const existingEntry = gallery.entries.find(e => e.url === parsed.siteUrl);
  if (existingEntry) {
    setOutput('status', 'rejected');
    setOutput('reason', `This URL is already in the gallery (submitted in issue #${existingEntry.issueNumber || 'unknown'})`);
    process.exit(0);
  }

  // Launch browser and validate site
  const browser = await chromium.launch({ headless: true });
  let validationResult;
  
  try {
    validationResult = await validateSite(browser, parsed.siteUrl, parsed.repoUrl);
  } catch (error) {
    await browser.close();
    setOutput('status', 'rejected');
    setOutput('reason', `Failed to load site: ${error.message}`);
    process.exit(0);
  }

  if (!validationResult.success) {
    await browser.close();
    setOutput('status', 'rejected');
    setOutput('reason', validationResult.reason);
    process.exit(0);
  }

  // Take screenshot
  const slug = generateSlug(parsed.title);
  const screenshotPath = path.join(THUMBS_DIR, `${slug}.webp`);
  
  try {
    await takeScreenshot(browser, parsed.siteUrl, screenshotPath);
  } catch (error) {
    console.warn('Screenshot failed, using placeholder:', error.message);
  }

  await browser.close();

  // Add to gallery
  const newEntry = {
    id: slug,
    title: parsed.title,
    description: parsed.description || '',
    url: parsed.siteUrl,
    repoUrl: parsed.repoUrl || null,
    thumbnail: screenshotPath.replace('site/', ''),
    evidence: validationResult.evidence,
    submittedAt: new Date().toISOString(),
    issueNumber: parseInt(issueNumber, 10)
  };

  gallery.entries.push(newEntry);
  gallery.lastUpdated = new Date().toISOString();

  await fs.writeFile(GALLERY_FILE, JSON.stringify(gallery, null, 2) + '\n');

  console.log('Added to gallery:', newEntry.title);

  setOutput('status', 'accepted');
  setOutput('evidence', validationResult.evidence.join(', '));
  setOutput('gallery_url', 'https://snappair.creativityiseverywhere.com/gallery/');

  process.exit(0);
}

async function validateSite(browser, url, repoUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (compatible; SnapPairGalleryBot/1.0)'
  });

  const page = await context.newPage();
  
  // Set timeout
  page.setDefaultTimeout(10000);

  const evidence = [];
  let responseStatus = null;

  // Listen for network requests to detect snap-pair in loaded resources
  page.on('request', request => {
    const url = request.url();
    if (url.includes('snap-pair') || url.includes('snappair')) {
      evidence.push(`Network request: ${url.substring(0, 100)}`);
    }
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    responseStatus = response.status();

    if (responseStatus < 200 || responseStatus >= 400) {
      return {
        success: false,
        reason: `Site returned HTTP ${responseStatus}`
      };
    }

    // Check if page has visible content
    await page.waitForTimeout(1000);
    const bodyText = await page.textContent('body');
    if (!bodyText || bodyText.trim().length < 50) {
      return {
        success: false,
        reason: 'Page appears to be blank or has minimal content'
      };
    }

    // Detect Snap Pair in page content
    const pageEvidence = await detectSnapPair(page);
    evidence.push(...pageEvidence);

    // Check repository if provided
    if (repoUrl && evidence.length === 0) {
      const repoEvidence = await checkRepository(repoUrl);
      evidence.push(...repoEvidence);
    }

    if (evidence.length === 0) {
      return {
        success: false,
        reason: 'No evidence of Snap Pair usage found. We look for: snap-pair-core, useSnapPair, SnapPair references in code, scripts, or network requests, or snap-pair-core in package.json if repo is provided.'
      };
    }

    return {
      success: true,
      evidence: evidence.slice(0, 5) // Keep top 5 pieces of evidence
    };

  } finally {
    await context.close();
  }
}

async function takeScreenshot(browser, url, outputPath) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000); // Let page settle
    
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({
      path: outputPath,
      type: 'webp',
      quality: 80
    });
  } finally {
    await context.close();
  }
}

async function checkRepository(repoUrl) {
  const evidence = [];
  
  // Extract owner/repo from GitHub URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return evidence;

  const [, owner, repo] = match;
  
  try {
    // Check package.json for snap-pair-core dependency (public repos only, no auth)
    const packageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`;
    const response = await fetch(packageUrl, {
      headers: { 'User-Agent': 'SnapPairGalleryBot/1.0' }
    });
    
    if (response.ok) {
      const pkg = await response.json();
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      
      if (deps['snap-pair-core']) {
        evidence.push(`Repository package.json lists snap-pair-core (${deps['snap-pair-core']})`);
      }
    }
  } catch (error) {
    console.warn('Could not check repository:', error.message);
  }

  return evidence;
}

async function loadGallery() {
  try {
    const content = await fs.readFile(GALLERY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Initialize new gallery file
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      entries: []
    };
  }
}

function setOutput(key, value) {
  // GitHub Actions output format
  console.log(`::set-output name=${key}::${value}`);
  
  // Also write to GITHUB_OUTPUT file if available
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFile(outputFile, `${key}=${value}\n`).catch(() => {});
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  setOutput('status', 'rejected');
  setOutput('reason', `Internal error: ${error.message}`);
  process.exit(1);
});
