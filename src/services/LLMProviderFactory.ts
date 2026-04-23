import type { ILLMProviderService } from '../contracts/ILLMProviderService';
import { OllamaProviderService } from './OllamaProviderService.js';
import { OpenAIProviderService } from './OpenAIProviderService.js';
import { GeminiProviderService } from './GeminiProviderService.js';

export class LLMProviderFactory {
    static getProvider(providerName: string): ILLMProviderService {
        switch (providerName.toLowerCase()) {
            case 'openai':
                return new OpenAIProviderService();
            case 'gemini':
                return new GeminiProviderService();
            case 'ollama':
            default:
                return new OllamaProviderService();
        }
    }

    static getProviderForModel(modelName: string): ILLMProviderService {
        if (modelName.includes('gpt') || modelName.includes('o1') || modelName.includes('o3')) {
            return new OpenAIProviderService();
        }
        if (modelName.includes('gemini') || modelName.startsWith('models/gemini')) {
            return new GeminiProviderService();
        }
        return new OllamaProviderService();
    }
}
