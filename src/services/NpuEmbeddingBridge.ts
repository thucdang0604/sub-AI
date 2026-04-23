import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { eventManager } from './EventManager.js';

interface EmbeddingRequest {
    type: 'document' | 'query';
    texts: string[];
}

interface QueueItem {
    request: EmbeddingRequest;
    resolve: (embeddings: number[][]) => void;
    reject: (error: any) => void;
}

export class NpuEmbeddingBridge {
    private static instance: NpuEmbeddingBridge;
    private childProcess: ChildProcess | null = null;
    private queue: QueueItem[] = [];
    private isProcessing: boolean = false;
    private isReady: boolean = false;
    private rootDir: string;
    
    private constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.startDaemon();
        
        // Clean up zombie process on exit
        process.on('exit', () => this.killDaemon());
        process.on('SIGINT', () => {
            this.killDaemon();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            this.killDaemon();
            process.exit(0);
        });
    }

    public static getInstance(rootDir: string): NpuEmbeddingBridge {
        if (!NpuEmbeddingBridge.instance) {
            NpuEmbeddingBridge.instance = new NpuEmbeddingBridge(rootDir);
        }
        return NpuEmbeddingBridge.instance;
    }

    private startDaemon() {
        if (this.childProcess) return;

        const pythonExecutable = path.join(this.rootDir, '.ai_cache', 'venv', 'Scripts', 'python.exe');
        const scriptPath = path.join(this.rootDir, 'src', 'services', 'npu_service.py');

        this.childProcess = spawn(pythonExecutable, [scriptPath], {
            cwd: this.rootDir,
            stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
        });

        let stdoutBuffer = '';
        this.childProcess.stdout?.on('data', (data: Buffer) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const response = JSON.parse(line);
                    
                    if (response.status === 'ready') {
                        this.isReady = true;
                        eventManager.emitLog('success', '[NPU Bridge] Python Daemon is ready!');
                        this.processNext();
                    } else if (response.status === 'success') {
                        if (this.queue.length > 0) {
                            const currentItem = this.queue.shift();
                            currentItem?.resolve(response.embeddings);
                        }
                        this.isProcessing = false;
                        this.processNext();
                    } else if (response.status === 'error') {
                        eventManager.emitLog('error', `[NPU Bridge] Error: ${response.message}`);
                        if (this.queue.length > 0) {
                            const currentItem = this.queue.shift();
                            currentItem?.reject(new Error(response.message));
                        }
                        this.isProcessing = false;
                        this.processNext();
                    }
                } catch (e) {
                    // Not JSON, might be a regular log
                    // console.log("Daemon log:", line);
                }
            }
        });

        this.childProcess.stderr?.on('data', (data: Buffer) => {
            // Some libraries log to stderr instead of stdout (e.g. llama.cpp)
            // eventManager.emitLog('info', `[NPU Bridge] stderr: ${data.toString()}`);
        });

        this.childProcess.on('close', (code) => {
            eventManager.emitLog('warning', `[NPU Bridge] Daemon exited with code ${code}. Restarting...`);
            this.childProcess = null;
            this.isReady = false;
            
            // Fix deadlock: Reject current item if we were processing
            if (this.isProcessing && this.queue.length > 0) {
                const item = this.queue.shift();
                item?.reject(new Error(`Daemon crashed with code ${code}`));
                this.isProcessing = false;
            }
            
            // Retry after 3s
            setTimeout(() => this.startDaemon(), 3000);
        });
    }

    private killDaemon() {
        if (this.childProcess) {
            this.childProcess.kill();
            this.childProcess = null;
        }
    }

    private processNext() {
        if (this.isProcessing || this.queue.length === 0 || !this.isReady || !this.childProcess) return;

        this.isProcessing = true;
        const currentItem = this.queue[0];
        if (!currentItem) {
            this.isProcessing = false;
            return;
        }
        
        try {
            const reqStr = JSON.stringify(currentItem.request) + '\n';
            this.childProcess.stdin?.write(reqStr);
        } catch (e) {
            this.isProcessing = false;
            const item = this.queue.shift();
            item?.reject(e);
            this.processNext();
        }
    }

    public async getEmbeddingsBatch(texts: string[], type: 'document' | 'query' = 'document'): Promise<number[][]> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                request: { type, texts },
                resolve,
                reject
            });
            this.processNext();
        });
    }

    public async getEmbedding(text: string, type: 'document' | 'query' = 'document'): Promise<number[]> {
        const results = await this.getEmbeddingsBatch([text], type);
        return results[0] || [];
    }
}
