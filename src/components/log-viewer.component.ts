import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogService, LogMessage } from '../services/log.service';

@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-0 left-0 right-0 z-50">
        <div class="flex justify-end p-1">
            <button (click)="toggleVisibility()" class="bg-gray-700/80 backdrop-blur-sm text-white px-4 py-1 rounded-t-md text-xs font-semibold hover:bg-gray-600/80">
                {{ isVisible() ? 'Hide Logs' : 'Show Logs' }} ({{ logService.logs().length }})
            </button>
        </div>
        @if(isVisible()) {
            <div class="h-48 bg-black/80 backdrop-blur-sm p-2 overflow-y-auto font-mono text-xs border-t border-gray-600">
                @for(log of logService.logs(); track log.timestamp) {
                    <div class="flex items-start" [ngClass]="logColor(log.level)">
                        <span class="text-gray-500 flex-shrink-0">{{ log.timestamp | date:'HH:mm:ss.SSS' }}</span>
                        <span class="font-bold mx-2 flex-shrink-0">[{{ log.source }}]</span>
                        <span class="whitespace-pre-wrap">{{ log.message }}
                            @if(log.data) {
                                <span class="text-gray-400">{{ formatData(log.data) }}</span>
                            }
                        </span>
                    </div>
                }
            </div>
        }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogViewerComponent {
  logService = inject(LogService);
  isVisible = signal(false);

  toggleVisibility() {
    this.isVisible.update(v => !v);
  }

  logColor(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'): string {
    switch (level) {
      case 'INFO': return 'text-gray-300';
      case 'WARN': return 'text-yellow-400';
      case 'ERROR': return 'text-red-500';
      case 'DEBUG': return 'text-cyan-400';
      default: return 'text-gray-300';
    }
  }

  formatData(data: any): string {
      try {
        if (data instanceof Error) {
            return ` | Error: ${data.message}`;
        }
        return ` | Data: ${JSON.stringify(data)}`;
      } catch {
        return ` | Data: [Unserializable]`;
      }
  }
}
