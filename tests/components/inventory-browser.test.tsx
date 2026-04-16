// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryBrowser } from '../../src/components/react/InventoryBrowser';

describe('InventoryBrowser', () => {
  it('renders heading and search controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] })
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InventoryBrowser />);

    expect(screen.getByText('My Collection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print / Save PDF' })).toHaveAttribute(
      'href',
      '/print/collection?mediaType=all'
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
