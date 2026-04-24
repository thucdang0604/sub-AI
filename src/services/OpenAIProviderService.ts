import type { ILLMProviderService } from '../contracts/ILLMProviderService';
import type { LLMModelInfo } from '../domain/types';
import { appConfig } from '../core/AppConfig';

export class OpenAIProviderService implements ILLMProviderService {
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = appConfig.openaiApiKey;
        this.baseUrl = 'https://api.openai.com/v1';
    }

    async checkHealth(): Promise<{ ok: boolean; modelCount?: number; error?: string }> {
        if (!this.apiKey) {
            return { ok: false, error: 'Thiếu OPENAI_API_KEY' };
        }
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                signal: controller.signal
            });
            clearTimeout(id);
            
            if (response.ok) {
                const data = await response.json() as any;
                return { ok: true, modelCount: data.data?.length || 0 };
            } else {
                return { ok: false, error: 'OpenAI trả về lỗi ' + response.status };
            }
        } catch (e) {
            return { ok: false, error: 'Không thể kết nối OpenAI' };
        }
    }

    async getModels(): Promise<LLMModelInfo[]> {
        if (!this.apiKey) return [];
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                signal: controller.signal
            });
            clearTimeout(id);
            
            if (!response.ok) {
                throw new Error('OpenAI error: ' + response.status);
            }
            const data = await response.json() as any;
            
            // Lọc ra các model GPT
            const gptModels = (data.data || []).filter((m: any) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'));
            
            return gptModels.map((m: any) => ({
                id: m.id,
                name: m.id,
                provider: 'openai',
            }));
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    async *streamGenerate(model: string, prompt: string, systemPrompt: string): AsyncIterableIterator<string> {
        if (!this.apiKey) throw new Error('Thiếu OPENAI_API_KEY');

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                stream: true,
            }),
        });

        if (!response.ok) {
            let errMsg = 'OpenAI error ' + response.status;
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
                if (dataStr === '[DONE]') {
                    break;
                }
                
                try {
                    const parsed = JSON.parse(dataStr);
                    const text = parsed.choices[0]?.delta?.content || '';
                    if (text) {
                        yield text;
                    }
                } catch {}
            }
        }
    }
}
