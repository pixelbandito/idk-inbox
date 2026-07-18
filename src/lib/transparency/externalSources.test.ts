import { describe, it, expect } from 'vitest';
import { gmailLabelUrl, externalSources, hasNoServerSources } from './externalSources';

describe('gmailLabelUrl', () => {
  it('deep-links a label, encoding nested slashes as %2F', () => {
    expect(gmailLabelUrl('idk-inbox')).toBe('https://mail.google.com/mail/u/0/#label/idk-inbox');
    expect(gmailLabelUrl('idk-inbox/Snoozed')).toBe(
      'https://mail.google.com/mail/u/0/#label/idk-inbox%2FSnoozed',
    );
  });
});

describe('externalSources', () => {
  it('lists the Gmail-label source with a working link', () => {
    const sources = externalSources();
    const labels = sources.find((s) => s.kind === 'gmail-label');
    expect(labels?.url).toContain('mail.google.com');
  });

  it('reports no server-side sources while the app is client-only', () => {
    expect(hasNoServerSources()).toBe(true);
  });
});
