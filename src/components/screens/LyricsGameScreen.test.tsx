import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LYRICS_TRACKS } from '../../game/lyricsCatalog.generated';
import { LobbySessionProvider } from '../../lobby/LobbySessionProvider';
import { LyricsGameScreen } from './LyricsGameScreen';

afterEach(cleanup);
it('initializes both players at zero with a ready bundled round', () => {
  render(<LobbySessionProvider><LyricsGameScreen sessionId={1} track={LYRICS_TRACKS[0]} onComplete={vi.fn()} onBackToSetup={vi.fn()} /></LobbySessionProvider>);
  expect(screen.getByText('P1 0')).toBeInTheDocument();
  expect(screen.getByText('P2 0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start Lyrics Run' })).toBeEnabled();
});
