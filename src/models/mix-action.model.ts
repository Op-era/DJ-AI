export type MixActionType = 'MOVE_CROSSFADER' | 'LOOP_START' | 'LOOP_STOP' | 'SCRATCH' | 'RAMP_TEMPO' | 'SetChannelVolume';

export interface BaseMixAction {
  type: MixActionType;
  /** When the action should start, in seconds, relative to the transition's beginning. */
  startTimeSeconds: number;
}

export interface MoveCrossfaderAction extends BaseMixAction {
  type: 'MOVE_CROSSFADER';
  durationSeconds: number;
  /** Target crossfader value (-1 for full Deck A, 1 for full Deck B). */
  targetValue: -1 | 1;
}

export interface LoopStartAction extends BaseMixAction {
  type: 'LOOP_START';
  /** The precise start time of the loop within the track. */
  loopStartSeconds: number;
  /** The precise end time of the loop within the track. */
  loopEndSeconds: number;
}

export interface LoopStopAction extends BaseMixAction {
  type: 'LOOP_STOP';
}

export interface ScratchAction extends BaseMixAction {
  type: 'SCRATCH';
  durationSeconds: number;
}

export interface RampTempoAction extends BaseMixAction {
    type: 'RAMP_TEMPO';
    durationSeconds: number;
    /** The target playback rate to ramp to. */
    targetPlaybackRate: number;
}

export interface SetChannelVolumeAction extends BaseMixAction {
  type: 'SetChannelVolume';
  deckId: 'A' | 'B';
  durationSeconds: number;
  targetValue: number;
}


// Note: LOOP, SCRATCH and RAMP_TEMPO actions apply to the *incoming* deck by convention.
export type MixAction = MoveCrossfaderAction | LoopStartAction | LoopStopAction | ScratchAction | RampTempoAction | SetChannelVolumeAction;