import type { ILLMProviderService } from '../contracts/ILLMProviderService';
import type { LLMModelInfo } from '../domain/types';

export class OllamaProviderService implements ILLMProviderService {
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
    }

    async checkHealth(): Promise<{ ok: boolean; modelCount?: number; error?: string }> {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(id);
            
            if (response.ok) {
                const data = await response.json() as any;
                return { ok: true, modelCount: data.models?.length || 0 };
            } else {
                return { ok: false, error: 'Ollama returned error' };
            }
        } catch (e) {
            return { ok: false, error: 'Ollama is not running' };
        }
    }

    async getModels(): Promise<LLMModelInfo[]> {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(id);
            
            if (!response.ok) {
                throw new Error('Ollama error');
            }
            const data = await response.json() as any;
            return (data.models || []).map((m: any) => ({
                id: m.name,
                name: m.name,
                provider: 'ollama',
                size: m.size,
                modified: m.modified_at,
                family: m.details?.family || '',
                paramSize: m.details?.parameter_size || '',
                quantization: m.details?.quantization_level || '',
            }));
        } catch (e) {
            throw new Error('Cannot connect to Ollama. Run: ollama serve');
        }
    }

    async *streamGenerate(model: string, prompt: string, systemPrompt: string): AsyncIterableIterator<string> {
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                system: systemPrompt,
                stream: true,
            }),
        });

        if (!response.ok) {
            let errMsg = 'Ollama error';
            try {
                const errBody = await response.json() as any;
                errMsg = errBody.error || response.statusText;
            } catch {}
            throw new Error(errMsg);
        }

        if (!response.body) {
            throw new Error('No body in response');
        }

        // We use Node streams approach here or async generators depending on the Node version.
        // For node 18+ edge runtimes, Web Streams are available:
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    // Standardize output to yield JSON string chunks representing SSE data
                    if (parsed.response) {
                        yield parsed.response;
                    }
                } catch {}
            }
        }
    }
}
