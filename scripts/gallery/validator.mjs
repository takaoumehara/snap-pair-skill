/**
 * URL validation and Snap Pair detection
 */

const PRIVATE_IP_RANGES = [
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|::1)/i,
  /^https?:\/\/10\.\d+\.\d+\.\d+/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
  /^https?:\/\/192\.168\.\d+\.\d+/,
  /^https?:\/\/169\.254\.\d+\.\d+/,
  /^https?:\/\/\[?fe80:/i,
  /^https?:\/\/\[?fc00:/i,
  /^https?:\/\/\[?fd00:/i
];

const SNAP_PAIR_PATTERNS = [
  'snap-pair-core',
  'snap-pair',
  'snappair',
  'useSnapPair',
  'useTransportSnapPair',
  'SnapPair',
  'FirebaseTransport',
  'PartyKitTransport',
  'WebRTCTransport',
  'BroadcastChannelTransport'
];

/**
 * Validate URL format and security
 */
export function validateUrl(url) {
  // Basic URL format check first
  try {
    new URL(url);
  } catch {
    return {
      valid: false,
      reason: 'Invalid URL format'
    };
  }

  // Must be HTTPS
  if (!url.startsWith('https://')) {
    return {
      valid: false,
      reason: 'URL must use HTTPS'
    };
  }

  // Check for private/localhost IPs
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(url)) {
      return {
        valid: false,
        reason: 'URL cannot point to a private or localhost IP address'
      };
    }
  }

  return { valid: true };
}

/**
 * Detect Snap Pair usage in page
 */
export async function detectSnapPair(page) {
  const evidence = [];

  try {
    // Check HTML content
    const html = await page.content();
    for (const pattern of SNAP_PAIR_PATTERNS) {
      if (html.includes(pattern)) {
        evidence.push(`Found "${pattern}" in HTML`);
      }
    }

    // Check script tags
    const scripts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script[src]'))
        .map(s => s.src)
        .filter(src => src.includes('snap-pair') || src.includes('snappair'));
    });

    for (const src of scripts) {
      evidence.push(`Script: ${src.substring(0, 80)}`);
    }

    // Check for data attributes or class names
    const hasSnapPairElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('[class*="snap-pair"], [id*="snap-pair"], [data-snap-pair]');
      return elements.length > 0;
    });

    if (hasSnapPairElements) {
      evidence.push('Found Snap Pair-related elements in DOM');
    }

    // Check for specific function calls in inline scripts
    const hasSnapPairCalls = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      return scripts.some(script => {
        const text = script.textContent || '';
        return text.includes('useSnapPair') || 
               text.includes('Transport') || 
               text.includes('snap-pair');
      });
    });

    if (hasSnapPairCalls) {
      evidence.push('Found Snap Pair function calls in inline scripts');
    }

  } catch (error) {
    console.warn('Detection error:', error.message);
  }

  return evidence;
}

/**
 * Generate URL-safe slug from title
 */
export function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}
