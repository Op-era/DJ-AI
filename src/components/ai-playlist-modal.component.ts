import { Component, ChangeDetectionStrategy, input, output, signal, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpotifyTrack, SpotifyArtist } from '../models/spotify.model';
import { AiService, AiGeneratedTrack } from '../services/ai.service';
import { SpotifyService } from '../services/spotify.service';
import { YouTubeService } from '../services/youtube.service';
import { Subject, from, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { UniversalPlaylistItem } from '../app.component';
import { YouTubeVideoDetails } from '../models/youtube.model';
import { LogService } from '../services/log.service';


@Component({
  selector: 'app-ai-playlist-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if(isVisible()) {
      <div class="fixed inset-0 bg-black/60 z-50 transition-opacity flex items-center justify-center" (click)="closeModal.emit()">
         <div class="bg-gray-800 border border-yellow-500/30 rounded-lg shadow-2xl w-full max-w-2xl p-6 flex flex-col gap-4" (click)="$event.stopPropagation()">
            <h2 class="text-2xl font-bold text-yellow-400 text-center">AI Playlist Generator</h2>
            <p class="text-center text-gray-400">Search for a song to use as a seed for the AI to generate a compatible playlist.</p>
            <div class="relative">
              <input type="text" placeholder="Search Spotify for a seed track..." [value]="spotifySearchTerm()" (input)="onSpotifySearch($any($event.target).value)" class="w-full bg-black/20 border border-gray-600 rounded-md px-4 py-3 focus:outline-none focus:border-yellow-500">
            </div>

            <div class="h-96 overflow-y-auto">
              @if(aiPlaylistState().loading) {
                <div class="flex flex-col items-center justify-center h-full">
                    <svg class="animate-spin h-10 w-10 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p class="mt-4 text-gray-300 text-lg">{{ aiPlaylistState().statusText }}</p>
                </div>
              } @else if (spotifyApiError()) {
                <div class="flex flex-col items-center justify-center h-full text-center">
                    <p class="text-red-400 font-semibold">Spotify Search Failed</p>
                    <p class="text-gray-400 mt-2">Could not search for tracks. Please ensure your Spotify Client ID is set correctly and you are logged in.</p>
                </div>
              } @else {
                  @for(track of spotifySearchResults(); track track.id) {
                    <div class="flex items-center gap-4 p-2 rounded-md hover:bg-gray-700/50">
                      <img [src]="track.album.images[track.album.images.length-1]?.url" class="w-12 h-12 rounded" alt="album art">
                      <div class="truncate flex-grow">
                        <p class="text-white font-medium truncate">{{track.name}}</p>
                        <p class="text-gray-400 text-sm truncate">{{getArtistNames(track.artists)}}</p>
                      </div>
                      <button (click)="generatePlaylistFromSeed(track)" class="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-md text-sm">
                        Generate
                      </button>
                    </div>
                  }
              }
            </div>
         </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiPlaylistModalComponent {
  isVisible = input.required<boolean>();
  closeModal = output<void>();
  playlistGenerated = output<UniversalPlaylistItem[]>();

  aiService = inject(AiService);
  spotifyService = inject(SpotifyService);
  youTubeService = inject(YouTubeService);
  private logger = inject(LogService);
  private zone = inject(NgZone);

  private nextId = 1000; // Start IDs high to avoid collision

  aiPlaylistState = signal<{loading: boolean; statusText: string}>({ loading: false, statusText: '' });
  spotifySearchTerm = signal('');
  spotifySearchResults = signal<SpotifyTrack[]>([]);
  spotifyApiError = signal(false);
  private spotifySearch$ = new Subject<string>();

  constructor() {
    this.logger.info('AiPlaylistModalComponent', 'Constructor called');
     this.spotifySearch$.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(term => {
            this.logger.debug('AiPlaylistModalComponent', 'Spotify search term changed', { term });
            if (!term) return of([]);
            this.spotifyApiError.set(false);
            return from(this.spotifyService.searchTracks(term));
        }),
        catchError((err) => {
            this.logger.error('AiPlaylistModalComponent', 'Spotify search failed', err);
            this.spotifyApiError.set(true);
            return of([]);
        })
    ).subscribe(results => {
        this.logger.info('AiPlaylistModalComponent', `Spotify search returned ${results.length} results`);
        this.spotifySearchResults.set(results);
    });
  }

  onSpotifySearch(term: string) {
      this.spotifySearchTerm.set(term);
      this.spotifySearch$.next(term);
  }

  generatePlaylistFromSeed(seedTrack: SpotifyTrack) {
    this.logger.info('AiPlaylistModalComponent', 'generatePlaylistFromSeed called with track:', { name: seedTrack.name });
    this.aiPlaylistState.set({ loading: true, statusText: 'Analyzing seed track...' });
    
    // Using a promise here is fine, but we will wrap the final subscription block in NgZone
    Promise.all([
      this.spotifyService.getTrack(seedTrack.id),
      this.spotifyService.getAudioFeatures(seedTrack.id)
    ]).then(([trackInfo, trackFeatures]) => {
        if (!trackInfo || !trackFeatures) {
            this.logger.error('AiPlaylistModalComponent', 'Could not retrieve track data from Spotify.');
            alert('Could not retrieve track data from Spotify.');
            this.aiPlaylistState.set({ loading: false, statusText: '' });
            return;
        }

        this.aiPlaylistState.update(s => ({ ...s, statusText: 'Asking Ollama for suggestions...' }));

        this.aiService.generatePlaylistFromSeed(trackInfo, trackFeatures).subscribe((suggestions) => {
            // *** FIX: Run the entire async callback within Angular's zone to prevent assertion errors ***
            this.zone.run(async () => {
                if (suggestions.length === 0) {
                    this.logger.warn('AiPlaylistModalComponent', 'Ollama returned no suggestions.');
                    this.aiPlaylistState.set({ loading: false, statusText: '' });
                    return;
                }

                this.logger.info('AiPlaylistModalComponent', `Ollama returned ${suggestions.length} suggestions.`);
                this.aiPlaylistState.update(s => ({ ...s, statusText: `Finding ${suggestions.length} tracks on YouTube...` }));
                
                const newPlaylist: UniversalPlaylistItem[] = [];
                for (const suggestion of suggestions) {
                    const videoId = await this.youTubeService.search(`${suggestion.artist} ${suggestion.title}`);
                    const details = videoId ? await this.youTubeService.getVideoDetails(videoId) : null;
                    newPlaylist.push({
                        ...suggestion,
                        type: 'youtube',
                        id: this.nextId++,
                        videoId: videoId,
                        details: details,
                        bpm: trackFeatures.tempo,
                        key: this.aiService.getCamelotKey(trackFeatures.key, trackFeatures.mode)
                    });
                }
                
                this.logger.info('AiPlaylistModalComponent', 'Playlist generation complete. Emitting event.');
                this.playlistGenerated.emit(newPlaylist);
                this.aiPlaylistState.set({ loading: false, statusText: '' });
                this.spotifySearchResults.set([]);
                this.spotifySearchTerm.set('');
            });
        });
    });
  }

  getArtistNames(artists: SpotifyArtist[]): string {
    return artists.map(a => a.name).join(', ');
  }
}
