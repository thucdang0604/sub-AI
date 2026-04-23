import { IStorageService } from '../contracts/IStorageService';
import { ProjectGraph, ChatSession } from '../domain/types';
import fs from 'fs';
import path from 'path';

export class StorageService implements IStorageService {
    private toolDir: string;
    private historyDir: string;

    constructor(toolDir: string) {
        this.toolDir = toolDir;
        this.historyDir = path.join(toolDir, 'chat-history');
        if (!fs.existsSync(this.historyDir)) {
            fs.mkdirSync(this.historyDir, { recursive: true });
        }
    }

    async saveGraphToToolDir(graph: ProjectGraph): Promise<void> {
        const jsonPath = path.join(this.toolDir, 'dependency-graph.json');
        await fs.promises.mkdir(path.dirname(jsonPath), { recursive: true });
        await fs.promises.writeFile(jsonPath, JSON.stringify(graph, null, 2), 'utf-8');
    }

    async saveAIMapsToProject(projectRoot: string, mdDependencies: string, aiMap: string): Promise<void> {
        const mdPath = path.join(projectRoot, 'FILE_DEPENDENCIES.md');
        const aiMapPath = path.join(projectRoot, 'AI_FILE_MAP.md');
        await fs.promises.writeFile(mdPath, mdDependencies, 'utf-8');
        await fs.promises.writeFile(aiMapPath, aiMap, 'utf-8');
    }

    async saveChatSession(session: ChatSession): Promise<void> {
        const filePath = path.join(this.historyDir, `${session.id}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    }

    async deleteChatSession(id: string): Promise<void> {
        const filePath = path.join(this.historyDir, `${id}.json`);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }

    async loadGraphFromToolDir(): Promise<ProjectGraph | null> {
        const jsonPath = path.join(this.toolDir, 'dependency-graph.json');
        if (!fs.existsSync(jsonPath)) return null;
        try {
            const data = await fs.promises.readFile(jsonPath, 'utf-8');
            return JSON.parse(data) as ProjectGraph;
        } catch {
            return null;
        }
    }

    async getChatSessions(): Promise<ChatSession[]> {
        const files = await fs.promises.readdir(this.historyDir);
        const sessions: ChatSession[] = [];
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const data = await fs.promises.readFile(path.join(this.historyDir, file), 'utf-8');
                sessions.push(JSON.parse(data) as ChatSession);
            } catch {}
        }
        return sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }

    async getChatSession(id: string): Promise<ChatSession | null> {
        const filePath = path.join(this.historyDir, `${id}.json`);
        if (!fs.existsSync(filePath)) return null;
        try {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(data) as ChatSession;
        } catch {
            return null;
        }
    }

    async readProjectFile(projectRoot: string, srcDir: string, relPath: string): Promise<string | null> {
        let fullPath;
        if (relPath.startsWith('src/')) {
            fullPath = path.resolve(projectRoot, relPath);
        } else {
            fullPath = path.resolve(srcDir, relPath);
        }
        // Security check
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(projectRoot)) return null;
        if (!fs.existsSync(resolved)) return null;
        try {
            return await fs.promises.readFile(resolved, 'utf-8');
        } catch {
            return null;
        }
    }

    async readAIMap(projectRoot: string): Promise<string | null> {
        const aiMapPath = path.join(projectRoot, 'AI_FILE_MAP.md');
        if (!fs.existsSync(aiMapPath)) return null;
        try {
            return await fs.promises.readFile(aiMapPath, 'utf-8');
        } catch {
            return null;
        }
    }
}
