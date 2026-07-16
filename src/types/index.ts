export interface SnapPlayer {
  id: string;
  name: string;
  connected: boolean;
  [key: string]: any; // Allows extending with custom properties (e.g., player marks, ready state)
}

export interface SnapRoom<TPlayer extends SnapPlayer = SnapPlayer, TState = any> {
  id: string;
  code: string;
  hostId: string; // The player ID (or auth UID) of the room host
  maxPlayers: number; // Maximum allowed players in the room
  players: Record<string, TPlayer>; // Map of playerId -> TPlayer to prevent write race conditions
  status: 'waiting' | 'playing' | 'finished' | 'closed' | 'abandoned';
  createdAt: number;
  updatedAt: number;
  state?: TState;
}
