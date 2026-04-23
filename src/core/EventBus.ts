import { EventEmitter } from 'events';

export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }

  emitLog(level: 'info' | 'warning' | 'error' | 'success', message: string, data?: any) {
    this.emit('rag-log', {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    });
  }

  emitProgress(task: string, current: number, total: number, message?: string) {
    this.emit('rag-progress', {
      timestamp: new Date().toISOString(),
      task,
      current,
      total,
      percent: total > 0 ? Math.round((current / total) * 100) : 0,
      message
    });
  }
}

export const eventBus = new EventBus();
