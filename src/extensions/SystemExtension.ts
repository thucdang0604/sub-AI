import { IExtension, IExtensionContext, McpToolDeclaration } from '../core/interfaces/IExtension';
import { IRouter } from '../core/interfaces/IRouter';
import { eventBus } from '../core/EventBus';
import * as os from 'os';

export class SystemExtension implements IExtension {
  name = 'SystemExtension';
  version = '1.0.0';

  async initialize(context: IExtensionContext): Promise<void> {
    console.log(`[SystemExtension] Initialized`);
  }

  registerRoutes(router: IRouter): void {
    // Hardware monitoring endpoint
    router.get('/api/hardware', async (req, res, body) => {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // os.loadavg() returns average system load over 1, 5, 15 minutes. 
      // Approximate CPU usage percent based on 1m loadavg relative to core count
      let cpuPercent = Math.round(((os.loadavg()[0] || 0) / (cpus?.length || 1)) * 100);
      if (cpuPercent > 100) cpuPercent = 100;

      const hwInfo = {
        cpu: {
          usage_percent: cpuPercent
        },
        ram: {
          used_gb: (usedMem / 1024 / 1024 / 1024).toFixed(1),
          total_gb: (totalMem / 1024 / 1024 / 1024).toFixed(1),
          usage_percent: Math.round((usedMem / totalMem) * 100)
        },
        vram: {
          available: false
        },
        npu: {
          available: false,
          name: 'Not Detected'
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(hwInfo));
    });

    // System info endpoint (separate from /api/settings which handles API keys)
    router.get('/api/system', async (req, res, body) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        version: this.version,
        environment: process.env.NODE_ENV || 'development'
      }));
    });

    // SSE Events endpoint
    router.get('/api/events', async (req, res, body) => {
      res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
      });
      
      const onLog = (data: any) => res.write(`data: ${JSON.stringify({ type: 'log', ...data })}\n\n`);
      const onProgress = (data: any) => res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
      
      eventBus.on('rag-log', onLog);
      eventBus.on('rag-progress', onProgress);
      
      req.on('close', () => {
          eventBus.off('rag-log', onLog);
          eventBus.off('rag-progress', onProgress);
      });
    });
  }

  registerMcpTools(): McpToolDeclaration[] {
    return [
      {
        declaration: {
          name: 'get_system_guide',
          description: 'Get general information and guidelines about the sub-AI system.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        handler: async () => {
          return {
            content: [{
              type: 'text',
              text: 'Welcome to sub-AI system. This is a plugin-based architecture.'
            }]
          };
        }
      }
    ];
  }
}
