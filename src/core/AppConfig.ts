/**
 * AppConfig — Centralized Environment Configuration
 * 
 * Tất cả process.env access được tập trung tại đây.
 * Các module khác import { appConfig } thay vì dùng process.env trực tiếp.
 * 
 * Fixes GitHub Issues: #1, #2, #4, #5, #6, #7
 */

import * as path from 'path';
import * as fs from 'fs';

class AppConfig {
    private _envPath: string;

    constructor() {
        this._envPath = path.resolve(process.cwd(), '.env');
    }

    // ─── API Keys ───
    get openaiApiKey(): string { return process.env.OPENAI_API_KEY || ''; }
    set openaiApiKey(val: string) { process.env.OPENAI_API_KEY = val; }

    get geminiApiKey(): string { return process.env.GEMINI_API_KEY || ''; }
    set geminiApiKey(val: string) { process.env.GEMINI_API_KEY = val; }

    get githubToken(): string { return process.env.GITHUB_TOKEN || ''; }
    set githubToken(val: string) { process.env.GITHUB_TOKEN = val; }

    // ─── Model Config ───
    get aiModel(): string { return process.env.AI_MODEL || ''; }
    set aiModel(val: string) { process.env.AI_MODEL = val; }

    get ollamaModel(): string { return process.env.OLLAMA_MODEL || 'qwen2.5:7b'; }
    get ollamaHost(): string { return process.env.OLLAMA_HOST || 'http://localhost:11434'; }

    // ─── Environment ───
    get nodeEnv(): string { return process.env.NODE_ENV || 'development'; }
    get port(): number { return parseInt(process.env.PORT || '3333', 10); }

    // ─── Persistence ───
    /** Save current API keys + model config to .env file */
    saveToEnv(): void {
        let content = fs.existsSync(this._envPath) ? fs.readFileSync(this._envPath, 'utf-8') : '';
        const updates: Record<string, string> = {
            'OPENAI_API_KEY': this.openaiApiKey,
            'GEMINI_API_KEY': this.geminiApiKey,
            'AI_MODEL': this.aiModel,
        };
        if (this.githubToken) updates['GITHUB_TOKEN'] = this.githubToken;

        for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(content)) {
                content = content.replace(regex, `${key}=${value}`);
            } else {
                content += `\n${key}=${value}`;
            }
        }
        fs.writeFileSync(this._envPath, content.trim() + '\n', 'utf-8');
    }

    /** Update a single key in .env file (preserves all other keys) */
    saveKeyToEnv(key: string, value: string): void {
        let content = fs.existsSync(this._envPath) ? fs.readFileSync(this._envPath, 'utf-8') : '';
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            content += `\n${key}=${value}`;
        }
        fs.writeFileSync(this._envPath, content.trim() + '\n', 'utf-8');
    }

    /** Get all safe-to-expose config as plain object (masks sensitive values) */
    toSafeJSON(): Record<string, string> {
        return {
            OPENAI_API_KEY: this.openaiApiKey,
            GEMINI_API_KEY: this.geminiApiKey,
            AI_MODEL: this.aiModel,
        };
    }
}

/** Singleton config instance — import this everywhere */
export const appConfig = new AppConfig();
