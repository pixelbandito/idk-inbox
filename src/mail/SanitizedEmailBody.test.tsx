import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SanitizedEmailBody } from './SanitizedEmailBody';

function shadowHtml(container: HTMLElement): string {
  const host = container.querySelector('.email-html__body');
  return host?.shadowRoot?.innerHTML ?? '';
}

describe('SanitizedEmailBody', () => {
  it('renders sanitised HTML into a shadow root', () => {
    const { container } = render(<SanitizedEmailBody html="<p>Hello <b>world</b></p><script>bad()</script>" />);
    const html = shadowHtml(container);
    expect(html).toContain('<b>world</b>');
    expect(html).not.toContain('<script');
    // The scoped reset is injected too.
    expect(html).toContain(':host');
  });

  it('withholds remote images until the reader shows them', () => {
    const { container } = render(<SanitizedEmailBody html='<img src="https://tracker.example.com/p.gif">' />);
    expect(shadowHtml(container)).not.toContain('tracker.example.com');
    expect(screen.getByRole('button', { name: /show images/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show images/i }));

    expect(shadowHtml(container)).toContain('https://tracker.example.com/p.gif');
    expect(screen.queryByRole('button', { name: /show images/i })).toBeNull();
  });

  it('shows no "show images" control for image-free mail', () => {
    render(<SanitizedEmailBody html="<p>just text</p>" />);
    expect(screen.queryByRole('button', { name: /show images/i })).toBeNull();
  });
});
