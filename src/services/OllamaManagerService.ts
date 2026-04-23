import http from 'http';

export interface ModelResponse {
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: any;
}

export interface SummaryResult {
    summary: string;
    exports: string[];
    complexity: 'low' | 'medium' | 'high';
}

import { eventManager } from './EventManager.js';

export class OllamaManagerService {
    // Dual-Engine Routing Strategy
    // Tương lai có thể đổi embedUrl sang OpenVINO NPU
    private embedUrl = 'http://localhost:11434/api';
    private llmUrl = 'http://localhost:11434/api';

    constructor() {}

    /**
     * Check if Ollama is running and accessible
     */
    public async isOllamaRunning(url: string = this.llmUrl): Promise<boolean> {
        return new Promise((resolve) => {
            // Lấy base url (http://localhost:11434)
            const baseUrl = url.replace('/api', '');
            const req = http.get(baseUrl, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.end();
        });
    }

    /**
     * Get a list of currently installed models in Ollama
     */
    public async getInstalledModels(url: string = this.llmUrl): Promise<ModelResponse[]> {
        try {
            const response = await fetch(`${url}/tags`);
            if (!response.ok) throw new Error('Failed to fetch tags');
            const data = await response.json() as { models: ModelResponse[] };
            return data.models;
        } catch (error: any) {
            eventManager.emitLog('error', `Error getting installed models: ${error.message}`);
            return [];
        }
    }

    /**
     * Pull a model from Ollama registry, with progress streaming to console
     */
    public async checkAndPullModel(modelName: string, isEmbed: boolean = false): Promise<void> {
        const targetUrl = isEmbed ? this.embedUrl : this.llmUrl;
        const isRunning = await this.isOllamaRunning(targetUrl);
        if (!isRunning) {
            const err = `[OLLAMA ERROR] API ${targetUrl} không khả dụng! Vui lòng khởi động Ollama/NPU server.`;
            eventManager.emitLog('error', err);
            throw new Error(err);
        }

        const models = await this.getInstalledModels(targetUrl);
        const exists = models.some(m => m.model === modelName || m.model.startsWith(modelName + ':'));
        
        if (exists) {
            return;
        }

        const msg = `[OLLAMA] Model "${modelName}" chưa được cài đặt. Đang tự động tải xuống qua ${targetUrl}...`;
        eventManager.emitLog('info', msg);
        
        return new Promise((resolve, reject) => {
            const req = http.request(`${targetUrl}/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (res) => {
                res.on('data', (chunk) => {
                    try {
                        const lines = chunk.toString().split('\n').filter((l: string) => l.trim() !== '');
                        for (const line of lines) {
                            const data = JSON.parse(line);
                            if (data.status) {
                                if (data.total && data.completed) {
                                    eventManager.emitProgress('Pulling Model ' + modelName, data.completed, data.total, data.status);
                                } else {
                                    eventManager.emitLog('info', `[OLLAMA PULL] ${modelName} - ${data.status}`);
                                }
                            }
                        }
                    } catch (e) {
                        // Bỏ qua lỗi parse dở dang
                    }
                });

                res.on('end', () => {
                    eventManager.emitLog('success', `[OLLAMA] Đã tải xong model "${modelName}".`);
                    resolve();
                });
            });

            req.on('error', (err) => {
                eventManager.emitLog('error', `[OLLAMA ERROR] Lỗi khi tải model ${modelName}: ${err.message}`);
                reject(err);
            });

            req.write(JSON.stringify({ name: modelName, stream: true }));
            req.end();
        });
    }

    /**
     * Generate vector embedding for a chunk of code (Dual-Engine -> embedUrl)
     */
    public async getEmbedding(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
        try {
            const response = await fetch(`${this.embedUrl}/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt: text,
                    keep_alive: "5m" // Giữ model 5 phút
                })
            });
            
            if (!response.ok) {
                throw new Error(`Embedding API failed with status: ${response.status}`);
            }
            
            const data = await response.json() as any;
            return data.embedding;
        } catch (error: any) {
            eventManager.emitLog('error', `Error generating embedding: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate JSON summary for a chunk of code (Dual-Engine -> llmUrl)
     */
    public async generateSummary(code: string, model: string = 'qwen2.5-coder:1.5b'): Promise<SummaryResult> {
        const systemPrompt = `Bạn là một AI phân tích mã nguồn. KHÔNG giải thích dông dài. KHÔNG đưa ra lời khuyên. BẮT BUỘC trả về đúng định dạng JSON.
Định dạng yêu cầu:
{
  "summary": "Mô tả chức năng bằng 1-2 câu.",
  "exports": ["tên_hàm_hoặc_biến_xuất_ra"],
  "complexity": "low" // Chọn "low" (đơn giản), "medium" (vừa), hoặc "high" (phức tạp)
}`;

        try {
            const response = await fetch(`${this.llmUrl}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    system: systemPrompt,
                    prompt: `Đoạn code:\n\n${code}`,
                    format: 'json',
                    stream: false,
                    keep_alive: "5m"
                })
            });

            if (!response.ok) {
                throw new Error(`Generate API failed with status: ${response.status}`);
            }

            const data = await response.json() as any;
            const responseText = data.response;

            // Bóc tách JSON an toàn bằng Regex
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return {
                        summary: parsed.summary || 'Không có mô tả',
                        exports: Array.isArray(parsed.exports) ? parsed.exports : [],
                        complexity: parsed.complexity || 'medium'
                    };
                } catch (e) {
                    eventManager.emitLog('warning', `Lỗi parse JSON gốc, đang thử làm sạch (sanitize)...`);
                    try {
                        // Loại bỏ dấu phẩy thừa trước ngoặc đóng và các ký tự xuống dòng rác
                        let sanitized = jsonMatch[0]
                            .replace(/,\s*([\}\]])/g, '$1')
                            .replace(/[\n\r\t]/g, ' ');
                            
                        const parsed = JSON.parse(sanitized);
                        return {
                            summary: parsed.summary || 'Không có mô tả',
                            exports: Array.isArray(parsed.exports) ? parsed.exports : [],
                            complexity: parsed.complexity || 'medium'
                        };
                    } catch (e2) {
                        eventManager.emitLog('error', `Sanitize thất bại. Chuỗi gốc: ${jsonMatch[0].substring(0, 150)}...`);
                    }
                }
            }
            
            // Fallback
            return {
                summary: "Không thể trích xuất tóm tắt.",
                exports: [],
                complexity: 'high'
            };
        } catch (error: any) {
            eventManager.emitLog('error', `Error generating summary: ${error.message}`);
            throw error;
        }
    }

    /**
     * Chạy song song một mảng các tác vụ Promise (Batch processing)
     */
    public async processBatch<T, R>(items: T[], limit: number, processor: (item: T) => Promise<R>): Promise<R[]> {
        const results: R[] = [];
        let executing: Promise<any>[] = [];

        for (const item of items) {
            const p = processor(item);
            results.push(p as any);
            const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
        
        return Promise.all(results);
    }
}
