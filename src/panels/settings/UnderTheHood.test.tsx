import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnderTheHood } from './UnderTheHood';

describe('UnderTheHood', () => {
  it('links to the Gmail labels and to the permissions page, safely', () => {
    render(<UnderTheHood />);

    const gmail = screen.getByRole('link', { name: /open in google/i });
    expect(gmail).toHaveAttribute('href', expect.stringContaining('mail.google.com'));
    expect(gmail).toHaveAttribute('target', '_blank');
    expect(gmail).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByRole('link', { name: /what idk-inbox can access/i }))
      .toHaveAttribute('href', 'https://myaccount.google.com/permissions');
  });

  it('is upfront that the app uses no external scripts or sheets today', () => {
    render(<UnderTheHood />);
    expect(screen.getByText(/no external servers, apps scripts, or spreadsheets/i))
      .toBeInTheDocument();
  });
});
