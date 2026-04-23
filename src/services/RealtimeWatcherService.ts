import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { LocalKnowledgeBaseService } from './LocalKnowledgeBaseService.js';
import { IChunker } from './Chunker/IChunker.js';

export class RealtimeWatcherService {
    private watcher: FSWatcher;
    private lkb: LocalKnowledgeBaseService;
    private chunker: IChunker;
    private rootDir: string;
    private ignoreService: any;

    constructor(rootDir: string, lkb: LocalKnowledgeBaseService, chunker: IChunker, ignoreService: any) {
        this.rootDir = rootDir;
        this.lkb = lkb;
        this.chunker = chunker;
        this.ignoreService = ignoreService;

        // Bỏ qua node_modules, .git, .ai_cache
        this.watcher = chokidar.watch(rootDir, {
            ignored: (filePath: string) => {
                const relative = path.relative(this.rootDir, filePath).replace(/\\/g, '/');
                if (relative === '') return false;
                if (relative.startsWith('.git') || relative.startsWith('node_modules') || relative.startsWith('.ai_cache')) return true;
                return this.ignoreService.isIgnored(relative);
            },
            persistent: true,
            ignoreInitial: true // Chỉ theo dõi thay đổi sau khi khởi động
        });

        this.setupListeners();
        console.log(`[Watcher] Đang theo dõi thay đổi tại: ${rootDir}`);
    }

    private setupListeners() {
        this.watcher
            .on('add', (filePath: string) => this.handleFileChange(filePath, 'add'))
            .on('change', (filePath: string) => this.handleFileChange(filePath, 'change'))
            .on('unlink', (filePath: string) => this.handleFileDelete(filePath));
    }

    private async handleFileChange(filePath: string, event: string) {
        if (!this.isCodeFile(filePath)) return;

        console.log(`[Watcher] Phát hiện thay đổi (${event}): ${filePath}. Đang lập chỉ mục...`);
        const relativePath = path.relative(this.rootDir, filePath).replace(/\\/g, '/');
        
        try {
            const chunks = await this.chunker.chunkFile(filePath, relativePath);
            // Xóa các chunk cũ của file này
            this.lkb.deleteFileChunks(relativePath);
            
            for (const chunk of chunks) {
                await this.lkb.indexChunk(chunk);
            }
            console.log(`[Watcher] Đã cập nhật ${chunks.length} chunks cho ${relativePath}`);
        } catch (error) {
            console.error(`[Watcher] Lỗi khi lập chỉ mục ${relativePath}:`, error);
        }
    }

    private handleFileDelete(filePath: string) {
        if (!this.isCodeFile(filePath)) return;
        
        console.log(`[Watcher] Phát hiện file bị xóa: ${filePath}`);
        const relativePath = path.relative(this.rootDir, filePath).replace(/\\/g, '/');
        this.lkb.deleteFileChunks(relativePath);
    }

    private isCodeFile(filePath: string): boolean {
        return filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx');
    }

    public stop() {
        this.watcher.close();
    }
}
