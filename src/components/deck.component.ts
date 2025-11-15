import { Component, ChangeDetectionStrategy, input, output, viewChild, ElementRef, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeckState } from '../models/song.model';
import { YouTubePlayerState } from '../services/youtube.service';
import { UniversalPlaylistItem } from '../app.component';
import { LogService } from '../services/log.service';

@Component({
  selector: 'app-deck',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
        class="bg-gray-800 rounded-lg p-2 sm:p-4 flex flex-col items-center gap-2 sm:gap-4 h-full" 
        (dragover)="onDragOver($event)" (drop)="dropOnDeck.emit($event)" 
        [id]="'deck-' + deckId()">
        <div class="w-full text-center bg-black/30 p-2 rounded-md min-h-[72px]">
            <p class="font-bold text-lg truncate" [title]="deckTitle()">{{ deckTitle() }}</p>
            <p class="text-sm text-gray-400 truncate" [title]="deckArtist()">{{ deckArtist() }}</p>
            <div 
                class="flex items-center justify-between font-mono text-xs sm:text-sm h-6 px-2"
                [class]="deckId() === 'A' ? 'text-cyan-400' : 'text-purple-400'">
                <span class="w-1/3 text-left">{{ formatTime(elapsedTime()) }} / {{ formatTime(duration()) }}</span>
                <div class="w-1/3 text-center">
                    @if(deckHasSong()) {
                        @if(djMode() === 'Manual') {
                        <input type="number" [value]="adjustedBpm().toFixed(1)" (change)="onBpmChange($event)" 
                                class="bg-transparent text-center font-mono w-16 border-b focus:outline-none"
                                [class]="deckId() === 'A' ? 'text-cyan-400 border-cyan-800 focus:border-cyan-500' : 'text-purple-400 border-purple-800 focus:border-purple-500'" />
                        } @else {
                        <span>{{ adjustedBpm().toFixed(1) }}</span>
                        }
                        <span> BPM</span>
                    }
                </div>
                <span class="w-1/3 text-right">-{{ formatTime(remainingTime()) }}</span>
            </div>
        </div>
        <div 
            class="relative w-48 h-48 sm:w-64 sm:h-64 flex-shrink-0" 
            [class.cursor-grabbing]="deckState()?.isScratching" 
            (mousedown)="platterMouseDown.emit()" 
            [id]="'platter-' + deckId()">
            <div class="absolute inset-0" [style.transform]="'rotate(' + platterRotation() + 'deg)'">
                @if(djSource() === 'Local') {
                <svg class="w-full h-full" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="48" fill="none" stroke="#4A5568" stroke-width="1" />
                    @for(marker of beatMarkers(); track $index) {
                    <line [attr.x1]="50" [attr.y1]="2" [attr.x2]="50" [attr.y2]="marker.isDownbeat ? 8 : 5" 
                            [attr.stroke]="marker.isDownbeat ? (deckId() === 'A' ? '#2dd4bf' : '#a78bfa') : '#4A5568'" stroke-width="1.5" 
                            [attr.transform]="'rotate(' + marker.angle + ' 50 50)'"/>
                    }
                    <circle cx="50" cy="2" r="1.5" fill="#f56565" />
                </svg>
                }
            </div>
            @if(djSource() === 'YouTube') {
                <div class="absolute inset-4 rounded-full overflow-hidden border-4 border-gray-700 pointer-events-none">
                    <div [id]="'youtube-player-' + deckId()" class="w-full h-full"></div>
                </div>
            }
            <div class="absolute inset-2 bg-black/50 rounded-full border-4 border-gray-700 flex items-center justify-center pointer-events-none">
                <div 
                    class="w-10 h-10 bg-gray-700 rounded-full border-2"
                    [class]="deckId() === 'A' ? 'border-cyan-400' : 'border-purple-400'"></div>
            </div>
        </div>
        
        @if(djSource() === 'Local') {
            <canvas #waveformCanvas class="w-full h-16 bg-black/30 rounded-md"></canvas>
        } @else {
            <div class="w-full h-16 bg-black/30 rounded-md p-2">
                <div class="w-full h-full bg-gray-700 rounded-sm overflow-hidden">
                    <div 
                        class="h-full" 
                        [class]="deckId() === 'A' ? 'bg-cyan-500' : 'bg-purple-500'"
                        [style.width.%]="(elapsedTime() / duration()) * 100"></div>
                </div>
            </div>
        }

        @if(djMode() === 'Manual') {
        <div class="w-full flex justify-center items-center gap-2">
            <button (click)="togglePlayback.emit()" class="bg-gray-700 hover:bg-gray-600 p-3 rounded-full">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                @if(deckIsPlaying()) { <path d="M5 5h3v10H5V5zm7 0h3v10h-3V5z" /> }
                @else { <path d="M6.3 5.14A1 1 0 005 6v8a1 1 0 001.3.89l6-4a1 1 0 000-1.78l-6-4z" /> }
            </svg>
            </button>
            <button (click)="sync.emit()" class="bg-gray-700 hover:bg-gray-600 font-bold py-2 px-4 rounded-md">SYNC</button>
            <button (click)="pitchAdjust.emit(-0.01)" class="bg-gray-700 hover:bg-gray-600 font-bold p-2 rounded-md">-</button>
            <input type="range" min="0.8" max="1.2" step="0.001" [value]="deckPlaybackRate()" (input)="onPitchChange($event)" class="w-24">
            <button (click)="pitchAdjust.emit(0.01)" class="bg-gray-700 hover:bg-gray-600 font-bold p-2 rounded-md">+</button>
        </div>
        }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckComponent {
  deckId = input.required<'A' | 'B'>();
  deckState = input.required<DeckState | null>();
  ytPlayerState = input.required<YouTubePlayerState>();
  loadedTrack = input.required<UniversalPlaylistItem | null>();
  elapsedTime = input.required<number>();
  duration = input.required<number>();
  remainingTime = input.required<number>();
  adjustedBpm = input.required<number>();
  platterRotation = input.required<number>();
  beatMarkers = input.required<{ angle: number; isDownbeat: boolean }[]>();
  djSource = input.required<'Local' | 'Spotify' | 'YouTube'>();
  djMode = input.required<'Manual' | 'AI'>();

  dropOnDeck = output<DragEvent>();
  togglePlayback = output<void>();
  sync = output<void>();
  pitchAdjust = output<number>();
  pitchChange = output<number>();
  bpmChange = output<number>();
  platterMouseDown = output<void>();

  waveformCanvas = viewChild<ElementRef<HTMLCanvasElement>>('waveformCanvas');
  private logger = inject(LogService);

  constructor() {
    this.logger.info('DeckComponent', 'Constructor called');
    effect(() => {
        if (this.djSource() === 'Local' && this.waveformCanvas() && this.deckState()?.song) {
            this.drawWaveform(
                this.waveformCanvas()!.nativeElement, 
                this.deckState()!, 
                this.elapsedTime(), 
                this.deckId() === 'A' ? '#2dd4bf' : '#a78bfa'
            );
        }
    });
  }

  deckTitle(): string {
    const track = this.loadedTrack();
    const defaultTitle = this.deckId() === 'A' ? 'Deck A' : 'Deck B';
    if (track && track.type !== 'break') {
      return track.title || defaultTitle;
    }
    return defaultTitle;
  }
  
  deckArtist(): string {
    const track = this.loadedTrack();
    const defaultArtist = 'Load or Drag a track';
    if (track && track.type !== 'break') {
      return track.artist || defaultArtist;
    }
    return defaultArtist;
  }
  
  deckHasSong(): boolean {
    return !!this.loadedTrack();
  }

  deckIsPlaying(): boolean {
    if (this.djSource() === 'Local') return this.deckState()?.isPlaying ?? false;
    return this.ytPlayerState().isPlaying;
  }

  deckPlaybackRate(): number {
    if (this.djSource() === 'Local') return this.deckState()?.playbackRate ?? 1;
    return this.ytPlayerState().playbackRate;
  }

  onDragOver(event: DragEvent) { 
    event.preventDefault(); 
  }

  onPitchChange(event: Event) { 
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.logger.debug(`DeckComponent ${this.deckId()}`, 'Pitch changed', { value });
    this.pitchChange.emit(value); 
  }

  onBpmChange(event: Event) { 
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.logger.debug(`DeckComponent ${this.deckId()}`, 'BPM changed', { value });
    this.bpmChange.emit(value); 
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  drawWaveform(canvas: HTMLCanvasElement, deck: DeckState, elapsed: number, color: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    
    const waveform = deck.song?.waveform;
    if (!waveform || waveform.length === 0) return;

    const progress = deck.song?.duration ? elapsed / deck.song.duration : 0;
    const progressPx = width * progress;

    ctx.fillStyle = color;
    const barWidth = width / waveform.length;
    for(let i=0; i < waveform.length; i++) {
        const barHeight = waveform[i] * height;
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        if(x < progressPx) {
            ctx.globalAlpha = 0.4;
        } else {
            ctx.globalAlpha = 1.0;
        }
        ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.globalAlpha = 1.0;
  }
}