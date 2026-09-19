import { createContext, useContext } from 'react';
import type { LyricsAttemptSnapshot, LyricsLiveState, LobbySnapshot, OnBeatAttemptSnapshot, OnBeatLiveState, RoomSnapshot } from '../network/lobbyProtocol';

export interface SelectedTrackPayload {
  trackId: string;
  trackName: string;
  artistNames: string;
  uri: string;
  playerSlot: 1 | 2;
}

export interface LobbySessionValue {
  socketStatus: 'disconnected' | 'connected';
  message: string;
  lobbyCodeInput: string;
  setLobbyCodeInput: (value: string) => void;
  lobby: LobbySnapshot | null;
  accessPoint: RoomSnapshot | null;
  phoneName: string;
  setPhoneName: (value: string) => void;
  pairedRoom: RoomSnapshot | null;
  playerSlot: 1 | 2 | null;
  selectedTracks: Record<number, SelectedTrackPayload | null>;
  onBeatState: OnBeatLiveState | null;
  onBeatAttempts: OnBeatAttemptSnapshot[];
  lyricsState: LyricsLiveState | null;
  lyricsAttempts: LyricsAttemptSnapshot[];
  connect: () => void;
  disconnect: () => void;
  createLobby: () => void;
  joinLobby: () => void;
  leaveLobby: () => void;
  pairPhone: (slot?: 1 | 2) => void;
  sendSelectedTrack: (payload: SelectedTrackPayload) => void;
  publishOnBeatState: (state: OnBeatLiveState) => void;
  sendOnBeatAttempt: (attempt: OnBeatAttemptSnapshot) => void;
  publishLyricsState: (state: LyricsLiveState) => void;
  sendLyricsAttempt: (attempt: LyricsAttemptSnapshot) => void;
}

export const LobbySessionContext = createContext<LobbySessionValue | null>(null);

export function useLobbySession() {
  const value = useContext(LobbySessionContext);
  if (!value) {
    throw new Error('useLobbySession must be used within LobbySessionProvider');
  }
  return value;
}
