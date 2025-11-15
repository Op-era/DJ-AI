import { Injectable, signal, computed, inject, WritableSignal, Signal, NgZone } from '@angular/core';
import { Song, PlaylistItem, DeckState, Break } from '../models/song.model';
import { AiService } from './ai.service';
import { MixInstruction } from '../models/mix-instruction.model';
import { LogService } from './log.service';

const createDefaultDeckState = (audioContext: AudioContext): DeckState => {
  const preFaderGainNode = audioContext.createGain();
  const trimGainNode = audioContext.createGain();
  const eqHighNode = audioContext.createBiquadFilter();
  eqHighNode.type = 'highshelf';
  eqHighNode.frequency.value = 10000;
  const eqMidNode = audioContext.createBiquadFilter();
  eqMidNode.type = 'peaking';
  eqMidNode.frequency.value = 1000;
  eqMidNode.Q.value = 0.5;
  const eqLowNode = audioContext.createBiquadFilter();
  eqLowNode.type = 'lowshelf';
  eqLowNode.frequency.value = 200;
  const postFaderGainNode = audioContext.createGain();

  trimGainNode.connect(eqLowNode);
  eqLowNode.connect(eqMidNode);
  eqMidNode.connect(eqHighNode);
  eqHighNode.connect(preFaderGainNode);
  preFaderGainNode.connect(postFaderGainNode);

  return {
    sourceNode: null, preFaderGainNode, trimGainNode, eqHighNode, eqMidNode, eqLowNode, postFaderGainNode,
    song: null,
    startTime: 0,
    playbackOffset: 0,
    volume: 1,
    playbackRate: 1,
    isPlaying: false,
    isScratching: false,
    lastScratchX: 0,
    wasPlayingBeforeScratch: false,
    trim: 1,
    eqHighValue: 0,
    eqMidValue: 0,
    eqLowValue: 0,
    isCueing: false
  };
};


@Injectable({
  providedIn: 'root'
})
export class AudioPlaybackService {
  private audioContext = new AudioContext();
  private crossfaderNode = this.audioContext.createGain();
  private masterVolumeNode = this.audioContext.createGain();
  private cueVolumeNode = this.audioContext.createGain();
  private zone = inject(NgZone);
  private logger = inject(LogService);

  // Public state signals
  deckA = signal<DeckState>(createDefaultDeckState(this.audioContext));
  deckB = signal<DeckState>(createDefaultDeckState(this.audioContext));
  masterVolume = signal(0.7);
  cueVolume = signal(0.7);
  cueMix = signal(0.5); // 0 = main, 1 = cue
  breakState = signal({ onBreak: false, timeRemaining: 0 });

  private playlist: WritableSignal<PlaylistItem[]> = signal([]);
  private currentTrackIndex = signal(0);
  private djMode: 'Manual' | 'AI' = 'Manual';
  private mixInstruction: MixInstruction | null = null;
  private mixTimer: any;
  private breakTimer: any;
  
  // Public computed signals
  isPlaying = computed(() => this.deckA().isPlaying || this.deckB().isPlaying);
  
  constructor(private aiService: AiService) {
    this.logger.info('AudioPlaybackService', 'Constructor called, AudioContext created.');
    this.masterVolumeNode.connect(this.audioContext.destination);
    
    // Connect decks to crossfader
    this.deckA().postFaderGainNode.connect(this.crossfaderNode);
    this.deckB().postFaderGainNode.connect(this.masterVolumeNode); // Bypasses crossfader for now

    this.setCrossfader(-1); // Default to Deck A

    // Connect cue outputs
    this.deckA().preFaderGainNode.connect(this.cueVolumeNode);
    this.deckB().preFaderGainNode.connect(this.cueVolumeNode);
    
    this.setMasterVolume(this.masterVolume());
    this.setCueVolume(this.cueVolume());
  }

  // --- Public Control Methods ---
  
  setDjMode(mode: 'Manual' | 'AI', playlist: WritableSignal<PlaylistItem[]>) {
    this.logger.info('AudioPlaybackService', `Setting DJ mode to ${mode}`);
    this.djMode = mode;
    this.playlist = playlist;
  }

