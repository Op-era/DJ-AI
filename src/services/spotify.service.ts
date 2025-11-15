import { Injectable, signal, computed, inject, NgZone } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SpotifyPlayerState, SpotifyTrack, SpotifyAudioFeatures } from '../models/spotify.model';
import { LogService } from './log.service';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

@Injectable({
  providedIn: 'root'
})
export class SpotifyService {
  private http = inject(HttpClient);
  private zone = inject(NgZone);
  private logger = inject(LogService);

  // IMPORTANT: Replace with your own Spotify Client ID from developer.spotify.com
  private readonly CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID';
  private readonly REDIRECT_URI = window.location.origin + window.location.pathname;
  private readonly SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  private accessToken = signal<string | null>(null);
  private refreshToken = signal<string | null>(null);
  private player = signal<any | null>(null);
  private deviceId = signal<string | null>(null);

  playerState = signal<SpotifyPlayerState | null>(null);
  isReady = signal(false);

  isLoggedIn = computed(() => !!this.accessToken());

  constructor() {
    this.logger.info('SpotifyService', 'Service initialized');
    this.handleAuth();
  }

  async login() {
    this.logger.info('SpotifyService', 'Login initiated');
    if (this.CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID') {
        this.logger.error('SpotifyService', 'Spotify Client ID is not set.');
        alert('Please set your Spotify Client ID in src/services/spotify.service.ts');
        return;
    }

    const verifier = this.generateRandomString(128);
    const challenge = await this.generateCodeChallenge(verifier);
    
    sessionStorage.setItem('spotify_code_verifier', verifier);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', this.CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', this.REDIRECT_URI);
    authUrl.searchParams.append('scope', this.SCOPES);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', challenge);

    const width = 500, height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const loginWindow = window.open(
        authUrl.toString(),
        'Spotify Login',
        `width=${width},height=${height},top=${top},left=${left}`
    );

