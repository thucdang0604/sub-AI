import type { LLMModelInfo } from '../domain/types';

export interface ILLMProviderService {
    checkHealth(): Promise<{ ok: boolean; modelCount?: number; error?: string }>;
    getModels(): Promise<LLMModelInfo[]>;
    // Yield chunks of text
    streamGenerate(model: string, fullPrompt: string, systemPrompt: string): AsyncIterableIterator<string>;
}