  loadTrackToDeck(song: Song, deckId: 'A' | 'B') {
    this.logger.info('AudioPlaybackService', `Loading track ID ${song.id} to Deck ${deckId}`);
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
      if (d.sourceNode) {
        d.sourceNode.stop();
      }
      return { ...d, song, playbackOffset: 0, isPlaying: false, playbackRate: 1 };
    });
  }

  toggleDeckPlayback(deckId: 'A' | 'B') {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    this.logger.info('AudioPlaybackService', `Toggling playback on Deck ${deckId}. Current state: ${deck().isPlaying ? 'playing' : 'paused'}`);
    if (deck().isPlaying) {
      this.pauseDeck(deckId);
    } else {
      this.playDeck(deckId);
    }
  }

  setVolume(deckId: 'A' | 'B', volume: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
      d.preFaderGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      return { ...d, volume };
    });
  }

  setTrim(deckId: 'A' | 'B', trim: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
      d.trimGainNode.gain.setValueAtTime(trim, this.audioContext.currentTime);
      return { ...d, trim };
    });
  }
  
  setEq(deckId: 'A' | 'B', band: 'High' | 'Mid' | 'Low', value: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
        const dbValue = value * 24; // +/- 24dB
        if(band === 'High') { d.eqHighNode.gain.setValueAtTime(dbValue, this.audioContext.currentTime); return {...d, eqHighValue: value}; }
        if(band === 'Mid') { d.eqMidNode.gain.setValueAtTime(dbValue, this.audioContext.currentTime); return {...d, eqMidValue: value}; }
        if(band === 'Low') { d.eqLowNode.gain.setValueAtTime(dbValue, this.audioContext.currentTime); return {...d, eqLowValue: value}; }
        return d;
    });
  }

  setPlaybackRate(deckId: 'A' | 'B', rate: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
      if (d.sourceNode) {
        d.sourceNode.playbackRate.setValueAtTime(rate, this.audioContext.currentTime);
      }
      return { ...d, playbackRate: rate };
    });
  }
  
  setBpm(deckId: 'A' | 'B', targetBpm: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    const songBpm = deck().song?.tempo?.middle;
    if (songBpm && targetBpm > 0) {
        const newRate = targetBpm / songBpm;
        this.logger.debug('AudioPlaybackService', `Setting Deck ${deckId} BPM to ${targetBpm} by changing rate to ${newRate.toFixed(3)}`);
        this.setPlaybackRate(deckId, newRate);
    }
  }

  syncDeck(deckId: 'A' | 'B') {
      this.logger.info('AudioPlaybackService', `Syncing Deck ${deckId}`);
      const sourceDeck = deckId === 'A' ? this.deckA() : this.deckB();
      const targetDeck = deckId === 'A' ? this.deckB() : this.deckA();

      const sourceBpm = sourceDeck.song?.tempo?.middle;
      const targetBpm = targetDeck.song?.tempo?.middle;
      
      if (sourceBpm && targetBpm && targetDeck.isPlaying) {
          const newRate = (targetBpm * targetDeck.playbackRate) / sourceBpm;
          this.logger.debug('AudioPlaybackService', `Syncing Deck ${deckId} to master deck. New rate: ${newRate.toFixed(3)}`);
          this.setPlaybackRate(deckId, newRate);
      } else {
          this.logger.warn('AudioPlaybackService', `Sync failed for Deck ${deckId}. Conditions not met.`);
      }
  }

  toggleCue(deckId: 'A' | 'B') {
      const deck = deckId === 'A' ? this.deckA : this.deckB;
      deck.update(d => ({ ...d, isCueing: !d.isCueing }));
      this.logger.info('AudioPlaybackService', `Toggled cue for Deck ${deckId}. New state: ${deck().isCueing}`);
      this.updateCueSystem();
  }

  startScratch(deckId: 'A' | 'B') {
    this.logger.debug('AudioPlaybackService', `Scratch started on Deck ${deckId}`);
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
      const wasPlaying = d.isPlaying;
      if (wasPlaying) this.pauseDeck(deckId);
      return { ...d, isScratching: true, wasPlayingBeforeScratch: wasPlaying };
    });
  }

  updateScratch(deckId: 'A' | 'B', movementX: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    const { song, playbackRate, playbackOffset } = deck();
    if (!song?.audioBuffer || !deck().isScratching) return;

    const scratchSpeed = 0.005;
    const timeAdjustment = movementX * scratchSpeed * playbackRate;
    
    let newOffset = playbackOffset + timeAdjustment;
    newOffset = Math.max(0, Math.min(newOffset, song.duration!));

    this.playDeck(deckId, newOffset);
    
    setTimeout(() => this.zone.run(() => this.pauseDeck(deckId)), 10);
  }

  stopScratch(deckId: 'A' | 'B') {
    this.logger.debug('AudioPlaybackService', `Scratch stopped on Deck ${deckId}`);
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    deck.update(d => {
      if (d.wasPlayingBeforeScratch) {
        this.playDeck(deckId);
      }
      return { ...d, isScratching: false };
    });
  }

  setCrossfader(value: number) {
    const gainA = Math.cos((value + 1) * 0.25 * Math.PI);
    const gainB = Math.cos((1 - value) * 0.25 * Math.PI);
    this.deckA().postFaderGainNode.gain.setValueAtTime(gainA, this.audioContext.currentTime);
    this.deckB().postFaderGainNode.gain.setValueAtTime(gainB, this.audioContext.currentTime);
  }

  setMasterVolume(volume: number) {
    this.masterVolume.set(volume);
    this.masterVolumeNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
  }

  setCueVolume(volume: number) {
    this.cueVolume.set(volume);
    this.updateCueSystem();
  }

  setCueMix(mix: number) {
      this.cueMix.set(mix);
  }

  // --- AI DJ Logic ---
  play(playlist: WritableSignal<PlaylistItem[]>, startIndex: number) {
    this.logger.info('AudioPlaybackService', `AI DJ started with playlist of ${playlist().length} tracks.`);
    this.playlist = playlist;
    this.currentTrackIndex.set(startIndex);
    this.startCurrentTrack();
  }

  stop() {
    this.logger.info('AudioPlaybackService', 'AI DJ stopped.');
    this.pauseDeck('A');
    this.pauseDeck('B');
    clearTimeout(this.mixTimer);
    clearTimeout(this.breakTimer);
    this.breakState.set({ onBreak: false, timeRemaining: 0 });
  }

  // --- Internal Methods ---

  private playDeck(deckId: 'A' | 'B', offset?: number) {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    const d = deck();

    if (d.isPlaying && offset === undefined) return;
    if (!d.song?.audioBuffer) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = d.song.audioBuffer;
    source.playbackRate.value = d.playbackRate;
    source.connect(d.trimGainNode);

    const startOffset = offset ?? d.playbackOffset;
    source.start(0, startOffset);
    
    deck.update(s => {
      if(s.sourceNode) s.sourceNode.stop();
      return {
        ...s,
        sourceNode: source,
        isPlaying: true,
        startTime: this.audioContext.currentTime - startOffset / s.playbackRate
      }
    });
  }

  private pauseDeck(deckId: 'A' | 'B') {
    const deck = deckId === 'A' ? this.deckA : this.deckB;
    const d = deck();
    if (!d.isPlaying || !d.sourceNode) return;
    
    const elapsed = (this.audioContext.currentTime - d.startTime) * d.playbackRate;
    d.sourceNode.stop();

    deck.update(s => ({
      ...s,
      isPlaying: false,
      playbackOffset: elapsed,
      sourceNode: null
    }));
  }
  
  private startCurrentTrack() {
    const track = this.playlist()[this.currentTrackIndex()];
    if (!track) {
      this.logger.info('AudioPlaybackService', 'End of playlist reached.');
      this.stop();
      return;
    }
    
    if (track.type === 'break') {
      this.logger.info('AudioPlaybackService', `Starting break for ${track.duration} seconds.`);
      this.startBreak(track);
      return;
    }

    const deckId = this.deckA().isPlaying ? 'B' : 'A';
    this.logger.info('AudioPlaybackService', `Starting track index ${this.currentTrackIndex()} on Deck ${deckId}`);
    this.loadTrackToDeck(track, deckId);
    this.playDeck(deckId);

    this.prepareNextMix();
  }
  
  private startBreak(b: Break) {
    this.breakState.set({ onBreak: true, timeRemaining: b.duration });
    const tick = () => {
      this.breakState.update(s => ({...s, timeRemaining: s.timeRemaining - 1 }));
      if (this.breakState().timeRemaining <= 0) {
        this.logger.info('AudioPlaybackService', 'Break finished.');
        this.breakState.set({ onBreak: false, timeRemaining: 0 });
        this.currentTrackIndex.update(i => i + 1);
        this.startCurrentTrack();
      } else {
        this.breakTimer = setTimeout(() => this.zone.run(tick), 1000);
      }
    };
    this.breakTimer = setTimeout(() => this.zone.run(tick), 1000);
  }

  private prepareNextMix() {
    const currentIndex = this.currentTrackIndex();
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= this.playlist().length) {
        this.logger.info('AudioPlaybackService', 'No more tracks in playlist to mix.');
        return;
    }

    const currentTrack = this.playlist()[currentIndex] as Song;
    const nextTrack = this.playlist()[nextIndex] as Song;
    
    this.logger.info('AudioPlaybackService', `Preparing next mix from track ID ${currentTrack.id} to ${nextTrack.id}`);
    
    this.mixInstruction = {
      fromSongId: currentTrack.id,
      toSongId: nextTrack.id,
      transitionPointSeconds: currentTrack.duration! - 15,
      toSongBpm: currentTrack.tempo!.middle,
      actions: [
        { type: 'MOVE_CROSSFADER', startTimeSeconds: 5, durationSeconds: 8, targetValue: this.deckA().isPlaying ? 1 : -1 }
      ]
    };

    const timeToTransition = this.mixInstruction.transitionPointSeconds - this.getDeckPlaybackTime(this.deckA().isPlaying ? 'A' : 'B');
    this.logger.debug('AudioPlaybackService', `Time until next transition: ${timeToTransition.toFixed(2)} seconds.`);

    this.mixTimer = setTimeout(() => this.zone.run(() => this.executeMix()), timeToTransition * 1000);
  }
  
  private executeMix() {
    if (!this.mixInstruction) {
        this.logger.warn('AudioPlaybackService', 'executeMix called but no mix instruction is set.');
        return;
    }
    this.logger.info('AudioPlaybackService', `Executing mix from song ID ${this.mixInstruction.fromSongId} to ${this.mixInstruction.toSongId}`);
    
    const fromDeckId = this.deckA().song?.id === this.mixInstruction.fromSongId ? 'A' : 'B';
    const toDeckId = fromDeckId === 'A' ? 'B' : 'A';
    
    const toTrack = this.playlist().find(t => t.id === this.mixInstruction!.toSongId) as Song;
    this.loadTrackToDeck(toTrack, toDeckId);
    this.setBpm(toDeckId, this.mixInstruction.toSongBpm);
    this.playDeck(toDeckId);
    
    this.mixInstruction.actions.forEach(action => {
      setTimeout(() => {
        this.zone.run(() => {
            this.logger.debug('AudioPlaybackService', `Executing mix action: ${action.type}`);
            if (action.type === 'MOVE_CROSSFADER') {
                this.setCrossfader(action.targetValue);
            }
        });
      }, action.startTimeSeconds * 1000);
    });

    setTimeout(() => {
        this.zone.run(() => {
            this.logger.info('AudioPlaybackService', `Mix complete. Fading out Deck ${fromDeckId}.`);
            this.pauseDeck(fromDeckId);
            this.currentTrackIndex.update(i => i + 1);
            this.prepareNextMix();
        });
    }, 15 * 1000);
  }

  getDeckPlaybackTime(deckId: 'A' | 'B'): number {
    const deck = deckId === 'A' ? this.deckA() : this.deckB();
    if (!deck.isPlaying) {
      return deck.playbackOffset;
    }
    const elapsed = this.audioContext.currentTime - deck.startTime;
    return (elapsed * deck.playbackRate) + deck.playbackOffset;
  }
  
  generateWaveform(buffer: AudioBuffer): number[] {
    const data = buffer.getChannelData(0);
    const samples = 200;
    const step = Math.floor(data.length / samples);
    const waveform = [];
    for (let i = 0; i < samples; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) {
            max = Math.max(max, Math.abs(data[(i * step) + j]));
        }
        waveform.push(max);
    }
    return waveform;
  }

  analyzeBeatPeaks(buffer: AudioBuffer): number[] {
      const duration = buffer.duration;
      const bpm = 120;
      const peaks = [];
      for(let i=0; i < duration * (bpm/60); i++) {
          peaks.push(i * (60/bpm));
      }
      return peaks;
  }
  
  private updateCueSystem() {
      const isACueing = this.deckA().isCueing;
      const isBCueing = this.deckB().isCueing;
      this.logger.debug('AudioPlaybackService', `Updating cue system. A: ${isACueing}, B: ${isBCueing}`);

      if (isACueing) {
        this.deckA().preFaderGainNode.disconnect();
        this.deckA().preFaderGainNode.connect(this.cueVolumeNode);
      } else {
        this.deckA().preFaderGainNode.disconnect();
        this.deckA().preFaderGainNode.connect(this.deckA().postFaderGainNode);
      }
      
      if (isBCueing) {
        this.deckB().preFaderGainNode.disconnect();
        this.deckB().preFaderGainNode.connect(this.cueVolumeNode);
      } else {
        this.deckB().preFaderGainNode.disconnect();
        this.deckB().preFaderGainNode.connect(this.deckB().postFaderGainNode);
      }
  }

}
