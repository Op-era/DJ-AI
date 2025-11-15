import { Injectable, signal, NgZone, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, Subject, BehaviorSubject, Observable } from 'rxjs';
import { YouTubeSearchResult, YouTubeVideoDetails } from '../models/youtube.model';
import { LogService } from './log.service';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export interface YouTubePlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  videoId: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class YouTubeService {
  private readonly API_KEY = 'YOUR_YOUTUBE_API_KEY'; 
  private readonly SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
  private readonly VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

  private playerA: any;
  private playerB: any;
  private isSdkLoaded = new Subject<void>();
  private playerReadyA = new Subject<void>();
  private playerReadyB = new Subject<void>();
  private timeUpdaters: { A?: any, B?: any } = {};

  private playerStateA = new BehaviorSubject<YouTubePlayerState>(this.createInitialState());
  private playerStateB = new BehaviorSubject<YouTubePlayerState>(this.createInitialState());

  // FIX: Use .asObservable() to correctly expose the BehaviorSubject as an Observable and fix type errors.
  public playerStateA$: Observable<YouTubePlayerState> = this.playerStateA.asObservable();
  public playerStateB$: Observable<YouTubePlayerState> = this.playerStateB.asObservable();
  
  public isReady = signal(false);

  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private logger = inject(LogService);

  constructor() {
    this.logger.info('YouTubeService', 'Service initialized');
    if (typeof window.YT === 'undefined' || typeof window.YT.Player === 'undefined') {
      this.logger.info('YouTubeService', 'YouTube IFrame API not found, setting up onYouTubeIframeAPIReady');
      window.onYouTubeIframeAPIReady = () => {
        this.logger.info('YouTubeService', 'onYouTubeIframeAPIReady callback triggered');
        this.isSdkLoaded.next();
        this.isSdkLoaded.complete();
      };
    } else {
      this.logger.info('YouTubeService', 'YouTube IFrame API already loaded');
      this.isSdkLoaded.next();
      this.isSdkLoaded.complete();
    }
  }
  
  public createInitialState(): YouTubePlayerState {
    return { isPlaying: false, currentTime: 0, duration: 0, playbackRate: 1, videoId: null };
  }

  async createPlayers(elementIdA: string, elementIdB: string): Promise<void> {
    this.logger.info('YouTubeService', `Attempting to create players for elements: ${elementIdA}, ${elementIdB}`);
    await firstValueFrom(this.isSdkLoaded);
    this.ngZone.run(async () => {
      this.logger.debug('YouTubeService', 'YouTube SDK loaded, creating players inside NgZone');
      this.playerA = new window.YT.Player(elementIdA, this.getPlayerConfig('A'));
      this.playerB = new window.YT.Player(elementIdB, this.getPlayerConfig('B'));
      await Promise.all([firstValueFrom(this.playerReadyA), firstValueFrom(this.playerReadyB)]);
      this.logger.info('YouTubeService', 'Both YouTube players are ready');
      this.isReady.set(true);
    });
  }
  
  private getPlayerConfig(deckId: 'A' | 'B') {
      return {
        height: '100%',
        width: '100%',
        playerVars: { 'playsinline': 1, 'autoplay': 0, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1 },
        events: {
          'onReady': () => this.onPlayerReady(deckId),
          'onStateChange': (e: any) => this.onPlayerStateChange(deckId, e)
        }
      };
  }
  
  private onPlayerReady(deckId: 'A' | 'B') {
    this.ngZone.run(() => {
        this.logger.info('YouTubeService', `Player for Deck ${deckId} is ready`);
        if(deckId === 'A') {
          if (!this.playerReadyA.closed) this.playerReadyA.next();
        } else {
          if (!this.playerReadyB.closed) this.playerReadyB.next();
        }
    });
  }

  private onPlayerStateChange(deckId: 'A' | 'B', event: any) {
    this.ngZone.run(() => {
        const stateSubject = deckId === 'A' ? this.playerStateA : this.playerStateB;
        const currentState = stateSubject.getValue();
        let isPlaying = currentState.isPlaying;

        if (event.data === window.YT.PlayerState.PLAYING) {
            isPlaying = true;
            this.startTimeUpdater(deckId);
        } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
            isPlaying = false;
            this.stopTimeUpdater(deckId);
        }
        
        this.logger.debug('YouTubeService', `Player state changed for Deck ${deckId}`, { state: event.data, isPlaying });
        stateSubject.next({ ...currentState, isPlaying, duration: this.getDuration(deckId) });
    });
  }

  private startTimeUpdater(deckId: 'A' | 'B') {
      this.stopTimeUpdater(deckId); // Ensure no multiple intervals
      this.logger.debug('YouTubeService', `Starting time updater for Deck ${deckId}`);
      this.timeUpdaters[deckId] = setInterval(() => {
        this.ngZone.run(() => {
          const stateSubject = deckId === 'A' ? this.playerStateA : this.playerStateB;
          const player = deckId === 'A' ? this.playerA : this.playerB;
          if (player && typeof player.getCurrentTime === 'function') {
              stateSubject.next({ ...stateSubject.getValue(), currentTime: player.getCurrentTime() });
          }
        });
      }, 250);
  }

  private stopTimeUpdater(deckId: 'A' | 'B') {
      if(this.timeUpdaters[deckId]) {
          this.logger.debug('YouTubeService', `Stopping time updater for Deck ${deckId}`);
          clearInterval(this.timeUpdaters[deckId]);
          this.timeUpdaters[deckId] = undefined;
      }
  }

  private checkApiKey() {
    if (this.API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        this.logger.error('YouTubeService', 'YouTube API Key is not set.');
        alert('Please add your YouTube API Key to `src/services/youtube.service.ts` to enable YouTube features.');
        return false;
    }
    return true;
  }
  
  async search(query: string): Promise<string | null> {
    if (!this.checkApiKey()) return null;
    this.logger.info('YouTubeService', 'Searching for video', { query });
    
    const params = new HttpParams()
      .set('part', 'snippet')
      .set('q', `${query} official audio`)
      .set('type', 'video')
      .set('videoCategoryId', '10') // Music category
      .set('maxResults', '1')
      .set('key', this.API_KEY);

    try {
      const response = await firstValueFrom(this.http.get<{ items: YouTubeSearchResult[] }>(this.SEARCH_URL, { params }));
      const videoId = response.items.length > 0 ? response.items[0].id.videoId : null;
      this.logger.info('YouTubeService', 'Search complete', { query, videoId });
      return videoId;
    } catch (error) {
      this.logger.error('YouTubeService', 'YouTube search failed', error);
      return null;
    }
  }

  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetails | null> {
    if (!this.checkApiKey()) return null;
    this.logger.info('YouTubeService', 'Fetching video details', { videoId });
    const params = new HttpParams()
      .set('part', 'snippet,contentDetails,statistics')
      .set('id', videoId)
      .set('key', this.API_KEY);
      
    try {
      const response = await firstValueFrom(this.http.get<{ items: YouTubeVideoDetails[] }>(this.VIDEOS_URL, { params }));
      return response.items.length > 0 ? response.items[0] : null;
    } catch (error) {
      this.logger.error('YouTubeService', 'YouTube getVideoDetails failed', error);
      return null;
    }
  }

  loadVideo(deckId: 'A' | 'B', videoId: string) {
    this.logger.info('YouTubeService', `Loading video ${videoId} to Deck ${deckId}`);
    const player = deckId === 'A' ? this.playerA : this.playerB;
    const state = deckId === 'A' ? this.playerStateA : this.playerStateB;
    player?.cueVideoById(videoId);
    state.next({ ...this.createInitialState(), videoId });
  }

  play(deckId: 'A' | 'B') { this.logger.debug('YouTubeService', `Play command for Deck ${deckId}`); (deckId === 'A' ? this.playerA : this.playerB)?.playVideo(); }
  pause(deckId: 'A' | 'B') { this.logger.debug('YouTubeService', `Pause command for Deck ${deckId}`); (deckId === 'A' ? this.playerA : this.playerB)?.pauseVideo(); }
  setVolume(deckId: 'A' | 'B', volume: number) { (deckId === 'A' ? this.playerA : this.playerB)?.setVolume(volume); }
  setPlaybackRate(deckId: 'A' | 'B', rate: number) { 
      this.logger.debug('YouTubeService', `Setting playback rate for Deck ${deckId} to ${rate}`);
      const player = deckId === 'A' ? this.playerA : this.playerB;
      const state = deckId === 'A' ? this.playerStateA : this.playerStateB;
      player?.setPlaybackRate(rate);
      state.next({ ...state.getValue(), playbackRate: rate });
  }

  getDuration(deckId: 'A' | 'B'): number {
    const player = deckId === 'A' ? this.playerA : this.playerB;
    return (player && typeof player.getDuration === 'function') ? player.getDuration() : 0;
  }

  destroy() {
    this.logger.info('YouTubeService', 'Destroying YouTube players');
    this.stopTimeUpdater('A');
    this.stopTimeUpdater('B');
    this.playerA?.destroy();
    this.playerB?.destroy();
    this.playerA = null;
    this.playerB = null;

    if (!this.playerReadyA.closed) this.playerReadyA.complete();
    if (!this.playerReadyB.closed) this.playerReadyB.complete();

    this.playerReadyA = new Subject<void>();
    this.playerReadyB = new Subject<void>();
    
    this.isReady.set(false);
  }
}
