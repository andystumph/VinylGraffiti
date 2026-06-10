// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WantList } from '../../src/components/react/WantList';

describe('WantList', () => {
  it('renders heading and print link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] })
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WantList />);

    expect(screen.getByText('Want List')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search Metadata' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print / Save PDF' })).toHaveAttribute(
      'href',
      '/print/want-list?acquired=exclude'
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it('adds want-list item from search results', async () => {
    const fetchMock = vi
      .fn()
      // initial load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })
      // metadata search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              releaseMbid: '11111111-1111-1111-1111-111111111111',
              releaseGroupMbid: null,
              title: 'Kind of Blue',
              artist: 'Miles Davis',
              releaseDate: '1959-08-17',
              score: 100
            }
          ]
        })
      })
      // add from search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42 })
      })
      // refresh list
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 42,
              artist: 'Miles Davis',
              title: 'Kind of Blue',
              mediaType: null,
              notes: null,
              isAcquired: false,
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        })
      });

    vi.stubGlobal('fetch', fetchMock);

    render(<WantList />);

    fireEvent.change(screen.getByLabelText('Want list search'), { target: { value: 'miles davis kind of blue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Metadata' }));

    expect(await screen.findByText('Kind of Blue')).toBeInTheDocument();
    const resultCards = screen.getAllByText('Kind of Blue');
    const resultCard = resultCards[0].closest('article');
    expect(resultCard).toBeTruthy();
    fireEvent.click(within(resultCard as HTMLElement).getByRole('button', { name: 'Add To Want List' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Add' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/want-list',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/want-list' && (call[1] as { method?: string })?.method === 'POST'
    );
    expect(postCall).toBeTruthy();

    const postBody = JSON.parse(((postCall?.[1] as { body?: string }).body ?? '{}'));
    expect(postBody.artist).toBe('Miles Davis');
    expect(postBody.title).toBe('Kind of Blue');
    expect(postBody.allowDuplicate).toBe(false);
  });

  it('asks for duplicate confirmation before adding a duplicate', async () => {
    const fetchMock = vi
      .fn()
      // initial load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })
      // metadata search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              releaseMbid: '11111111-1111-1111-1111-111111111111',
              releaseGroupMbid: null,
              title: 'Kind of Blue',
              artist: 'Miles Davis',
              releaseDate: '1959-08-17',
              score: 100
            }
          ]
        })
      })
      // first add attempt returns duplicate confirmation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          requiresDuplicateConfirmation: true,
          existingId: 9,
          existingIsAcquired: false,
          existingMediaType: null
        })
      })
      // duplicate confirm add
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 43 })
      })
      // refresh list
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 9,
              artist: 'Miles Davis',
              title: 'Kind of Blue',
              mediaType: null,
              notes: null,
              isAcquired: false,
              createdAt: '2026-01-01T00:00:00.000Z'
            },
            {
              id: 43,
              artist: 'Miles Davis',
              title: 'Kind of Blue',
              mediaType: null,
              notes: null,
              isAcquired: false,
              createdAt: '2026-01-02T00:00:00.000Z'
            }
          ]
        })
      });

    vi.stubGlobal('fetch', fetchMock);

    render(<WantList />);

    fireEvent.change(screen.getByLabelText('Want list search'), { target: { value: 'miles davis kind of blue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Metadata' }));

    expect(await screen.findByText('Kind of Blue')).toBeInTheDocument();
    const resultCards = screen.getAllByText('Kind of Blue');
    const resultCard = resultCards[0].closest('article');
    expect(resultCard).toBeTruthy();

    fireEvent.click(within(resultCard as HTMLElement).getByRole('button', { name: 'Add To Want List' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Add' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, Add Duplicate' }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (call) => call[0] === '/api/want-list' && (call[1] as { method?: string })?.method === 'POST'
      );
      expect(postCalls).toHaveLength(2);
    });

    const postCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/want-list' && (call[1] as { method?: string })?.method === 'POST'
    );
    const firstBody = JSON.parse((((postCalls[0]?.[1] as { body?: string }) ?? {}).body ?? '{}'));
    const secondBody = JSON.parse((((postCalls[1]?.[1] as { body?: string }) ?? {}).body ?? '{}'));

    expect(firstBody.allowDuplicate).toBe(false);
    expect(secondBody.allowDuplicate).toBe(true);
    expect(await screen.findByText('Added duplicate want list item #43')).toBeInTheDocument();
  });
});
