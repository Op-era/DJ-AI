import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from, map, catchError, switchMap } from 'rxjs';
import { Song, Tempo, PlaylistItem } from '../models/song.model';
import { SoundCloudTrack } from '../models/soundcloud.model';
import { SpotifyTrack, SpotifyAudioFeatures } from '../models/spotify.model';
import { LogService } from './log.service';

// Helper map for converting Spotify's pitch class notation to Camelot keys.
const CAMELOT_MAP: { [key: string]: string } = {
    '0/0': '5A', '0/1': '8B',  // C Minor / C Major
    '1/0': '12A', '1/1': '3B', // C# Minor / C# Major
    '2/0': '7A', '2/1': '10B', // D Minor / D Major
    '3/0': '2A', '3/1': '5B',  // D# Minor / D# Major
    '4/0': '9A', '4/1': '12B', // E Minor / E Major - Corrected 4/1
    '5/0': '4A', '5/1': '7B',  // F Minor / F Major
    '6/0': '11A', '6/1': '2B', // F# Minor / F# Major
    '7/0': '6A', '7/1': '9B',  // G Minor / G Major
    '8/0': '1A', '8/1': '4B',  // G# Minor / G# Major
    '9/0': '8A', '9/1': '11B', // A Minor / A Major
    '10/0': '3A', '10/1': '6B', // A# Minor / A# Major
    '11/0': '10A', '11/1': '1B' // B Minor / B Major
};

export type OllamaModel = 'llama3' | 'llama2' | 'codellama' | 'mistral' | 'gemma2:2b';

export interface AIToolSettings {
    tempoSync: boolean;
    useScratching: boolean;
    useLooping: boolean;
    useCrossfader: boolean;
}

export interface AiGeneratedTrack {
  artist: string;
  title: string;
  bpm?: number;
  key?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private logger = inject(LogService);
  private http = inject(HttpClient);
  
  private readonly OLLAMA_API_URL = 'http://localhost:11434/api/chat';

  availableModels = signal<OllamaModel[]>(['llama3', 'gemma2:2b', 'mistral']);
  selectedModel = signal<OllamaModel>('gemma2:2b');

  settings = signal<AIToolSettings>({
    tempoSync: true,
    useScratching: false,
    useLooping: true,
    useCrossfader: true
  });

  constructor() {
    this.logger.info('AiService', 'Service initialized');
  }
  
  selectModel(model: OllamaModel) { 
    this.logger.info('AiService', `AI model selected: ${model}`);
    this.selectedModel.set(model); 
  }

  analyzeTrack(song: Song): Observable<Partial<Song>> {
      this.logger.info('AiService', `Analyzing track ID ${song.id}: ${song.artist} - ${song.title}`);
      return of({
          tempo: { intro: 120, middle: 120, outro: 120, stable: true },
          key: '11B',
          traditionalKey: 'G Major',
          energyLevel: 'High',
          downbeats: song.audioBuffer ? Array.from({length: Math.floor(song.audioBuffer.duration / (60/120))}, (_, i) => i * (60/120)) : []
      });
  }
  
  optimizePlaylist(playlist: PlaylistItem[]): Observable<PlaylistItem[]> {
    this.logger.info('AiService', 'Optimizing playlist by BPM');
    return of([...playlist].sort((a, b) => {
      if (a.type === 'break' || b.type === 'break') return 0;
      return (a.tempo?.middle || 0) - (b.tempo?.middle || 0);
    }));
  }

  findSoundCloudMatches(song: Song): Observable<SoundCloudTrack[]> {
    this.logger.info('AiService', `Finding SoundCloud matches for song ID ${song.id}`);
    return of([
      { id: 1, title: 'Another Banger', artist: 'DJ Example', url: '#', artwork_url: 'https://picsum.photos/100/100', bpm: 122, key: '11B', match_score: 95 },
      { id: 2, title: 'Compatible Vibes', artist: 'Producer Pro', url: '#', artwork_url: 'https://picsum.photos/101/101', bpm: 120, key: '10B', match_score: 88 },
      { id: 3, title: 'Energy Match', artist: 'Synthy Synthson', url: '#', artwork_url: 'https://picsum.photos/102/102', bpm: 121, key: '11A', match_score: 82 },
    ]).pipe(map(tracks => of(tracks)), switchMap(val => from(new Promise<SoundCloudTrack[]>(res => setTimeout(() => res(val as any), 1500)))));
  }

