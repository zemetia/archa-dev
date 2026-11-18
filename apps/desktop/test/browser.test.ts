import { describe, expect, it } from 'vitest';
import { browserCommandSchema } from '@archa/protocol';
import { addressToUrl, normalizeUrl } from '../src/main/browser-url';
import { PAGE_LIB } from '../src/main/browser-page';

describe('normalizeUrl', () => {
  it('keeps full http(s) URLs', () => {
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeUrl('  http://x.dev  ')).toBe('http://x.dev');
  });
  it('treats local addresses as http', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeUrl('localhost')).toBe('http://localhost');
    expect(normalizeUrl('127.0.0.1:5173/app')).toBe('http://127.0.0.1:5173/app');
  });
  it('treats bare domains, with or without a port, as https', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('example.com:8080/x')).toBe('https://example.com:8080/x');
  });
  it('turns paths into file URLs', () => {
    if (process.platform === 'win32') expect(normalizeUrl('C:\\site\\index.html')).toBe('file:///C:/site/index.html');
    expect(normalizeUrl('C:/site/index.html')).toMatch(/^file:\/\//);
    expect(normalizeUrl('/tmp/a.html')).toMatch(/^file:\/\/\//);
  });
  it('refuses script and unknown schemes', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(/not allowed/);
    expect(() => normalizeUrl('chrome://settings')).toThrow(/not allowed/);
    expect(() => normalizeUrl('   ')).toThrow(/empty/);
  });
});

describe('addressToUrl', () => {
  it('loads addresses and searches everything else', () => {
    expect(addressToUrl('example.com')).toBe('https://example.com');
    expect(addressToUrl('localhost')).toBe('http://localhost');
    expect(addressToUrl('facebook,com')).toBe('https://www.google.com/search?q=facebook%2Ccom');
    expect(addressToUrl('tailwind grid docs')).toBe('https://www.google.com/search?q=tailwind%20grid%20docs');
  });
});

describe('browserCommandSchema', () => {
  it('accepts each documented action shape', () => {
    for (const cmd of [
      { action: 'open', url: 'localhost:3000' },
      { action: 'click', ref: 'e3', clickCount: 2 },
      { action: 'type', selector: '#q', text: 'hi', submit: true },
      { action: 'scroll', dy: 600 },
      { action: 'screenshot', fullPage: true, labels: true },
      { action: 'tabs', op: 'switch', tabId: 't2' },
      { action: 'cdp', method: 'Network.getCookies', params: {} },
    ]) expect(browserCommandSchema.safeParse(cmd).success).toBe(true);
  });
  it('rejects unknown actions and out-of-range values', () => {
    expect(browserCommandSchema.safeParse({ action: 'teleport' }).success).toBe(false);
    expect(browserCommandSchema.safeParse({ action: 'click', clickCount: 9 }).success).toBe(false);
    expect(browserCommandSchema.safeParse({ action: 'wait', timeout: 600_000 }).success).toBe(false);
  });
});

describe('PAGE_LIB', () => {
  it('is valid JavaScript with no template interpolation', () => {
    expect(PAGE_LIB).not.toContain('${');
    expect(() => new Function(PAGE_LIB)).not.toThrow();
  });
});
