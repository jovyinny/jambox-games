import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LyricsSetupScreen } from './LyricsSetupScreen';
import { LYRICS_TRACKS } from '../../game/lyricsCatalog.generated';
import { searchYoutubeInstrumentals } from '../../game/lyricsLibrary';

vi.mock('../../game/lyricsLibrary', () => ({
  hasYoutubeApiKey: () => true,
  searchYoutubeInstrumentals: vi.fn(),
  CURATED_LYRICS_SEEDS: [],
  buildLyricsTrackFromSeed: vi.fn(),
  buildLyricsTrackFromYoutube: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows initial loading then a recoverable search error without disabling the bundled track', async () => {
  let rejectSearch!: (error: Error) => void;
  vi.mocked(searchYoutubeInstrumentals).mockReturnValue(new Promise((_, reject) => { rejectSearch = reject; }));
  render(<LyricsSetupScreen fallbackTracks={LYRICS_TRACKS} selectedTrack={LYRICS_TRACKS[0]} onSelectTrack={vi.fn()} onStart={vi.fn()} onBackToMenu={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Searching...' })).toBeDisabled();
  await act(async () => rejectSearch(new Error('Search unavailable')));
  expect(screen.getByText('Search unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start Lyrics Mode' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Search Songs' })).toBeEnabled();
});