  getCamelotKey(pitchKey: number, mode: number): string {
    return CAMELOT_MAP[`${pitchKey}/${mode}`] || 'Unknown';
  }

  private getCompatibleKeys(camelotKey: string): string[] {
      const match = camelotKey.match(/(\d+)([AB])/);
      if (!match) return [camelotKey];
      
      const num = parseInt(match[1]);
      const letter = match[2];
      
      const compatibleKeys = new Set<string>();
      compatibleKeys.add(camelotKey);
      compatibleKeys.add(`${num}${letter === 'A' ? 'B' : 'A'}`);
      compatibleKeys.add(`${num === 12 ? 1 : num + 1}${letter}`);
      compatibleKeys.add(`${num === 1 ? 12 : num - 1}${letter}`);

      return Array.from(compatibleKeys);
  }

  private buildOllamaPrompt(trackInfo: SpotifyTrack, trackFeatures: SpotifyAudioFeatures): string {
    const currentKey = this.getCamelotKey(trackFeatures.key, trackFeatures.mode);
    const compatibleKeys = this.getCompatibleKeys(currentKey);

    return `
You are a professional DJ's assistant AI. Your task is to suggest three excellent follow-up tracks for a DJ set.
The suggestions must be harmonically compatible and maintain a good energy flow.

Rules:
1.  Analyze the "Current Track" data provided.
2.  Suggest three new tracks that would mix well.
3.  The suggested tracks should have a BPM within a close range of the current track (±5 BPM is ideal).
4.  The suggested tracks must be in a compatible musical key.
5.  Provide your response ONLY as a valid JSON object. Do not include any text, notes, or explanations before or after the JSON.
6.  The JSON object must have a single key "songs", which is an array of objects. Each object must have "artist" and "title" keys.

Current Track:
- Name: "${trackInfo.artists[0].name} - ${trackInfo.name}"
- BPM: ${trackFeatures.tempo.toFixed(0)}
- Key: ${currentKey}
- Energy: ${trackFeatures.energy.toFixed(2)}

Compatible Keys for Suggestions: ${compatibleKeys.join(', ')}

Provide your 3 suggestions in the specified JSON format like: {"songs": [{"artist": "Artist1", "title": "Title1"}, ...]}.
`;
  }

  generatePlaylistFromSeed(trackInfo: SpotifyTrack, trackFeatures: SpotifyAudioFeatures): Observable<AiGeneratedTrack[]> {
    const prompt = this.buildOllamaPrompt(trackInfo, trackFeatures);
    this.logger.info('AiService', 'Generating playlist from seed track', { artist: trackInfo.artists[0].name, title: trackInfo.name });
    this.logger.debug('AiService', 'Sending prompt to Ollama', { prompt });
    
    const body = {
      model: this.selectedModel(),
      messages: [
        { role: 'system', content: 'You are a DJ assistant AI that only responds with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      format: 'json',
      stream: false
    };

    return this.http.post<{ message: { content: string } }>(this.OLLAMA_API_URL, body).pipe(
      // FIX: Explicitly type the response to fix type inference issue.
      map((response: { message: { content: string } }) => {
        try {
          const content = JSON.parse(response.message.content);
          if (content && Array.isArray(content.songs)) {
            this.logger.info('AiService', 'Successfully parsed Ollama response', { songs: content.songs });
            return content.songs.map((s: any) => ({ artist: s.artist, title: s.title }));
          }
          this.logger.warn('AiService', 'Ollama response was valid JSON but missing "songs" array', { response: content });
          return [];
        } catch (e) {
          this.logger.error('AiService', 'Failed to parse JSON from Ollama response', { rawContent: response.message.content, error: e });
          return [];
        }
      }),
      catchError(error => {
        this.logger.error('AiService', 'Error calling Ollama API', error);
        alert('Could not connect to local Ollama instance. Please ensure it is running and properly configured for CORS.');
        return of([]);
      })
    );
  }
  
  updateSettings(newSettings: Partial<AIToolSettings>) {
    this.logger.info('AiService', 'Updating AI settings', newSettings);
    this.settings.update(current => ({ ...current, ...newSettings }));
  }
}