    const interval = setInterval(() => {
        if (!loginWindow || loginWindow.closed) {
            this.logger.warn('SpotifyService', 'Login window was closed by user.');
            clearInterval(interval);
            return;
        }
        try {
            if (loginWindow.location.href.includes('code=')) {
                const url = new URL(loginWindow.location.href);
                const code = url.searchParams.get('code');
                loginWindow.close();
                clearInterval(interval);

                if (code) {
                    this.exchangeCodeForToken(code);
                } else {
                    this.logger.error('SpotifyService', 'Login successful but no code found in URL.');
                }
            }
        } catch (error) {
            // Cross-origin error is expected until redirect.
        }
    }, 500);
  }

  logout() {
    this.logger.info('SpotifyService', 'Logout initiated');
    this.accessToken.set(null);
    this.refreshToken.set(null);
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expiry');
    if (this.player()) {
        this.player().disconnect();
    }
    this.player.set(null);
    this.playerState.set(null);
    this.isReady.set(false);
  }

  private async exchangeCodeForToken(code: string) {
    this.logger.info('SpotifyService', 'Exchanging authorization code for token');
    const verifier = sessionStorage.getItem('spotify_code_verifier');
    if (!verifier) {
      this.logger.error('SpotifyService', 'Code verifier not found in session storage.');
      return;
    }

    const body = new HttpParams()
      .set('client_id', this.CLIENT_ID)
      .set('grant_type', 'authorization_code')
      .set('code', code)
      .set('redirect_uri', this.REDIRECT_URI)
      .set('code_verifier', verifier);
      
    try {
      const response = await firstValueFrom(this.http.post<any>(
        'https://accounts.spotify.com/api/token', 
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      ));
      
      this.setToken(response.access_token, response.refresh_token, response.expires_in);
    } catch(err) {
      this.logger.error('SpotifyService', 'Failed to exchange code for token', err);
    }
  }

  private setToken(token: string, refreshToken: string, expiresIn: number) {
    this.logger.info('SpotifyService', 'Access token received and set.');
    this.zone.run(() => {
      this.accessToken.set(token);
      this.refreshToken.set(refreshToken);
      const expiryTime = Date.now() + expiresIn * 1000;
      localStorage.setItem('spotify_token', token);
      localStorage.setItem('spotify_refresh_token', refreshToken);
      localStorage.setItem('spotify_token_expiry', expiryTime.toString());
      
      setTimeout(() => {
        this.zone.run(() => {
          this.logger.warn('SpotifyService', 'Spotify session expired. Refreshing token is needed.');
          // TODO: Implement token refresh logic using the refresh token.
          this.logout();
          alert('Spotify session expired. Please log in again.');
        });
      }, expiresIn * 1000);

      this.loadSpotifySDK();
    });
  }

  private handleAuth() {
    this.logger.debug('SpotifyService', 'Handling authentication on startup');
    const storedToken = localStorage.getItem('spotify_token');
    const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
    const expiryTime = Number(localStorage.getItem('spotify_token_expiry'));

    if (storedToken && storedRefreshToken && expiryTime && expiryTime > Date.now()) {
        this.logger.info('SpotifyService', 'Found valid stored access token.');
        const expiresIn = (expiryTime - Date.now()) / 1000;
        this.setToken(storedToken, storedRefreshToken, expiresIn);
    } else {
        this.logger.info('SpotifyService', 'No valid Spotify token found in storage.');
        this.logout();
    }
  }

  private loadSpotifySDK() {
    this.logger.info('SpotifyService', 'Loading Spotify Web Playback SDK');
    window.onSpotifyWebPlaybackSDKReady = () => {
      this.zone.run(() => this.initPlayer());
    };
    // If SDK is already loaded, onSpotifyWebPlaybackSDKReady might not fire
    if (window.Spotify) {
        this.initPlayer();
    }
  }
  
  private initPlayer() {
    if (this.player()) {
      this.logger.warn('SpotifyService', 'Player already initialized.');
      return;
    }
    this.logger.info('SpotifyService', 'Initializing Spotify Player');
    const player = new window.Spotify.Player({
      name: 'DJ Mix Master Jukebox',
      getOAuthToken: (cb: (token: string) => void) => {
        cb(this.accessToken()!);
      },
      volume: 0.5
    });

    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      this.zone.run(() => {
        this.logger.info('SpotifyService', 'Player ready with Device ID', device_id);
        this.deviceId.set(device_id);
        this.isReady.set(true);
      });
    });

    player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      this.zone.run(() => {
        this.logger.warn('SpotifyService', 'Device has gone offline', device_id);
        this.isReady.set(false);
      });
    });
    
    player.addListener('player_state_changed', (state: SpotifyPlayerState | null) => {
      this.zone.run(() => {
        this.logger.debug('SpotifyService', 'Player state changed', state);
        if (!state) {
            return;
        }
        this.playerState.set(state);
      });
    });
    
    player.addListener('initialization_error', ({ message }: {message: string}) => { this.logger.error('SpotifyService', 'Initialization Error', message); });
    player.addListener('authentication_error', ({ message }: {message: string}) => { 
        this.zone.run(() => {
            this.logger.error('SpotifyService', 'Authentication Error', message);
            this.logout(); 
        });
    });
    player.addListener('account_error', ({ message }: {message: string}) => { this.logger.error('SpotifyService', 'Account Error', message); });

    player.connect();
    this.player.set(player);
  }

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.accessToken()}` });
  }

  async searchTracks(query: string, limit = 5): Promise<SpotifyTrack[]> {
    if (!query || !this.isLoggedIn()) return [];
    this.logger.info('SpotifyService', 'Searching for tracks', { query });
    const params = new HttpParams({ fromObject: { q: query, type: 'track', limit } });
    try {
      const response = await firstValueFrom(this.http.get<any>('https://api.spotify.com/v1/search', { headers: this.getAuthHeaders(), params }));
      return response.tracks.items;
    } catch (error) {
      this.logger.error('SpotifyService', 'Spotify search failed', error);
      return [];
    }
  }

  async getTrack(trackId: string): Promise<SpotifyTrack | null> {
    if (!trackId || !this.isLoggedIn()) return null;
    this.logger.debug('SpotifyService', 'Getting track details', { trackId });
    try {
        return await firstValueFrom(this.http.get<SpotifyTrack>(`https://api.spotify.com/v1/tracks/${trackId}`, { headers: this.getAuthHeaders() }));
    } catch (error) {
        this.logger.error('SpotifyService', 'Failed to get Spotify track', error);
        return null;
    }
  }

  async getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures | null> {
    if (!trackId || !this.isLoggedIn()) return null;
    this.logger.debug('SpotifyService', 'Getting audio features', { trackId });
    try {
        return await firstValueFrom(this.http.get<SpotifyAudioFeatures>(`https://api.spotify.com/v1/audio-features/${trackId}`, { headers: this.getAuthHeaders() }));
    } catch (error) {
        this.logger.error('SpotifyService', 'Failed to get Spotify audio features', error);
        return null;
    }
  }
  
  async playUris(trackUris: string[]) {
    if (!this.deviceId() || !this.isLoggedIn() || trackUris.length === 0) return;
    this.logger.info('SpotifyService', 'Playing list of URIs', { uris: trackUris });
    const body = { uris: trackUris };
    const url = `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId()}`;
    await firstValueFrom(this.http.put(url, body, { headers: this.getAuthHeaders() })).catch(err => this.logger.error('SpotifyService', 'Play failed', err));
  }
  
  pause() { this.logger.debug('SpotifyService', 'Pause requested'); this.player()?.pause(); }
  resume() { this.logger.debug('SpotifyService', 'Resume requested'); this.player()?.resume(); }
  nextTrack() { this.logger.debug('SpotifyService', 'Next track requested'); this.player()?.nextTrack(); }
  previousTrack() { this.logger.debug('SpotifyService', 'Previous track requested'); this.player()?.previousTrack(); }

  // --- PKCE Helper Functions ---
  private generateRandomString(length: number): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return this.base64encode(digest);
  }

  private base64encode(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}