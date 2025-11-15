import { Injectable, signal } from '@angular/core';

export interface LogMessage {
  timestamp: number;
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  data?: any;
}

const MAX_LOGS = 200;

@Injectable({
  providedIn: 'root'
})
export class LogService {
  logs = signal<LogMessage[]>([]);

  private log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', source: string, message: string, data?: any) {
    const logMessage: LogMessage = {
      timestamp: Date.now(),
      level,
      source,
      message,
      data
    };

    this.logs.update(currentLogs => {
      const newLogs = [...currentLogs, logMessage];
      if (newLogs.length > MAX_LOGS) {
        return newLogs.slice(newLogs.length - MAX_LOGS);
      }
      return newLogs;
    });

    const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    consoleFn(`[${source}] ${message}`, data || '');
  }

  info(source: string, message: string, data?: any) {
    this.log('INFO', source, message, data);
  }

  warn(source: string, message: string, data?: any) {
    this.log('WARN', source, message, data);
  }

  error(source: string, message: string, data?: any) {
    this.log('ERROR', source, message, data);
  }

  debug(source: string, message: string, data?: any) {
    this.log('DEBUG', source, message, data);
  }
}
