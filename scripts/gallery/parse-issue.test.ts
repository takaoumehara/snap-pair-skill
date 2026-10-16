import { describe, it, expect } from 'vitest';
import { parseIssueBody } from './parse-issue.mjs';

describe('parseIssueBody', () => {
  it('parses a complete submission', () => {
    const body = `
### Site URL

https://example.com/my-app

### Title

My Quiz Game

### Description

A live quiz where audience members answer on their phones.

### Repository URL (optional)

https://github.com/user/repo

### Confirmation

- [X] This site was built with Snap Pair (snap-pair-core)
- [X] The site URL is publicly accessible over HTTPS
- [X] I have the right to submit this site to the gallery
`;

    const result = parseIssueBody(body);
    
    expect(result.siteUrl).toBe('https://example.com/my-app');
    expect(result.title).toBe('My Quiz Game');
    expect(result.description).toBe('A live quiz where audience members answer on their phones.');
    expect(result.repoUrl).toBe('https://github.com/user/repo');
    expect(result.confirmation).toBe(true);
  });

  it('parses minimal submission without description and repo', () => {
    const body = `
### Site URL

https://example.com

### Title

My App

### Confirmation

- [x] This site was built with Snap Pair (snap-pair-core)
- [x] The site URL is publicly accessible over HTTPS
- [x] I have the right to submit this site to the gallery
`;

    const result = parseIssueBody(body);
    
    expect(result.siteUrl).toBe('https://example.com');
    expect(result.title).toBe('My App');
    expect(result.description).toBe('');
    expect(result.repoUrl).toBe('');
    expect(result.confirmation).toBe(true);
  });

  it('throws when site URL is missing', () => {
    const body = `
### Title

My App

### Confirmation

- [X] This site was built with Snap Pair
`;

    expect(() => parseIssueBody(body)).toThrow('Site URL is required');
  });

  it('throws when title is missing', () => {
    const body = `
### Site URL

https://example.com

### Confirmation

- [X] This site was built with Snap Pair
`;

    expect(() => parseIssueBody(body)).toThrow('Title is required');
  });

  it('throws when confirmation is not checked', () => {
    const body = `
### Site URL

https://example.com

### Title

My App

### Confirmation

- [ ] This site was built with Snap Pair
`;

    expect(() => parseIssueBody(body)).toThrow('Confirmation checkboxes must be checked');
  });

  it('handles empty body', () => {
    expect(() => parseIssueBody('')).toThrow('Issue body is empty or invalid');
    expect(() => parseIssueBody(null)).toThrow('Issue body is empty or invalid');
  });

  it('extracts URLs from longer text', () => {
    const body = `
### Site URL

Check out my site at https://example.com/path?param=value and let me know what you think!

### Title

Test Site

### Confirmation

- [x] Confirmed
`;

    const result = parseIssueBody(body);
    expect(result.siteUrl).toBe('https://example.com/path?param=value');
  });
});
