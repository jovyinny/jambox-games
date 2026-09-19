import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PhonePlayerScreen } from './PhonePlayerScreen';
import { loadSpotifyConnection, ensureVerzuzPlaylist, fetchSpotifyPlaylistTracks } from '../../spotify/client';

vi.mock('../../lobby/useLobbySession', () => ({ useLobbySession: () => ({
  socketStatus: 'connected', pairedRoom: { name: 'Room' }, message: 'Paired', phoneName: 'Phone',
  setPhoneName: vi.fn(), setLobbyCodeInput: vi.fn(), connect: vi.fn(), pairPhone: vi.fn(),
  onBeatState: null, lyricsState: null, sendSelectedTrack: vi.fn(), sendOnBeatAttempt: vi.fn(), sendLyricsAttempt: vi.fn(),
}) }));
vi.mock('../../spotify/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../spotify/client')>(),
  loadSpotifyConnection: vi.fn(), ensureVerzuzPlaylist: vi.fn(), fetchSpotifyPlaylistTracks: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('loads the connected player playlist into the phone queue', async () => {
  vi.mocked(loadSpotifyConnection).mockReturnValue({ accessToken: 'test', refreshToken: null, expiresAt: 9999999999999, profileName: 'Alice', spotifyUserId: 'alice', savedTracks: [], subscription: 'premium' });
  vi.mocked(ensureVerzuzPlaylist).mockResolvedValue({ id: 'list', name: 'Jambox Verzuz', ownerName: 'Alice', trackCount: 1 });
  vi.mocked(fetchSpotifyPlaylistTracks).mockResolvedValue([{ id: 'song', name: 'Local Party', artistNames: 'Artist', uri: 'spotify:track:song' }]);
  render(<PhonePlayerScreen lobbyCode="ABC123" playerSlot={1} expectedGame="vs" />);
  expect(await screen.findByText('Next up: Local Party')).toBeInTheDocument();
  expect(screen.getByText('Alice')).toBeInTheDocument();
});

it('keeps a failed playlist load visible and lets the connected player retry', async () => {
  vi.mocked(loadSpotifyConnection).mockReturnValue({ accessToken: 'test', refreshToken: null, expiresAt: 9999999999999, profileName: 'Alice', spotifyUserId: 'alice', savedTracks: [], subscription: 'premium' });
  vi.mocked(ensureVerzuzPlaylist).mockRejectedValueOnce(new Error('Offline'));
  render(<PhonePlayerScreen lobbyCode="ABC123" playerSlot={1} expectedGame="vs" />);
  expect(await screen.findByText(/Could not load Jambox Verzuz/)).toBeInTheDocument();
  expect(screen.getByText('Alice')).toBeInTheDocument();
  vi.mocked(ensureVerzuzPlaylist).mockResolvedValue({ id: 'list', name: 'Jambox Verzuz', ownerName: 'Alice', trackCount: 0 });
  vi.mocked(fetchSpotifyPlaylistTracks).mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Queue' }));
  expect(await screen.findByText(/playlist is empty/)).toBeInTheDocument();
});
