import { describe, it, expect } from 'vitest';
import { validateUrl, generateSlug } from './validator.mjs';

describe('validateUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(validateUrl('https://example.com')).toEqual({ valid: true });
    expect(validateUrl('https://subdomain.example.com/path')).toEqual({ valid: true });
    expect(validateUrl('https://example.com:8443/app')).toEqual({ valid: true });
  });

  it('rejects HTTP URLs', () => {
    const result = validateUrl('http://example.com');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('HTTPS');
  });

  it('rejects localhost URLs', () => {
    expect(validateUrl('https://localhost').valid).toBe(false);
    expect(validateUrl('https://127.0.0.1').valid).toBe(false);
    expect(validateUrl('https://127.0.0.42').valid).toBe(false);
  });

  it('rejects private IP ranges', () => {
    expect(validateUrl('https://10.0.0.1').valid).toBe(false);
    expect(validateUrl('https://172.16.0.1').valid).toBe(false);
    expect(validateUrl('https://172.31.255.255').valid).toBe(false);
    expect(validateUrl('https://192.168.1.1').valid).toBe(false);
    expect(validateUrl('https://169.254.0.1').valid).toBe(false);
  });

  it('rejects link-local IPv6', () => {
    expect(validateUrl('https://[fe80::1]').valid).toBe(false);
    expect(validateUrl('https://[fc00::1]').valid).toBe(false);
    expect(validateUrl('https://[fd00::1]').valid).toBe(false);
  });

  it('rejects invalid URL format', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid URL');
  });
});

describe('generateSlug', () => {
  it('converts title to lowercase slug', () => {
    expect(generateSlug('My Quiz Game')).toBe('my-quiz-game');
    expect(generateSlug('Interactive Drawing Board')).toBe('interactive-drawing-board');
  });

  it('removes special characters', () => {
    expect(generateSlug('My App! (2024)')).toBe('my-app-2024');
    expect(generateSlug('Test & Demo Site')).toBe('test-demo-site');
  });

  it('collapses multiple dashes', () => {
    expect(generateSlug('Too   Many    Spaces')).toBe('too-many-spaces');
    expect(generateSlug('App -- v2')).toBe('app-v2');
  });

  it('trims leading and trailing dashes', () => {
    expect(generateSlug('-Leading')).toBe('leading');
    expect(generateSlug('Trailing-')).toBe('trailing');
    expect(generateSlug('---Both---')).toBe('both');
  });

  it('truncates to 60 characters', () => {
    const longTitle = 'A'.repeat(100);
    const slug = generateSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('handles unicode characters', () => {
    expect(generateSlug('Café ☕ App')).toBe('caf-app');
    expect(generateSlug('日本語タイトル')).toBe('');
  });

  it('handles empty or whitespace-only titles', () => {
    expect(generateSlug('')).toBe('');
    expect(generateSlug('   ')).toBe('');
  });
});
