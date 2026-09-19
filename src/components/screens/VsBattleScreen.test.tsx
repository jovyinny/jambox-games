import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VsBattleScreen } from './VsBattleScreen';
import type { SpotifyConnection } from '../../spotify/client';

vi.mock('../../spotify/webPlayback', () => ({ loadSpotifyWebPlaybackSdk: vi.fn().mockRejectedValue(new Error('SDK offline')) }));
afterEach(cleanup);
it('resets failed playback when the round changes to a disconnected player', async () => {
  const connection: SpotifyConnection = { accessToken: 'test-token', refreshToken: null, expiresAt: 9999999999999, profileName: 'Player', spotifyUserId: 'p1', savedTracks: [], subscription: 'premium' };
  const props = { players: [{ name: 'One' }, { name: 'Two' }], spotifyConnections: [connection, null], scores: [0, 0] as [number, number], roundIndex: 0, roundCount: 3, currentCategory: 'Soul', history: [], currentTrack: { id: 'track', name: 'Song', artistNames: 'Artist', uri: 'spotify:track:track' }, onAwardRound: vi.fn(), onBackToSetup: vi.fn() };
  const { rerender } = render(<VsBattleScreen {...props} />);
  expect(await screen.findByText(/Could not load Spotify SDK/)).toBeInTheDocument();
  rerender(<VsBattleScreen {...props} roundIndex={1} />);
  expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
  expect(screen.queryByText(/Could not load Spotify SDK/)).not.toBeInTheDocument();
  expect(screen.getByTitle('Spotify player for Song')).toBeInTheDocument();
});
