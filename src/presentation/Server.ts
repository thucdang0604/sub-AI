import http from 'http';
import path from 'path';
import fs from 'fs';
import { appConfig } from '../core/AppConfig';
import { IStorageService } from '../contracts/IStorageService';
import { LLMProviderFactory } from '../services/LLMProviderFactory.js';
import { ExtensionManager } from '../core/ExtensionManager.js';
import { Router } from '../core/Router.js';

export class AppServer {
    private port: number;
    private toolDir: string;
    private storage: IStorageService;
    private extensionManager: ExtensionManager;
    private router: Router;

    private MIME_TYPES: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
    };

    constructor(port: number, toolDir: string, storage: IStorageService, extensionManager: ExtensionManager) {
        this.port = port;
        this.toolDir = toolDir;
        this.storage = storage;
        this.extensionManager = extensionManager;
        this.router = new Router();
        
        // Attach routes from extensions
        this.extensionManager.registerRoutes(this.router);
    }

    private jsonResponse(res: http.ServerResponse, status: number, data: any) {
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(data));
    }

    private async readBody(req: http.IncomingMessage): Promise<string> {
        let data = '';
        for await (const chunk of req) {
            data += chunk;
        }
        return data;
    }


    public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const url = (req.url ? req.url.split('?')[0] : '/') || '/';

        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            });
            res.end();
            return;
        }

        try {
            // Let the new Router handle it first
            const handled = await this.router.handle(req, res);
            if (handled) return;
            // API Status
            if (url === '/api/ai/status' && req.method === 'GET') {
                const ollama = LLMProviderFactory.getProvider('ollama');
                const health = await ollama.checkHealth();
                return this.jsonResponse(res, 200, health);
            }






            // Settings GET
            if (url === '/api/settings' && req.method === 'GET') {
                return this.jsonResponse(res, 200, appConfig.toSafeJSON());
            }

            // Settings POST
            if (url === '/api/settings' && req.method === 'POST') {
                const raw = await this.readBody(req);
                const body = JSON.parse(raw);
                
                if (body.OPENAI_API_KEY !== undefined) appConfig.openaiApiKey = body.OPENAI_API_KEY;
                if (body.GEMINI_API_KEY !== undefined) appConfig.geminiApiKey = body.GEMINI_API_KEY;
                if (body.AI_MODEL !== undefined) appConfig.aiModel = body.AI_MODEL;

                appConfig.saveToEnv();
                
                return this.jsonResponse(res, 200, { ok: true });
            }


            // Static Files
            let staticUrl = url === '/' ? '/index.html' : url;
            
            // Serve dependency-graph.json specifically from tool directory instead of public
            let filePath: string;
            if (staticUrl === '/dependency-graph.json') {
                filePath = path.join(this.toolDir, 'dependency-graph.json');
            } else {
                filePath = path.join(this.toolDir, 'public', staticUrl);
            }
            
            const safePath = path.resolve(filePath);
            if (!safePath.startsWith(this.toolDir)) {
                res.writeHead(403);
                return res.end('Forbidden');
            }

            if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                const ext = path.extname(safePath);
                const contentType = this.MIME_TYPES[ext] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
                fs.createReadStream(safePath).pipe(res);
                return;
            }

            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            
        } catch (e: any) {
            console.error('Server error', e);
            if (!res.headersSent) {
                this.jsonResponse(res, 500, { error: 'Internal Server Error' });
            } else {
                res.end();
            }
        }
    }

    public start() {
        const server = http.createServer((req, res) => this.handleRequest(req, res));
        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${this.port} in use. Attempting alt port ${this.port + 1}`);
                server.listen(this.port + 1);
            }
        });
        server.listen(this.port, () => {
            console.log(`🚀 Server running on http://localhost:${server.address() && (server.address() as any).port || this.port}`);
        });
    }

}
