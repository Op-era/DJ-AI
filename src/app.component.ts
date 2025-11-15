import { Component, ChangeDetectionStrategy, signal, computed, inject, AfterViewInit, ViewChildren, QueryList, ElementRef, effect, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Song, SongStatus, PlaylistItem, Break, DeckState } from './models/song.model';
import { AIToolSettings, AiService, OllamaModel, AiGeneratedTrack } from './services/ai.service';
import { AudioPlaybackService } from './services/audio-playback.service';
import { SoundCloudTrack } from './models/soundcloud.model';
import { SpotifyService } from './services/spotify.service';
import { SpotifyTrack, SpotifyArtist } from './models/spotify.model';
import { YouTubeService, YouTubePlayerState } from './services/youtube.service';
import { Subscription } from 'rxjs';
import { YouTubeVideoDetails } from './models/youtube.model';

// Import new components
import { DeckComponent } from './components/deck.component';
import { AiPlaylistModalComponent } from './components/ai-playlist-modal.component';
import { LogViewerComponent } from './components/log-viewer.component';
import { LogService } from './services/log.service';


interface TutorialStep {
  title: string;
  text: string;
  selector?: string; // Optional selector
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export type DJSource = 'Local' | 'Spotify' | 'YouTube';

// A union type for items in the playlist, now including rich YouTube data
export type UniversalPlaylistItem = PlaylistItem | (AiGeneratedTrack & { type: 'youtube'; id: number; videoId: string | null; details: YouTubeVideoDetails | null; });


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DeckComponent, AiPlaylistModalComponent, LogViewerComponent],
  providers: [SpotifyService, YouTubeService, AiService, LogService],
  template: `
<div class="h-screen bg-gray-900 text-gray-200 p-2 sm:p-4 flex flex-col font-sans overflow-hidden">
  
  <!-- Header -->
  <header class="flex-shrink-0 flex items-center justify-between pb-2 sm:pb-4">
    <div class="flex items-center gap-4">
      <button (click)="isMenuOpen.set(true)" class="p-2 rounded-md hover:bg-gray-700/50" title="Settings">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
      </button>
      <h1 class="text-xl sm:text-2xl font-bold text-white tracking-wider">DJ Mix Master</h1>
    </div>
    <div class="flex items-center gap-2 text-xs text-gray-400">
      <span>AI Model:</span>
      <span class="font-semibold text-cyan-400">{{ aiService.selectedModel() }}</span>
    </div>
  </header>

  <!-- Menu Panel -->
  @if(isMenuOpen()) {
    <div class="fixed inset-0 bg-black/60 z-50 transition-opacity" (click)="isMenuOpen.set(false)"></div>
    <aside class="fixed top-0 left-0 h-full bg-gray-900 border-r border-gray-700/50 w-72 shadow-2xl z-50 p-6 flex flex-col">
      <h2 class="text-2xl font-bold mb-6 text-cyan-400">Settings</h2>
        <div class="flex flex-col gap-2">
            <h3 class="text-lg font-semibold text-gray-300">Analysis Model (Local)</h3>
            <p class="text-xs text-gray-500 mb-2">Select the local Ollama model for playlist generation.</p>
            @for(model of ollamaModels(); track model) {
                <button (click)="selectOllamaModel(model)" class="text-left p-3 rounded-md transition-colors text-white"
                        [class.bg-cyan-600]="selectedOllamaModel() === model"
                        [class.bg-gray-800]="selectedOllamaModel() !== model"
                        [class.hover:bg-gray-700]="selectedOllamaModel() !== model">
                    {{ model }}
                </button>
            }
        </div>
        <button (click)="isMenuOpen.set(false)" class="mt-auto bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md">
            Close
        </button>
    </aside>
  }

  <main class="flex-grow bg-gray-800/50 border border-gray-700/50 rounded-xl shadow-2xl flex p-2 sm:p-4 gap-4 relative min-h-0">
    
    <!-- Tutorial Overlay -->
    @if(tutorialState().active) {
      <div class="fixed inset-0 z-50 pointer-events-none">
        <div class="tutorial-highlight" [style]="tutorialHighlightStyle()"></div>
        <div 
          class="tutorial-popup pointer-events-auto" 
          [style]="tutorialPopupStyle()">
           <div class="relative bg-gray-800 rounded-lg shadow-2xl p-6 max-w-sm w-full border border-cyan-500/30">
             @if(currentTutorialStep()?.selector) {
              <div class="tutorial-arrow" [class]="tutorialArrowClass()"></div>
             }
             <h3 class="text-xl font-bold text-cyan-400 mb-2">{{ currentTutorialStep()?.title }}</h3>
             <p class="text-gray-300 mb-4">{{ currentTutorialStep()?.text }}</p>
             <div class="flex justify-between items-center">
               <button (click)="skipTutorial()" class="text-xs text-gray-400 hover:text-white">Skip Tutorial</button>
               <div>
                 @if(tutorialState().step > 0) {
                  <button (click)="prevTutorialStep()" class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md mr-2">Prev</button>
                 }
                 <button (click)="nextTutorialStep()" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md">
                    {{ tutorialState().step === tutorialSteps.length - 1 ? 'Finish' : 'Next' }}
                 </button>
               </div>
             </div>
           </div>
        </div>
      </div>
    }

    <!-- Break Timer Overlay -->
    @if(breakState().onBreak) {
    <div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-40 rounded-xl">
      <p class="text-2xl text-gray-400 font-semibold">ON BREAK</p>
      <p class="text-8xl font-mono font-bold text-cyan-400">{{ formatTime(breakState().timeRemaining) }}</p>
      <p class="mt-4 text-gray-500">Next track will start automatically.</p>
    </div>
    }

    @if(djSource() !== 'Spotify') {
      <!-- Left Column: Setlist -->
      <div class="w-1/5 bg-gray-800 p-2 sm:p-4 rounded-lg shadow-lg flex flex-col min-h-0" id="setlist-panel">
          <div class="flex justify-between items-center mb-2 flex-shrink-0">
              <h2 class="text-lg sm:text-xl font-semibold">Setlist</h2>
              <div class="flex items-center gap-2">
                  <input type="file" #fileInput (change)="onFileSelected($event)" accept="audio/*" class="hidden" multiple webkitdirectory>
                  @if(djSource() === 'Local') {
                    <button (click)="fileInput.click()" [disabled]="isProcessing()" class="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-500 text-white font-bold py-2 px-3 rounded-md text-sm w-28 text-center">
                      <span>{{ processingStatusText() }}</span>
                    </button>
                  } @else {
                    <button (click)="showAiPlaylistModal.set(true)" class="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-3 rounded-md text-sm w-28 text-center">
                      Generate
                    </button>
                  }
              </div>
          </div>
          <div class="flex gap-2 mb-2 flex-shrink-0">
              <button (click)="optimizePlaylist()" title="AI Optimize Playlist" class="flex-1 bg-purple-800 hover:bg-purple-700 text-white font-bold p-2 rounded-md text-sm">Optimize</button>
              <button (click)="addBreak()" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-md text-sm">Add Break</button>
          </div>
          <div class="mb-2 flex-shrink-0">
            <input type="text" placeholder="Search..." (input)="searchTerm.set($any($event.target).value)" class="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-1 text-sm focus:outline-none focus:border-cyan-500">
          </div>
          <div class="overflow-y-auto flex-grow min-h-0">
              <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="text-gray-400">
                      <th class="py-2 px-3 font-normal">Track</th>
                      <th class="py-2 px-3 font-normal text-right">BPM/Key</th>
                      @if(djMode() === 'Manual') { <th class="w-24"></th> }
                    </tr>
                  </thead>
              </table>
              <div class="overflow-y-auto" style="height: calc(100% - 38px);">
                <table class="min-w-full divide-y divide-gray-700 text-xs">
                    <tbody class="bg-gray-800 divide-y divide-gray-700">
                    @for (item of filteredPlaylist(); track item.id) {
                      <tr 
                        class="hover:bg-gray-700/50 group" [class.opacity-30]="draggedItem()?.id === item.id"
                        draggable="true" (dragstart)="onDragStart(item)" (dragover)="onDragOver($event)" (drop)="onDrop(item)" (dragend)="onDragEnd()">
                        @if(item.type === 'song') {
                          <td class="py-2 px-3 whitespace-nowrap cursor-grab">
                            <p class="text-white font-medium truncate">{{ item.title }}</p>
                            <p class="text-gray-400 truncate">{{ item.artist }}</p>
                          </td>
                          <td class="py-2 px-3 whitespace-nowrap text-gray-300 text-right">
                            <p>{{ item.tempo?.middle?.toFixed(1) || '-' }}</p>
                            <p [title]="item.traditionalKey || ''">{{ item.key || '-' }}</p>
                          </td>
                        } @else if (item.type === 'youtube') {
                            <td class="py-2 px-3 whitespace-nowrap cursor-grab flex items-center gap-2">
                                <img [src]="item.details?.snippet.thumbnails.default.url" class="w-10 h-10 rounded-md object-cover bg-gray-700" alt="thumbnail" />
                                <div>
                                    <p class="text-white font-medium truncate">{{ item.title }}</p>
                                    <p class="text-gray-400 truncate">{{ item.artist }}</p>
                                </div>
                            </td>
                            <td class="py-2 px-3 whitespace-nowrap text-gray-300 text-right">
                                <p>{{ item.bpm?.toFixed(1) || '-' }}</p>
                                <p>{{ item.key || '-' }}</p>
                            </td>
                        } @else {
                          <td colspan="3" class="py-2 px-3 text-center bg-gray-700/50 text-gray-400 font-bold cursor-grab">
                            --- BREAK ({{ item.configuredDuration }} min) ---
                          </td>
                        }
                        
                        @if((item.type === 'song' || item.type === 'youtube') && djMode() === 'Manual') {
                          <td class="py-1 px-3 whitespace-nowrap text-center w-24">
                            @if(item.type === 'song' && item.status === 'ready' || item.type === 'youtube') {
                              <div class="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button (click)="loadSongToDeck(item, 'A')" class="bg-cyan-800 hover:bg-cyan-700 text-white font-bold text-xs px-2 py-1 rounded">A</button>
                                <button (click)="loadSongToDeck(item, 'B')" class="bg-purple-800 hover:bg-purple-700 text-white font-bold text-xs px-2 py-1 rounded">B</button>
                                @if(item.type === 'song') {
                                <button (click)="findSoundCloudMatches(item)" title="Find AI matches on SoundCloud" class="bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs p-1 rounded">
                                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm6 2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1V4zm5 5a1 1 0 011-1h1a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1h-1a1 1 0 01-1-1v-1zM2 13a1 1 0 011-1h1v-1a1 1 0 112 0v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 01-1-1zm5 2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2z" clip-rule="evenodd" /></svg>
                                </button>
                                }
                              </div>
                            } @else if (item.type === 'song') { <span class="text-xs text-gray-500 capitalize">{{ item.status.replace('_', ' ') }}</span> }
                          </td>
                        }
                      </tr>
                    } @empty {
                      <tr><td colspan="3" class="text-center py-6 text-gray-400">Setlist is empty.</td></tr>
                    }
                    </tbody>
                </table>
              </div>
          </div>
      </div>

      <!-- Center Column: DJ Console -->
      <div class="w-3/5 flex flex-col gap-2 sm:gap-4 overflow-y-auto" id="dj-console">
          <div class="grid grid-cols-1 md:grid-cols-2 flex-grow gap-2 sm:gap-4 items-start min-h-0">
              <!-- Deck A -->
               <app-deck
                  deckId="A"
                  [deckState]="deckA()"
                  [ytPlayerState]="ytDeckAState()"
                  [loadedTrack]="deckLoadedTrack('A')"
                  [elapsedTime]="deckElapsedTime('A')"
                  [duration]="deckDuration('A')"
                  [remainingTime]="deckRemainingTime('A')"
                  [adjustedBpm]="adjustedBpmA()"
                  [platterRotation]="getPlatterRotation('A')"
                  [beatMarkers]="deckABeatMarkers()"
                  [djSource]="djSource()"
                  [djMode]="djMode()"
                  (dropOnDeck)="onDropOnDeck($event, 'A')"
                  (togglePlayback)="toggleDeckPlayback('A')"
                  (sync)="onSync('A')"
                  (pitchAdjust)="onPitchAdjust('A', $event)"
                  (pitchChange)="onPitchChange('A', $event)"
                  (bpmChange)="onBpmChange('A', $event)"
                  (platterMouseDown)="onPlatterMouseDown('A')"
              ></app-deck>
              <!-- Deck B -->
              <app-deck
                  deckId="B"
                  [deckState]="deckB()"
                  [ytPlayerState]="ytDeckBState()"
                  [loadedTrack]="deckLoadedTrack('B')"
                  [elapsedTime]="deckElapsedTime('B')"
                  [duration]="deckDuration('B')"
                  [remainingTime]="deckRemainingTime('B')"
                  [adjustedBpm]="adjustedBpmB()"
                  [platterRotation]="getPlatterRotation('B')"
                  [beatMarkers]="deckBBeatMarkers()"
                  [djSource]="djSource()"
                  [djMode]="djMode()"
                  (dropOnDeck)="onDropOnDeck($event, 'B')"
                  (togglePlayback)="toggleDeckPlayback('B')"
                  (sync)="onSync('B')"
                  (pitchAdjust)="onPitchAdjust('B', $event)"
                  (pitchChange)="onPitchChange('B', $event)"
                  (bpmChange)="onBpmChange('B', $event)"
                  (platterMouseDown)="onPlatterMouseDown('B')"
              ></app-deck>
          </div>
          <div class="bg-gray-800/70 border border-gray-700/50 rounded-lg p-2 sm:p-4 flex flex-col items-center justify-between" id="mixer">
              <div class="w-full grid grid-cols-2 gap-2 sm:gap-4">
                  <!-- Deck A Channel -->
                  <div class="flex items-center justify-center gap-4 bg-black/20 p-2 rounded-md">
                      <div class="flex flex-col items-center gap-2 flex-grow">
                          @if(djSource() === 'Local') {
                              <div class="knob-container">
                                  <div class="knob-visual" [style.transform]="'rotate(' + (deckA().trim - 1) * 135 + 'deg)'"></div>
                                  <input type="range" min="0" max="2" step="0.01" [value]="deckA().trim" (input)="onTrimChange('A', $event)" class="knob">
                              </div>
                              <span class="text-xs font-bold text-gray-400">TRIM</span>
                              <div class="flex flex-col gap-2 mt-2">
                                  @for(eq of [['High', deckA().eqHighValue], ['Mid', deckA().eqMidValue], ['Low', deckA().eqLowValue]]; track eq[0]) {
                                  <div class="knob-container">
                                      <div class="knob-visual" [style.transform]="'rotate(' + eq[1] * 135 + 'deg)'"></div>
                                      <input type="range" min="-1" max="1" step="0.01" [value]="eq[1]" (input)="onEqChange('A', eq[0], $event)" class="knob">
                                  </div>
                                  <span class="text-xs text-center text-gray-400">{{ eq[0] }}</span>
                                  }
                              </div>
                              <button (click)="onCueToggle('A')" class="w-full py-2 mt-2 rounded-md text-sm font-bold" [class]="deckA().isCueing ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-300'">CUE</button>
                          } @else {
                            <div class="h-full w-full flex items-center justify-center text-gray-500 text-sm">EQ Disabled</div>
                          }
                      </div>
                      <div class="flex-shrink-0 w-12 h-[275px] flex items-center justify-center">
                          <input type="range" min="0" max="1" step="0.01" [value]="deckVolume('A')" (input)="onVolumeChange('A', $event)" class="fader">
                      </div>
                  </div>
                  <!-- Deck B Channel -->
                  <div class="flex items-center justify-center gap-4 bg-black/20 p-2 rounded-md">
                       <div class="flex flex-col items-center gap-2 flex-grow">
                           @if(djSource() === 'Local') {
                              <div class="knob-container">
                                  <div class="knob-visual" [style.transform]="'rotate(' + (deckB().trim - 1) * 135 + 'deg)'"></div>
                                  <input type="range" min="0" max="2" step="0.01" [value]="deckB().trim" (input)="onTrimChange('B', $event)" class="knob">
                              </div>
                              <span class="text-xs font-bold text-gray-400">TRIM</span>
                              <div class="flex flex-col gap-2 mt-2">
                                  @for(eq of [['High', deckB().eqHighValue], ['Mid', deckB().eqMidValue], ['Low', deckB().eqLowValue]]; track eq[0]) {
                                  <div class="knob-container">
                                      <div class="knob-visual" [style.transform]="'rotate(' + eq[1] * 135 + 'deg)'"></div>
                                      <input type="range" min="-1" max="1" step="0.01" [value]="eq[1]" (input)="onEqChange('B', eq[0], $event)" class="knob">
                                  </div>
                                  <span class="text-xs text-center text-gray-400">{{ eq[0] }}</span>
                                  }
                              </div>
                              <button (click)="onCueToggle('B')" class="w-full py-2 mt-2 rounded-md text-sm font-bold" [class]="deckB().isCueing ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'">CUE</button>
                           } @else {
                             <div class="h-full w-full flex items-center justify-center text-gray-500 text-sm">EQ Disabled</div>
                           }
                      </div>
                      <div class="flex-shrink-0 w-12 h-[275px] flex items-center justify-center">
                          <input type="range" min="0" max="1" step="0.01" [value]="deckVolume('B')" (input)="onVolumeChange('B', $event)" class="fader">
                      </div>
                  </div>
              </div>
              
              @if(djSource() === 'Local') {
              <div class="w-full bg-black/20 p-2 rounded-md my-2 flex flex-col gap-2">
                  <div class="flex justify-between items-center text-xs text-gray-400"><span>MAIN (L)</span><span>CUE (R)</span></div>
                  <div class="grid grid-cols-3 gap-2 items-center">
                      <div class="knob-container">
                          <div class="knob-visual" [style.transform]="'rotate(' + (cueMix() * 270 - 135) + 'deg)'"></div>
                          <input type="range" min="0" max="1" step="0.01" [value]="cueMix()" (input)="onCueMixChange($event)" class="knob">
                      </div>
                      <div class="knob-container">
                          <div class="knob-visual" [style.transform]="'rotate(' + (cueVolume() * 270 - 135) + 'deg)'"></div>
                          <input type="range" min="0" max="1" step="0.01" [value]="cueVolume()" (input)="onCueVolumeChange($event)" class="knob">
                      </div>
                      <div class="knob-container">
                          <div class="knob-visual" [style.transform]="'rotate(' + (masterVolume() * 270 - 135) + 'deg)'"></div>
                          <input type="range" min="0" max="1" step="0.01" [value]="masterVolume()" (input)="onMasterVolumeChange($event)" class="knob">
                      </div>
                      <span class="text-xs text-center text-gray-400">CUE/MIX</span>
                      <span class="text-xs text-center text-gray-400">CUE VOL</span>
                      <span class="text-xs text-center text-gray-400">MASTER</span>
                  </div>
              </div>
              }
              
              <div class="w-full">
                <input type="range" min="-1" max="1" step="0.01" [value]="crossfader()" (input)="onCrossfaderChange($event)" class="crossfader">
              </div>
              
              <div class="w-full bg-black/20 p-2 rounded-md mt-2 flex flex-col gap-2">
                  <div class="flex bg-gray-700 rounded-md p-1">
                      <button (click)="setDjMode('Manual')" [class]="djMode() === 'Manual' ? 'bg-gray-900 text-white' : 'text-gray-400'" class="px-3 py-1 text-sm font-bold rounded-md flex-1 transition-colors">Manual</button>
                      <button (click)="setDjMode('AI')" [disabled]="djSource() === 'YouTube'" [class]="djMode() === 'AI' ? 'bg-cyan-600 text-white' : 'text-gray-400'" class="px-3 py-1 text-sm font-bold rounded-md flex-1 transition-colors disabled:opacity-50">AI DJ</button>
                  </div>
              </div>
          </div>
      </div>
      <!-- Right Column: AI Assistant -->
      <div class="w-1/5 bg-gray-800 p-2 sm:p-4 rounded-lg shadow-lg flex flex-col min-h-0" id="ai-panel">
          <h2 class="text-lg sm:text-xl font-semibold mb-4 text-center">Source Select</h2>
          <div class="flex bg-gray-700 rounded-md p-1 mb-4">
            <button (click)="setDjSource('Local')" [class]="djSource() === 'Local' ? 'bg-gray-900 text-white' : 'text-gray-400'" class="px-3 py-1 text-sm font-bold rounded-md flex-1 transition-colors">Local</button>
            <button (click)="setDjSource('YouTube')" [class]="djSource() === 'YouTube' ? 'bg-red-600 text-white' : 'text-gray-400'" class="px-3 py-1 text-sm font-bold rounded-md flex-1 transition-colors">YouTube</button>
            <button (click)="setDjSource('Spotify')" [class]="djSource() === 'Spotify' ? 'bg-green-600 text-white' : 'text-gray-400'" class="px-3 py-1 text-sm font-bold rounded-md flex-1 transition-colors">Spotify</button>
          </div>

          <h2 class="text-lg sm:text-xl font-semibold mb-4 text-center">AI Controls</h2>
          <div class="flex flex-col gap-4">
              <div class="flex items-center justify-between bg-black/20 p-3 rounded-md">
                  <label for="tempo-sync" class="font-medium">Tempo Sync</label>
                  <input type="checkbox" id="tempo-sync" class="hidden toggle" [checked]="aiSettings().tempoSync" (change)="updateAiSetting('tempoSync', $any($event.target).checked)">
                  <div class="w-10 h-5 bg-gray-600 rounded-full transition-colors relative cursor-pointer">
                      <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"></div>
                  </div>
              </div>
              <div class="flex items-center justify-between bg-black/20 p-3 rounded-md">
                  <label for="use-crossfader" class="font-medium">Use Crossfader</label>
                  <input type="checkbox" id="use-crossfader" class="hidden toggle" [checked]="aiSettings().useCrossfader" (change)="updateAiSetting('useCrossfader', $any($event.target).checked)">
                  <div class="w-10 h-5 bg-gray-600 rounded-full transition-colors relative cursor-pointer">
                      <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"></div>
                  </div>
              </div>
              <div class="flex items-center justify-between bg-black/20 p-3 rounded-md">
                  <label for="use-looping" class="font-medium">Use Looping</label>
                  <input type="checkbox" id="use-looping" class="hidden toggle" [checked]="aiSettings().useLooping" (change)="updateAiSetting('useLooping', $any($event.target).checked)">
                  <div class="w-10 h-5 bg-gray-600 rounded-full transition-colors relative cursor-pointer">
                      <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"></div>
                  </div>
              </div>
          </div>

          <div class="mt-auto flex flex-col gap-2">
            @if(djMode() !== 'Manual') {
              <button (click)="toggleAiDj()" [disabled]="playlist().length < 2 || djSource() === 'YouTube'"
                      class="w-full py-3 rounded-md font-bold text-lg transition-colors"
                      [class.bg-green-600]="!audioPlaybackService.isPlaying()"
                      [class.hover:bg-green-500]="!audioPlaybackService.isPlaying()"
                      [class.bg-red-600]="audioPlaybackService.isPlaying()"
                      [class.hover:bg-red-500]="audioPlaybackService.isPlaying()"
                      [class.disabled:bg-gray-600]="playlist().length < 2 || djSource() === 'YouTube'">
                  {{ audioPlaybackService.isPlaying() ? 'Stop AI DJ' : 'Start AI DJ' }}
              </button>
            }
          </div>
      </div>
    } @else {
      <!-- Spotify Jukebox Mode -->
      <div class="w-full h-full flex flex-col items-center justify-center relative bg-black/20 rounded-xl overflow-hidden">
        @if(!spotifyService.isLoggedIn()) {
          <div class="text-center p-8">
              <h2 class="text-3xl font-bold mb-2 text-yellow-400">AI Jukebox</h2>
              <p class="text-gray-400 mb-6">Connect your Spotify Premium account to get started.</p>
              <button (click)="spotifyService.login()" class="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-full flex items-center gap-2 text-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm4.194 14.553c-.236.355-1.016.486-1.348.275-2.88-1.75-6.521-2.129-10.923-1.166-.416.09-.68-.216-.77-.632-.09-.416.216-.68.632-.77 4.793-1.043 8.815-.625 12.008 1.317.344.225.463.616.2.976zm.868-3.21c-.287.435-1.222.588-1.636.32-3.352-2.03-8.352-2.61-12.345-1.43-.502.148-.823-.225-.97-.727-.148-.502.225-.823.727-.97 4.485-1.29 9.94-..68 13.714 1.695.42.28.56.848.21 1.332zM17.78 7.26c-3.95-2.3-9.9-2.5-13.6-1.38-.58.176-1.002-.27-1.178-.85-.176-.58.27-1.002.85-1.178 4.29-1.26 10.86-1.02 15.28 1.55.52.308.71 1.002.403 1.522s-1.002.71-1.522.403h-.233z"></path></svg>
                Login with Spotify
              </button>
          </div>
        } @else {
          <div class="w-full h-full flex flex-col p-4 gap-4">
              <div class="flex-shrink-0 flex justify-center">
                  <button (click)="showAiPlaylistModal.set(true)" class="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-6 rounded-full flex items-center gap-2 text-lg">
                    Generate AI Playlist
                  </button>
              </div>

              <!-- Spotify Now Playing Bar -->
              @if(spotifyService.playerState(); as state) {
                <div class="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-md p-4 rounded-t-xl flex items-center gap-4 border-t border-gray-700">
                  @if(state.track_window.current_track; as track) {
                    <img [src]="track.album.images[track.album.images.length - 1]?.url" alt="Current album art" class="w-16 h-16 rounded-md">
                    <div class="flex-grow truncate">
                        <p class="text-white font-bold text-lg truncate">{{ track.name }}</p>
                        <p class="text-gray-300 truncate">{{ getArtistNames(track.artists) }}</p>
                    </div>
                  } @else {
                    <div class="w-16 h-16 rounded-md bg-gray-700 flex items-center justify-center"><svg class="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3a1 1 0 00-1 1v5.118a2.5 2.5 0 00-1.447.874l-.69.92c-.361.482-.193 1.14.331 1.445l.13.097a2.5 2.5 0 003.361-1.445l.69-.92a2.5 2.5 0 00-1.447-.874V4a1 1 0 00-1-1z"></path></svg></div>
                    <div><p class="text-white font-bold text-lg">AI Jukebox</p><p class="text-gray-400">Generate a playlist to begin</p></div>
                  }

                  <div class="flex items-center gap-4">
                      <button (click)="spotifyService.previousTrack()" class="text-gray-300 hover:text-white disabled:opacity-50" [disabled]="state.track_window.previous_tracks.length === 0"><svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" /></svg></button>
                      <button (click)="state.paused ? spotifyService.resume() : spotifyService.pause()" class="bg-white text-black rounded-full p-4 hover:scale-105 transition-transform">
                        @if(state.paused) {
                          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.14A1 1 0 005 6v8a1 1 0 001.3.89l6-4a1 1 0 000-1.78l-6-4z"></path></svg>
                        } @else {
                          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M5 5h3v10H5V5zm7 0h3v10h-3V5z"></path></svg>
                        }
                      </button>
                      <button (click)="spotifyService.nextTrack()" class="text-gray-300 hover:text-white disabled:opacity-50" [disabled]="state.track_window.next_tracks.length === 0"><svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414zm6 0a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L14.586 10l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg></button>
                  </div>
                  <button (click)="spotifyService.logout()" class="text-gray-400 hover:text-white text-sm ml-auto">Logout</button>
                </div>
              }
          </div>
        }
      </div>
    }
    
    <app-ai-playlist-modal 
      [isVisible]="showAiPlaylistModal()"
      (closeModal)="showAiPlaylistModal.set(false)"
      (playlistGenerated)="onPlaylistGenerated($event)"
    ></app-ai-playlist-modal>

  </main>
  <app-log-viewer></app-log-viewer>
</div>

<!-- SoundCloud Matches Modal -->
@if(soundCloudState().showModal) {
  <div class="fixed inset-0 bg-black/60 z-50 transition-opacity flex items-center justify-center" (click)="soundCloudState.set({ showModal: false, loading: false, matches: [], sourceSong: null })">
    <div class="bg-gray-800 border border-orange-500/30 rounded-lg shadow-2xl w-full max-w-2xl p-6" (click)="$event.stopPropagation()">
      <h2 class="text-2xl font-bold mb-4 text-orange-400">AI Track Matches for <span class="text-white">{{ soundCloudState().sourceSong?.title }}</span></h2>
      @if(soundCloudState().loading) {
        <div class="flex flex-col items-center justify-center h-64">
          <svg class="animate-spin h-10 w-10 text-orange-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <p class="mt-4 text-gray-400">Finding compatible tracks on SoundCloud...</p>
        </div>
      } @else {
        <ul class="divide-y divide-gray-700/50 max-h-[60vh] overflow-y-auto">
          @for(track of soundCloudState().matches; track track.id) {
            <li class="p-3 flex items-center gap-4">
              <img [src]="track.artwork_url" alt="Artwork" class="w-16 h-16 rounded-md object-cover bg-gray-700">
              <div class="flex-grow">
                <p class="text-white font-medium truncate">{{ track.title }}</p>
                <p class="text-gray-400 text-sm truncate">{{ track.artist }}</p>
              </div>
              <div class="text-center text-sm w-20">
                <p class="text-gray-300 font-mono">{{ track.bpm }} BPM</p>
                <p class="text-gray-300 font-mono">{{ track.key }}</p>
              </div>
              <div class="text-center w-24">
                <p class="text-lg font-bold text-green-400">{{ track.match_score }}%</p>
                <p class="text-xs text-gray-400">Match</p>
              </div>
              <a [href]="track.url" target="_blank" class="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-md text-sm">
                Listen
              </a>
            </li>
          }
        </ul>
      }
    </div>
  </div>
}
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private fileReader = new FileReader();
  private audioContext = new AudioContext();
  private nextId = 0;
  
  // Services
  aiService = inject(AiService);
  audioPlaybackService = inject(AudioPlaybackService);
  spotifyService = inject(SpotifyService);
  youTubeService = inject(YouTubeService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private logger = inject(LogService);

  // Component State
  playlist = signal<UniversalPlaylistItem[]>([]);
  isMenuOpen = signal(false);
  
  // Processing State
  filesToProcess = signal<File[]>([]);
  totalFilesToProcess = signal(0);
  filesProcessed = signal(0);
  isProcessing = computed(() => this.filesToProcess().length > 0 || this.totalFilesToProcess() > 0 && this.filesProcessed() < this.totalFilesToProcess());
  processingStatusText = computed(() => {
    if (this.isProcessing()) {
      return `Processing ${this.filesProcessed()}/${this.totalFilesToProcess()}`;
    }
    return 'Import';
  });
  
  // Setlist UI State
  searchTerm = signal('');
  draggedItem = signal<UniversalPlaylistItem | null>(null);

  // Mixer State
  masterVolume = this.audioPlaybackService.masterVolume;
  cueVolume = this.audioPlaybackService.cueVolume;
  cueMix = this.audioPlaybackService.cueMix;
  crossfader = signal<number>(-1);
  
  // Deck State (Local Files)
  deckA = this.audioPlaybackService.deckA;
  deckB = this.audioPlaybackService.deckB;
  
  // Deck State (YouTube)
  ytDeckAState = signal<YouTubePlayerState>(this.youTubeService.createInitialState());
  ytDeckBState = signal<YouTubePlayerState>(this.youTubeService.createInitialState());
  ytDeckASubs: Subscription | null = null;
  ytDeckBSubs: Subscription | null = null;
  ytLoadedTrackA = signal<UniversalPlaylistItem | null>(null);
  ytLoadedTrackB = signal<UniversalPlaylistItem | null>(null);
  ytDeckAVolume = signal(1); // 0-1 range
  ytDeckBVolume = signal(1); // 0-1 range
  
  elapsedTimeA = signal(0);
  elapsedTimeB = signal(0);
  
  // AI State
  djSource = signal<DJSource>('Local');
  djMode = signal<'Manual' | 'AI'>('Manual');
  aiSettings = this.aiService.settings;
  breakState = this.audioPlaybackService.breakState;
  
  // Local Model Selection
  ollamaModels = this.aiService.availableModels;
  selectedOllamaModel = this.aiService.selectedModel;

  // SoundCloud State
  soundCloudState = signal<{showModal: boolean, loading: boolean, matches: SoundCloudTrack[], sourceSong: Song | null}>({
    showModal: false, loading: false, matches: [], sourceSong: null
  });

  // AI Playlist Generator State
  showAiPlaylistModal = signal(false);
  
  // Tutorial State
  tutorialSteps: TutorialStep[] = [
    { title: 'Welcome to DJ Mix Master!', text: 'This quick tour will show you the key features.', position: 'center' },
    { title: 'The Setlist', text: 'Import your music here. Drag and drop tracks to reorder your set.', selector: '#setlist-panel', position: 'right' },
    { title: 'The DJ Decks', text: 'Load tracks here for playback. You can see the title, BPM, and remaining time.', selector: '#deck-a', position: 'right' },
    { title: 'The Platter', text: 'Click and drag the platter to scratch the record when in Manual mode.', selector: '#platter-a', position: 'right' },
    { title: 'The Mixer', text: 'Control volume, EQ, and crossfade between decks in Manual mode.', selector: '#mixer', position: 'top' },
    { title: 'AI Controls', text: 'Toggle AI features and start the AI DJ for automated mixing.', selector: '#ai-panel', position: 'left' },
    { title: 'Ready to Mix!', text: 'Import a folder of music and start your journey. Enjoy!', position: 'center' }
  ];
  tutorialState = signal({ active: false, step: 0 });
  currentTutorialStep = computed(() => this.tutorialSteps[this.tutorialState().step]);

  // Computed Values
  filteredPlaylist = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.playlist();
    return this.playlist().filter(item => {
      if (item.type === 'break') return true;
      return item.title.toLowerCase().includes(term) || item.artist.toLowerCase().includes(term);
    });
  });

  adjustedBpmA = computed(() => {
      if (this.djSource() === 'Local') return (this.deckA().song?.tempo?.middle ?? 0) * this.deckA().playbackRate;
      const track = this.ytLoadedTrackA();
      if (track?.type === 'youtube' && track.bpm) return track.bpm * this.ytDeckAState().playbackRate;
      return 0;
  });
  adjustedBpmB = computed(() => {
      if (this.djSource() === 'Local') return (this.deckB().song?.tempo?.middle ?? 0) * this.deckB().playbackRate;
      const track = this.ytLoadedTrackB();
      if (track?.type === 'youtube' && track.bpm) return track.bpm * this.ytDeckBState().playbackRate;
      return 0;
  });

  deckABeatMarkers = computed(() => this.calculateBeatMarkers(this.deckA()));
  deckBBeatMarkers = computed(() => this.calculateBeatMarkers(this.deckB()));

  constructor() {
    this.logger.info('AppComponent', 'Constructor called');
    this.fileReader.onload = (e: ProgressEvent<FileReader>) => {
      this.logger.debug('AppComponent', 'FileReader onload event triggered');
      this.zone.run(() => {
        if (e.target?.result) {
          this.decodeAudioData(e.target.result as ArrayBuffer);
        } else {
          this.logger.warn('AppComponent', 'FileReader onload event had no result');
        }
      });
    };
    
    const storedTutorialState = localStorage.getItem('djMixMasterTutorial');
    if (!storedTutorialState) {
        this.logger.info('AppComponent', 'No tutorial state found, starting tutorial');
        this.tutorialState.set({ active: true, step: 0 });
    }
    
    // Subscribe to YouTube player state changes
    this.ytDeckASubs = this.youTubeService.playerStateA$.subscribe(state => {
      this.ytDeckAState.set(state);
    });
    this.ytDeckBSubs = this.youTubeService.playerStateB$.subscribe(state => {
      this.ytDeckBState.set(state);
    });
  }

  ngAfterViewInit() {
    this.logger.info('AppComponent', 'AfterViewInit lifecycle hook');
    this.startGameLoop();
  }

  ngOnDestroy() {
    this.logger.info('AppComponent', 'OnDestroy lifecycle hook');
    this.youTubeService.destroy();
    this.ytDeckASubs?.unsubscribe();
    this.ytDeckBSubs?.unsubscribe();
  }
  
  onFileSelected(event: Event) {
    this.logger.info('AppComponent', 'File selection event triggered');
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files).filter(file => file.type.startsWith('audio/'));
      this.logger.info('AppComponent', `Processing ${files.length} audio files`);
      this.totalFilesToProcess.set(files.length);
      this.filesProcessed.set(0);
      this.filesToProcess.set(files);
      this.processNextFile();
    }
  }

  processNextFile() {
    this.zone.run(() => {
      const files = this.filesToProcess();
      if (files.length === 0) {
        if(this.totalFilesToProcess() > 0) {
            this.logger.info('AppComponent', 'Finished processing all files.');
            this.totalFilesToProcess.set(0);
            this.filesProcessed.set(0);
        }
        return;
      }
      const nextFile = files[0];
      this.logger.info('AppComponent', `Processing next file: ${nextFile.name}`);
      const newSong: Song = this.createSongObject(nextFile.name);
      
      this.playlist.update(p => [...p, newSong]);
      
      this.updateSongStatus(newSong.id, 'analyzing_meta');
  
      setTimeout(() => {
        this.zone.run(() => {
          this.updateSongStatus(newSong.id, 'loading_audio');
          this.fileReader.readAsArrayBuffer(nextFile);
        });
      }, 100);
    });
  }

  private decodeAudioData(arrayBuffer: ArrayBuffer) {
    const song = this.playlist().find(s => s.type === 'song' && s.status === 'loading_audio') as Song;
    if (!song) {
        this.logger.warn('AppComponent', 'decodeAudioData called but no song is in "loading_audio" state.');
        this.filesToProcess.update(f => f.slice(1));
        this.filesProcessed.update(p => p + 1);
        this.zone.run(() => setTimeout(() => this.processNextFile(), 0));
        return;
    };
    
    this.logger.info('AppComponent', `Decoding audio data for song ID ${song.id}`);
    this.updateSongStatus(song.id, 'analyzing_track');
    
    this.audioContext.decodeAudioData(arrayBuffer).then(buffer => {
      this.zone.run(() => {
        this.logger.info('AppComponent', `Audio decoded successfully for song ID ${song.id}`);
        this.playlist.update(p => p.map(item => item.id === song.id ? { ...item, audioBuffer: buffer, duration: buffer.duration } : item));
        const updatedSong = this.playlist().find(s => s.id === song.id) as Song;
        this.generateWaveformData(updatedSong.id, buffer);
        this.aiService.analyzeTrack(updatedSong).subscribe({
            next: (analysis) => {
                this.zone.run(() => {
                    this.logger.info('AppComponent', `AI analysis complete for song ID ${song.id}`);
                    this.playlist.update(p => p.map(item => item.id === song.id ? { ...item, ...analysis, status: 'ready' } : item));
                    this.filesToProcess.update(f => f.slice(1));
                    this.filesProcessed.update(p => p + 1);
                    setTimeout(() => this.processNextFile(), 0);
                });
            }
        });
      });
    }).catch(e => {
      this.zone.run(() => {
        this.logger.error('AppComponent', `Error decoding audio data for song ID ${song.id}`, e);
        this.updateSongStatus(song.id, 'error', 'Failed to decode audio.');
        this.filesToProcess.update(f => f.slice(1));
        this.filesProcessed.update(p => p + 1);
        setTimeout(() => this.processNextFile(), 0);
      });
    });
  }

  private generateWaveformData(songId: number, buffer: AudioBuffer) {
    this.logger.debug('AppComponent', `Generating waveform for song ID ${songId}`);
    const waveform = this.audioPlaybackService.generateWaveform(buffer);
    const beatPeaks = this.audioPlaybackService.analyzeBeatPeaks(buffer);
    this.playlist.update(p => p.map(item => 
      item.id === songId ? { ...item, waveform, beatPeaks } : item
    ));
  }
  
  private createSongObject(fileName: string): Song {
    const cleanedName = fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    let [artist, title] = cleanedName.split(' - ');
    if (!title) { title = artist; artist = 'Unknown Artist'; }
    const newId = this.nextId++;
    this.logger.debug('AppComponent', `Created new song object with ID ${newId} for file: ${fileName}`);
    return {
      type: 'song', id: newId, title, artist,
      duration: null, status: 'pending', audioBuffer: null, waveform: [], beatPeaks: [],
      tempo: null, key: null, traditionalKey: null, mixabilityScore: null,
      energyLevel: null, downbeats: null, potentialLoopPoints: null,
      instrumentalSections: []
    };
  }

  private updateSongStatus(id: number, status: SongStatus, errorMessage?: string) {
    this.logger.debug('AppComponent', `Updating status for song ID ${id} to ${status}`);
    this.playlist.update(p => p.map(item => 
      item.id === id ? { ...item, status: status, errorMessage: errorMessage } as Song : item
    ));
  }
  
  // Drag and Drop
  onDragStart(item: UniversalPlaylistItem) { this.logger.debug('AppComponent', `Drag started for item ID ${item.id}`); this.draggedItem.set(item); }
  onDragOver(event: DragEvent) { event.preventDefault(); }
  onDrop(targetItem: UniversalPlaylistItem) {
    const draggedItem = this.draggedItem();
    if (!draggedItem || draggedItem.id === targetItem.id) return;
    this.logger.info('AppComponent', `Dropped item ID ${draggedItem.id} onto item ID ${targetItem.id}`);
    this.playlist.update(currentPlaylist => {
      const fromIndex = currentPlaylist.findIndex(p => p.id === draggedItem.id);
      const toIndex = currentPlaylist.findIndex(p => p.id === targetItem.id);
      if (fromIndex === -1 || toIndex === -1) return currentPlaylist;
      const newPlaylist = [...currentPlaylist];
      newPlaylist.splice(fromIndex, 1);
      newPlaylist.splice(toIndex, 0, draggedItem);
      return newPlaylist;
    });
  }
  onDragEnd() { this.logger.debug('AppComponent', 'Drag ended'); this.draggedItem.set(null); }
  onDropOnDeck(event: DragEvent, deckId: 'A' | 'B') {
    event.preventDefault();
    const draggedItem = this.draggedItem();
    this.logger.info('AppComponent', `Drop event on Deck ${deckId}`);
    if (draggedItem) {
        if ((draggedItem.type === 'song' && draggedItem.status === 'ready') || draggedItem.type === 'youtube') {
            this.loadSongToDeck(draggedItem, deckId);
        }
    }
    this.onDragEnd();
  }

  // Playlist Management
  optimizePlaylist() {
    this.logger.info('AppComponent', 'Optimize playlist requested');
    this.aiService.optimizePlaylist(this.playlist() as PlaylistItem[]).subscribe(optimized => this.playlist.set(optimized as UniversalPlaylistItem[]));
  }
  addBreak() {
    this.logger.info('AppComponent', 'Add break requested');
    const newBreak: Break = { type: 'break', id: this.nextId++, duration: 300, configuredDuration: 5 };
    this.playlist.update(p => [...p, newBreak]);
  }

  // Deck Controls
  async loadSongToDeck(item: UniversalPlaylistItem, deckId: 'A' | 'B') { 
    this.logger.info('AppComponent', `Loading track ID ${item.id} to Deck ${deckId}`);
    if (item.type === 'song') {
        this.audioPlaybackService.loadTrackToDeck(item, deckId);
    } else if (item.type === 'youtube' && item.videoId) {
        this.youTubeService.loadVideo(deckId, item.videoId);
        if (deckId === 'A') this.ytLoadedTrackA.set(item);
        else this.ytLoadedTrackB.set(item);
    }
  }

  toggleDeckPlayback(deckId: 'A' | 'B') {
    this.logger.info('AppComponent', `Toggle playback for Deck ${deckId}`);
    if (this.djSource() === 'Local') {
        this.audioPlaybackService.toggleDeckPlayback(deckId);
    } else {
        const state = deckId === 'A' ? this.ytDeckAState() : this.ytDeckBState();
        if (state.isPlaying) this.youTubeService.pause(deckId);
        else this.youTubeService.play(deckId);
    }
  }
  
  onVolumeChange(deckId: 'A' | 'B', event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (this.djSource() === 'Local') {
        this.audioPlaybackService.setVolume(deckId, value);
    } else {
        if (deckId === 'A') this.ytDeckAVolume.set(value);
        else this.ytDeckBVolume.set(value);
        this.applyYouTubeCrossfader();
    }
  }
  onTrimChange(deckId: 'A' | 'B', event: Event) { this.audioPlaybackService.setTrim(deckId, parseFloat((event.target as HTMLInputElement).value)); }
  onEqChange(deckId: 'A' | 'B', band: string, event: Event) { this.audioPlaybackService.setEq(deckId, band as 'High'|'Mid'|'Low', parseFloat((event.target as HTMLInputElement).value)); }
  
  onPitchChange(deckId: 'A' | 'B', value: number) { 
      if (this.djSource() === 'Local') {
          this.audioPlaybackService.setPlaybackRate(deckId, value);
      } else {
          this.youTubeService.setPlaybackRate(deckId, value);
      }
  }
  
  onPitchAdjust(deckId: 'A' | 'B', amount: number) { 
      const currentRate = this.deckPlaybackRate(deckId);
      const newRate = currentRate + amount;
      if (this.djSource() === 'Local') {
        this.audioPlaybackService.setPlaybackRate(deckId, newRate); 
      } else {
        this.youTubeService.setPlaybackRate(deckId, newRate);
      }
  }
  
  onBpmChange(deckId: 'A' | 'B', targetBpm: number) {
    if (this.djSource() === 'Local') {
        this.audioPlaybackService.setBpm(deckId, targetBpm);
    } else {
        const track = deckId === 'A' ? this.ytLoadedTrackA() : this.ytLoadedTrackB();
        if (track?.type === 'youtube' && track.bpm && targetBpm > 0) {
            const newRate = targetBpm / track.bpm;
            this.youTubeService.setPlaybackRate(deckId, newRate);
        }
    }
  }

  onSync(deckId: 'A' | 'B') {
      this.logger.info('AppComponent', `Sync requested for Deck ${deckId}`);
      if(this.djSource() === 'Local') {
          this.audioPlaybackService.syncDeck(deckId);
      } else {
          const bpmA = this.adjustedBpmA();
          const bpmB = this.adjustedBpmB();
          const targetDeckBpm = deckId === 'A' ? bpmB : bpmA;
          const track = deckId === 'A' ? this.ytLoadedTrackA() : this.ytLoadedTrackB();
          if (track?.type === 'youtube' && track.bpm && targetDeckBpm > 0) {
              const newRate = targetDeckBpm / track.bpm;
              this.youTubeService.setPlaybackRate(deckId, newRate);
          }
      }
  }
  onCueToggle(deckId: 'A' | 'B') { this.audioPlaybackService.toggleCue(deckId); }
  
  onPlatterMouseDown(deckId: 'A' | 'B') {
      if (this.djMode() !== 'Manual' || this.djSource() !== 'Local') return;
      this.logger.debug('AppComponent', `Platter mouse down on Deck ${deckId}`);
      this.audioPlaybackService.startScratch(deckId);
      const onMouseMove = (moveEvent: MouseEvent) => {
        this.zone.run(() => this.audioPlaybackService.updateScratch(deckId, moveEvent.movementX));
      };
      const onMouseUp = () => {
          this.zone.run(() => this.audioPlaybackService.stopScratch(deckId));
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          this.logger.debug('AppComponent', `Platter mouse up on Deck ${deckId}, events removed`);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
  }
  
  getPlatterRotation(deckId: 'A' | 'B'): number {
      const time = this.deckElapsedTime(deckId);
      const bpm = deckId === 'A' ? this.adjustedBpmA() : this.adjustedBpmB();
      const revolutions = time * (bpm / 60) * (33.3 / 60);
      return (revolutions * 360) % 360;
  }
  
  // Mixer Controls
  onCrossfaderChange(event: Event) { 
      const value = parseFloat((event.target as HTMLInputElement).value);
      this.crossfader.set(value);
      if(this.djSource() === 'Local') {
          this.audioPlaybackService.setCrossfader(value);
      } else {
          this.applyYouTubeCrossfader();
      }
  }

  private applyYouTubeCrossfader() {
    const faderValue = this.crossfader();
    const gainA = Math.cos((faderValue + 1) * 0.25 * Math.PI);
    const gainB = Math.cos((1 - faderValue) * 0.25 * Math.PI);
    this.youTubeService.setVolume('A', this.ytDeckAVolume() * gainA * 100);
    this.youTubeService.setVolume('B', this.ytDeckBVolume() * gainB * 100);
  }

  onMasterVolumeChange(event: Event) { this.audioPlaybackService.setMasterVolume(parseFloat((event.target as HTMLInputElement).value)); }
  onCueVolumeChange(event: Event) { this.audioPlaybackService.setCueVolume(parseFloat((event.target as HTMLInputElement).value)); }
  onCueMixChange(event: Event) { this.audioPlaybackService.setCueMix(parseFloat((event.target as HTMLInputElement).value)); }

  // AI DJ Controls
  setDjMode(mode: 'Manual' | 'AI') {
    this.logger.info('AppComponent', `DJ Mode changed to ${mode}`);
    this.djMode.set(mode);
    this.audioPlaybackService.setDjMode(mode, this.playlist as any);
  }
  
  setDjSource(source: DJSource) {
    if (source === this.djSource()) return;
    this.logger.info('AppComponent', `DJ Source changed to ${source}`);
    this.djSource.set(source);
    this.playlist.set([]);
    this.audioPlaybackService.stop();
    this.ytLoadedTrackA.set(null);
    this.ytLoadedTrackB.set(null);

    if (source === 'YouTube') {
        // A small timeout is more reliable than requestAnimationFrame for ensuring the DOM is updated by Angular
        // before we try to attach the YouTube player to its div.
        setTimeout(() => {
            this.logger.debug('AppComponent', 'Requesting YouTube player creation after a short delay');
            this.youTubeService.createPlayers('youtube-player-a', 'youtube-player-b');
        }, 100);
    } else {
        this.youTubeService.destroy();
    }
  }

  toggleAiDj() {
    this.logger.info('AppComponent', `Toggle AI DJ called. Current state: ${this.audioPlaybackService.isPlaying() ? 'playing' : 'stopped'}`);
    if (this.audioPlaybackService.isPlaying()) {
      this.audioPlaybackService.stop();
    } else {
      this.audioPlaybackService.play(this.playlist as any, 0);
    }
  }
  updateAiSetting(setting: keyof AIToolSettings, value: boolean) { this.logger.info('AppComponent', `AI setting changed: ${setting} = ${value}`); this.aiService.updateSettings({ [setting]: value }); }
  
  // Menu Controls
  selectOllamaModel(model: OllamaModel) { this.logger.info('AppComponent', `Selected Ollama model: ${model}`); this.aiService.selectModel(model); this.isMenuOpen.set(false); }

  // SoundCloud Matches
  findSoundCloudMatches(song: Song) {
    this.logger.info('AppComponent', `Finding SoundCloud matches for song ID ${song.id}`);
    this.soundCloudState.set({ showModal: true, loading: true, matches: [], sourceSong: song });
    this.aiService.findSoundCloudMatches(song).subscribe(matches => {
        this.logger.info('AppComponent', `Found ${matches.length} SoundCloud matches`);
        this.soundCloudState.update(s => ({ ...s, loading: false, matches }));
    });
  }

  onPlaylistGenerated(newPlaylist: UniversalPlaylistItem[]) {
      this.logger.info('AppComponent', `AI Playlist generated with ${newPlaylist.length} tracks.`);
      if (this.djSource() === 'Spotify') {
        const uris = newPlaylist.map(track => (track as any).uri).filter(Boolean);
        if (uris.length > 0) {
            this.spotifyService.playUris(uris);
        }
      } else {
        this.playlist.set(newPlaylist);
      }
      this.showAiPlaylistModal.set(false);
  }

  // Game Loop for timing and visuals
  private startGameLoop() {
    const update = () => {
      this.zone.run(() => {
        if (this.djSource() === 'Local') {
            this.elapsedTimeA.set(this.audioPlaybackService.getDeckPlaybackTime('A'));
            this.elapsedTimeB.set(this.audioPlaybackService.getDeckPlaybackTime('B'));
        }
      });
      requestAnimationFrame(update);
    };
    this.logger.debug('AppComponent', 'Starting game loop for animations');
    requestAnimationFrame(update);
  }

  // Formatting
  getArtistNames(artists: SpotifyArtist[]): string {
    return artists.map(a => a.name).join(', ');
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  calculateBeatMarkers(deck: DeckState): { angle: number, isDownbeat: boolean }[] {
      if (!deck.song?.downbeats || !deck.song.duration) return [];
      const markers = [];
      for (let i = 0; i < deck.song.downbeats.length; i++) {
          const beatTime = deck.song.downbeats[i];
          const angle = (beatTime / deck.song.duration) * 360;
          markers.push({ angle, isDownbeat: i % 4 === 0 });
      }
      return markers;
  }
  
  // Tutorial Logic
  nextTutorialStep() { this.logger.debug('AppComponent', 'Next tutorial step'); this.tutorialState.update(s => { if (s.step < this.tutorialSteps.length - 1) { return { ...s, step: s.step + 1 }; } else { localStorage.setItem('djMixMasterTutorial', 'completed'); return { ...s, active: false }; } }); }
  prevTutorialStep() { this.logger.debug('AppComponent', 'Previous tutorial step'); this.tutorialState.update(s => s.step > 0 ? { ...s, step: s.step - 1 } : s); }
  skipTutorial() { this.logger.info('AppComponent', 'Tutorial skipped'); localStorage.setItem('djMixMasterTutorial', 'completed'); this.tutorialState.set({ active: false, step: 0 }); }
  
  tutorialHighlightStyle = computed(() => { const step = this.currentTutorialStep(); if (!step?.selector) return { display: 'none' }; const elem = document.querySelector(step.selector) as HTMLElement; if (!elem) return { display: 'none' }; const rect = elem.getBoundingClientRect(); return { top: `${rect.top - 8}px`, left: `${rect.left - 8}px`, width: `${rect.width + 16}px`, height: `${rect.height + 16}px` }; });
  tutorialPopupStyle = computed(() => { const step = this.currentTutorialStep(); if (!step) return { display: 'none' }; if (!step.selector) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }; const elem = document.querySelector(step.selector) as HTMLElement; if (!elem) return { display: 'none' }; const rect = elem.getBoundingClientRect(); const popupRect = { width: 320, height: 150 }; let top = 0, left = 0; switch (step.position) { case 'top': top = rect.top - popupRect.height - 20; left = rect.left + rect.width / 2 - popupRect.width / 2; break; case 'bottom': top = rect.bottom + 20; left = rect.left + rect.width / 2 - popupRect.width / 2; break; case 'left': left = rect.left - popupRect.width - 20; top = rect.top + rect.height / 2 - popupRect.height / 2; break; case 'right': left = rect.right + 20; top = rect.top + rect.height / 2 - popupRect.height / 2; break; } return { top: `${Math.max(10, Math.min(top, window.innerHeight - popupRect.height - 10))}px`, left: `${Math.max(10, Math.min(left, window.innerWidth - popupRect.width - 10))}px` }; });
  tutorialArrowClass = computed(() => { const step = this.currentTutorialStep(); if (!step) return ''; switch(step.position) { case 'top': return 'arrow-bottom'; case 'bottom': return 'arrow-top'; case 'left': return 'arrow-right'; case 'right': return 'arrow-left'; default: return ''; } });

  // *** DECK STATE ABSTRACTION HELPERS ***
  deckLoadedTrack(deckId: 'A' | 'B'): UniversalPlaylistItem | null {
    if (this.djSource() === 'Local') {
        return (deckId === 'A' ? this.deckA().song : this.deckB().song);
    }
    return (deckId === 'A' ? this.ytLoadedTrackA() : this.ytLoadedTrackB());
  }
  deckElapsedTime(deckId: 'A' | 'B'): number {
    if (this.djSource() === 'Local') return deckId === 'A' ? this.elapsedTimeA() : this.elapsedTimeB();
    return deckId === 'A' ? this.ytDeckAState().currentTime : this.ytDeckBState().currentTime;
  }
  deckDuration(deckId: 'A' | 'B'): number {
    if (this.djSource() === 'Local') return (deckId === 'A' ? this.deckA().song?.duration : this.deckB().song?.duration) ?? 0;
    return deckId === 'A' ? this.ytDeckAState().duration : this.ytDeckBState().duration;
  }
  deckRemainingTime(deckId: 'A' | 'B'): number { return this.deckDuration(deckId) - this.deckElapsedTime(deckId); }
  
  deckPlaybackRate(deckId: 'A' | 'B'): number {
    if (this.djSource() === 'Local') return (deckId === 'A' ? this.deckA().playbackRate : this.deckB().playbackRate);
    return (deckId === 'A' ? this.ytDeckAState().playbackRate : this.ytDeckBState().playbackRate);
  }
  deckVolume(deckId: 'A' | 'B'): number {
      if (this.djSource() === 'Local') return (deckId === 'A' ? this.deckA().volume : this.deckB().volume);
      return (deckId === 'A' ? this.ytDeckAVolume() : this.ytDeckBVolume());
  }

}