import type { ILLMProviderService } from '../contracts/ILLMProviderService';
import type { LLMModelInfo } from '../domain/types';

export class GeminiProviderService implements ILLMProviderService {
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }

    async checkHealth(): Promise<{ ok: boolean; modelCount?: number; error?: string }> {
        if (!this.apiKey) {
            return { ok: false, error: 'Thiếu GEMINI_API_KEY' };
        }
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
                signal: controller.signal
            });
            clearTimeout(id);
            
            if (response.ok) {
                const data = await response.json() as any;
                return { ok: true, modelCount: data.models?.length || 0 };
            } else {
                return { ok: false, error: 'Gemini trả về lỗi ' + response.status };
            }
        } catch (e) {
            return { ok: false, error: 'Không thể kết nối Gemini' };
        }
    }

    async getModels(): Promise<LLMModelInfo[]> {
        if (!this.apiKey) return [];
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
                signal: controller.signal
            });
            clearTimeout(id);
            
            if (!response.ok) {
                throw new Error('Gemini error: ' + response.status);
            }
            const data = await response.json() as any;
            
            // Lọc ra các model dùng để chat
            const chatModels = (data.models || []).filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'));
            
            return chatModels.map((m: any) => ({
                id: m.name.replace('models/', ''),
                name: m.displayName || m.name.replace('models/', ''),
                provider: 'gemini',
                family: m.version,
            }));
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    async *streamGenerate(model: string, prompt: string, systemPrompt: string): AsyncIterableIterator<string> {
        if (!this.apiKey) throw new Error('Thiếu GEMINI_API_KEY');

        const modelName = model.startsWith('models/') ? model : `models/${model}`;

        const response = await fetch(`${this.baseUrl}/${modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: prompt }] }
                ],
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                }
            }),
        });

        if (!response.ok) {
            let errMsg = 'Gemini error ' + response.status;
            try {
                const errBody = await response.json() as any;
                errMsg = errBody.error?.message || errMsg;
            } catch {}
            throw new Error(errMsg);
        }

        if (!response.body) {
            throw new Error('No body in response');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.trim() && l.startsWith('data: '));

            for (const line of lines) {
                const dataStr = line.replace('data: ', '').trim();
                if (!dataStr || dataStr === '[DONE]') continue;
                
                try {
                    const parsed = JSON.parse(dataStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text) {
                        yield text;
                    }
                } catch {}
            }
        }

    }
}
