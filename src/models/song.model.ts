export type SongStatus = 'pending' | 'analyzing_meta' | 'loading_audio' | 'analyzing_track' | 'ready' | 'error';

export interface Tempo {
  intro: number;
  middle: number;
  outro: number;
  stable: boolean;
}

export interface Song {
  type: 'song';
  id: number;
  title: string;
  artist: string;
  duration: number | null;
  status: SongStatus;
  errorMessage?: string;
  audioBuffer: AudioBuffer | null;
  waveform?: number[];
  beatPeaks?: number[]; // Timestamps of detected beat peaks
  
  // AI-analyzed properties
  tempo: Tempo | null;
  key: string | null; // e.g., '11B', '4A' (Camelot wheel)
  traditionalKey: string | null; // e.g., 'C Major', 'A Minor'
  mixabilityScore: number | null; // A score from 1-10
  energyLevel: 'Low' | 'Medium' | 'High' | 'Very High' | null;
  downbeats: number[] | null; // Array of timestamps for downbeats
  potentialLoopPoints: { start: number; end: number }[] | null; // Pre-analyzed good loops
  instrumentalSections: { start: number; end: number }[];
}

export interface Break {
  type: 'break';
  id: number;
  duration: number; // in seconds
  configuredDuration: number; // in minutes
}

export type PlaylistItem = Song | Break;

export interface DeckState {
  // Audio Nodes (managed internally, not part of state signal)
  sourceNode: AudioBufferSourceNode | null;
  preFaderGainNode: GainNode;
  trimGainNode: GainNode;
  eqHighNode: BiquadFilterNode;
  eqMidNode: BiquadFilterNode;
  eqLowNode: BiquadFilterNode;
  postFaderGainNode: GainNode;
  
  // Writable State
  song: Song | null;
  startTime: number;
  playbackOffset: number;
  volume: number;
  playbackRate: number;
  isPlaying: boolean;
  isScratching: boolean;
  lastScratchX: number;
  wasPlayingBeforeScratch: boolean;
  
  // Mixer State
  trim: number; // Gain knob value (0-2)
  eqHighValue: number; // -1 to 1
  eqMidValue: number; // -1 to 1
  eqLowValue: number; // -1 to 1
  isCueing: boolean;
}