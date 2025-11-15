import { MixAction } from './mix-action.model';

export interface MixInstruction {
  fromSongId: number;
  toSongId: number;
  
  /** The point in seconds in the outgoing track (fromSong) where the transition should begin. */
  transitionPointSeconds: number;
  
  /** The target BPM for the incoming track (toSong) to match the outgoing track. */
  toSongBpm: number;

  /** The precise time in seconds to offset the start of the incoming track to align beats. */
  toSongStartOffset?: number;

  /** A sequence of actions to perform the mix. */
  actions: MixAction[];
}