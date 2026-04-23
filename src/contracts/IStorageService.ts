import { ProjectGraph, ChatSession } from '../domain/types';

export interface IStorageService {
    // Write
    saveGraphToToolDir(graph: ProjectGraph): Promise<void>;
    saveAIMapsToProject(projectRoot: string, fileDependenciesContent: string, aiMapContent: string): Promise<void>;
    saveChatSession(session: ChatSession): Promise<void>;
    deleteChatSession(id: string): Promise<void>;
    
    // Read
    loadGraphFromToolDir(): Promise<ProjectGraph | null>;
    getChatSessions(): Promise<ChatSession[]>;
    getChatSession(id: string): Promise<ChatSession | null>;
    readProjectFile(projectRoot: string, srcDir: string, fileId: string): Promise<string | null>;
    readAIMap(projectRoot: string): Promise<string | null>;
}
