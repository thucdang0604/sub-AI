import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { OllamaManagerService } from './OllamaManagerService.js';
import { CodeChunk, IChunker } from './Chunker/IChunker.js';
import { eventManager } from './EventManager.js';
import { NpuEmbeddingBridge } from './NpuEmbeddingBridge.js';
import { registerCosineSimilarity, initChunkTables } from './KBDatabase.js';

export interface SearchResult {
    chunk_id: string;
    file_path: string;
    symbol_name: string;
    code_content: string;
    summary: string;
    score: number;
}

export class LocalKnowledgeBaseService {
    private db: Database.Database;
    private ollama: OllamaManagerService;
    private chunker: IChunker;
    private rootDir: string;
    private cacheDir: string;
    private npuBridge: NpuEmbeddingBridge;

    constructor(rootDir: string, ollama: OllamaManagerService, chunker: IChunker) {
        this.rootDir = rootDir;
        this.ollama = ollama;
        this.chunker = chunker;
        this.npuBridge = NpuEmbeddingBridge.getInstance(rootDir);
        
        this.cacheDir = path.join(rootDir, '.ai_cache');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        
        this.autoGitIgnore();

        const dbPath = path.join(this.cacheDir, 'index.db');
        this.db = new Database(dbPath);
        
        this.initUDF();
        this.initTables();
    }

    private autoGitIgnore() {
        const gitignorePath = path.join(this.rootDir, '.gitignore');
        const ignoreEntry = '\n# AI Cache\n.ai_cache\n';
        
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            if (!content.includes('.ai_cache')) {
                fs.appendFileSync(gitignorePath, ignoreEntry);
            }
        } else {
            fs.writeFileSync(gitignorePath, ignoreEntry);
        }
    }

    private initUDF() {
        registerCosineSimilarity(this.db);
    }

    private initTables() {
        initChunkTables(this.db);
    }

    public async indexChunk(chunk: CodeChunk, modelName?: string) {
        // Kiểm tra xem chunk id đã tồn tại chưa (MD5 match)
        const stmt = this.db.prepare('SELECT id FROM chunks WHERE id = ?');
        const exists = stmt.get(chunk.id);
        
        if (exists) {
            // Đã tồn tại chunk chính xác giống hệt (MD5 trùng), không cần phân tích lại
            return;
        }

        try {
            // Tóm tắt bằng Ollama và lấy vector từ NPU
            const summaryResult = await this.ollama.generateSummary(chunk.code_content, modelName);
            const embedding = await this.npuBridge.getEmbedding(chunk.code_content, "document");

            const insert = this.db.prepare(`
                INSERT OR REPLACE INTO chunks 
                (id, file_path, symbol_name, start_line, end_line, code_content, dependencies, summary, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insert.run(
                chunk.id,
                chunk.file_path,
                chunk.symbol_name,
                chunk.start_line,
                chunk.end_line,
                chunk.code_content,
                JSON.stringify(chunk.dependencies),
                summaryResult.summary,
                JSON.stringify(embedding)
            );
        } catch (e: any) {
            eventManager.emitLog('warning', `[LKB] Bỏ qua chunk ${chunk.symbol_name} trong ${chunk.file_path} do lỗi AI: ${e.message}`);
        }
    }

    public async removeDeletedFiles(activeFilePaths: string[]) {
        // Lấy danh sách file path đang có trong db
        const rows = this.db.prepare('SELECT DISTINCT file_path FROM chunks').all() as any[];
        const dbFiles = rows.map(r => r.file_path);
        
        const deletedFiles = dbFiles.filter(f => !activeFilePaths.includes(f));
        
        if (deletedFiles.length > 0) {
            const stmt = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
            const deleteMany = this.db.transaction((files: string[]) => {
                for (const file of files) stmt.run(file);
            });
            deleteMany(deletedFiles);
            eventManager.emitLog('info', `[LKB] Đã dọn dẹp ${deletedFiles.length} file bị xóa.`);
        }
    }

    public deleteFileChunks(relativePath: string) {
        const stmt = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
        stmt.run(relativePath);
    }

    public vacuum() {
        this.db.exec('VACUUM');
    }

    public resetDatabase() {
        this.db.exec('DROP TABLE IF EXISTS chunks');
        this.db.exec('DROP TABLE IF EXISTS fts_chunks');
        this.initTables();
    }

    public getIndexStatus(): { isIndexed: boolean; chunkCount: number; lastUpdated: string | null } {
        try {
            const countRow = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any;
            const lastUpdatedRow = this.db.prepare('SELECT last_updated FROM chunks ORDER BY last_updated DESC LIMIT 1').get() as any;
            
            return {
                isIndexed: countRow.count > 0,
                chunkCount: countRow.count,
                lastUpdated: lastUpdatedRow ? lastUpdatedRow.last_updated : null
            };
        } catch (e) {
            return { isIndexed: false, chunkCount: 0, lastUpdated: null };
        }
    }

    /**
     * Tìm kiếm Hybrid (Keyword + Vector) kết hợp RRF
     */
    public async search(query: string, limit: number = 5): Promise<SearchResult[]> {
        const queryVector = await this.npuBridge.getEmbedding(query, "query");
        const vectorStr = JSON.stringify(queryVector);

        // Chuẩn bị các keyword cho FTS (xoá các ký tự đặc biệt)
        const cleanQuery = query.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(' ').filter(k => k.length > 2).join(' OR ');
        
        // 1. Lấy top K từ Vector Search
        const vectorSearch = this.db.prepare(`
            SELECT id, file_path, symbol_name, code_content, summary, 
                   cosine_similarity(embedding, ?) as similarity 
            FROM chunks 
            ORDER BY similarity DESC 
            LIMIT ?
        `).all(vectorStr, limit * 2) as any[];

        // 2. Lấy top K từ FTS Search
        let ftsSearch: any[] = [];
        if (cleanQuery.length > 0) {
            try {
                ftsSearch = this.db.prepare(`
                    SELECT c.id, c.file_path, c.symbol_name, c.code_content, c.summary, f.rank as bm25
                    FROM fts_chunks f
                    JOIN chunks c ON f.rowid = c.rowid
                    WHERE fts_chunks MATCH ?
                    ORDER BY bm25
                    LIMIT ?
                `).all(cleanQuery, limit * 2) as any[];
            } catch (e) {
                // Ignore FTS syntax errors
            }
        }

        // 3. RRF (Reciprocal Rank Fusion)
        const k = 60; // Hằng số cho RRF
        const rrfScores = new Map<string, any>();

        const addScore = (items: any[], isVector: boolean) => {
            items.forEach((item, index) => {
                const rank = index + 1;
                const score = 1 / (k + rank);
                
                if (!rrfScores.has(item.id)) {
                    rrfScores.set(item.id, {
                        ...item,
                        rrf_score: 0
                    });
                }
                
                const existing = rrfScores.get(item.id);
                existing.rrf_score += score;
            });
        };

        addScore(vectorSearch, true);
        addScore(ftsSearch, false);

        // Sắp xếp lại theo RRF score và lấy top limit
        const finalResults = Array.from(rrfScores.values())
            .sort((a, b) => b.rrf_score - a.rrf_score)
            .slice(0, limit);

        return finalResults.map(r => ({
            chunk_id: r.id,
            file_path: r.file_path,
            symbol_name: r.symbol_name,
            code_content: r.code_content,
            summary: r.summary,
            score: r.rrf_score
        }));
    }

    public getChunkById(id: string): SearchResult | null {
        const row = this.db.prepare('SELECT id, file_path, symbol_name, code_content, summary FROM chunks WHERE id = ?').get(id) as any;
        if (!row) return null;
        return {
            chunk_id: row.id,
            file_path: row.file_path,
            symbol_name: row.symbol_name,
            code_content: row.code_content,
            summary: row.summary,
            score: 1.0
        };
    }

    /**
     * Quét và lập chỉ mục toàn bộ dự án
     */
    public async indexProject(options: { modelName?: string, forceReset?: boolean } = {}) {
        if (options.forceReset) {
            this.resetDatabase();
        }

        const { IgnoreService } = await import('./Chunker/IgnoreService.js');
        const ignoreService = new IgnoreService(this.rootDir);
        const allFiles = this.getAllFiles(this.rootDir, ignoreService);

        eventManager.emitLog('info', `[LKB] Tìm thấy ${allFiles.length} files để lập chỉ mục.`);
        let processedCount = 0;
        let totalChunksCreated = 0;

        for (const filePath of allFiles) {
            console.log(`[LKB Debug] Processing file: ${filePath}`);
            const relativePath = path.relative(this.rootDir, filePath).replace(/\\/g, '/');
            console.log(`[LKB Debug] Chunking file: ${relativePath}`);
            const chunks = await this.chunker.chunkFile(filePath, relativePath);
            console.log(`[LKB Debug] Found ${chunks.length} total chunks for ${relativePath}`);
            
            // Xử lý batch cho NPU để tăng thông lượng (High Throughput)
            const newChunks = [];
            for (const chunk of chunks) {
                const stmt = this.db.prepare('SELECT id FROM chunks WHERE id = ?');
                if (!stmt.get(chunk.id)) {
                    newChunks.push(chunk);
                }
            }
            
            if (newChunks.length > 0) {
                totalChunksCreated += newChunks.length;
                console.log(`[LKB Debug] Found ${newChunks.length} new chunks to embed.`);
                try {
                    const codes = newChunks.map(c => c.code_content);
                    console.log(`[LKB Debug] Sending batch of ${codes.length} chunks to NPU Bridge...`);
                    const embeddings = await this.npuBridge.getEmbeddingsBatch(codes, 'document');
                    console.log(`[LKB Debug] NPU Bridge returned ${embeddings.length} embeddings.`);
                    
                    for (const [i, chunk] of newChunks.entries()) {
                        if (!chunk) continue;
                        
                        let summary = "";
                        try {
                            const summaryResult = await this.ollama.generateSummary(chunk.code_content, options.modelName);
                            summary = summaryResult.summary;
                        } catch (e: any) {
                            console.error(`Error generating summary for ${chunk.file_path}: ${e.message}`);
                        }
                        
                        const insert = this.db.prepare(`
                            INSERT OR REPLACE INTO chunks 
                            (id, file_path, symbol_name, start_line, end_line, code_content, dependencies, summary, embedding)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);

                        insert.run(
                            chunk.id,
                            chunk.file_path,
                            chunk.symbol_name,
                            chunk.start_line,
                            chunk.end_line,
                            chunk.code_content,
                            JSON.stringify(chunk.dependencies),
                            summary,
                            JSON.stringify(embeddings[i] || [])
                        );
                    }
                } catch (e: any) {
                    eventManager.emitLog('warning', `[LKB] Lỗi khi xử lý file ${filePath}: ${e.message}`);
                }
            }
            
            processedCount++;
            eventManager.emitProgress('Indexing Projects', processedCount, allFiles.length, `[LKB] Đã xử lý ${processedCount}/${allFiles.length} files...`);
        }
        
        eventManager.emitLog('info', `[LKB] Đã lập chỉ mục xong. Dọn dẹp files thừa...`);
        const relativeActiveFiles = allFiles.map(f => path.relative(this.rootDir, f).replace(/\\/g, '/'));
        await this.removeDeletedFiles(relativeActiveFiles);
        this.vacuum();
        eventManager.emitLog('success', `[LKB] Hoàn tất!`);
        
        return {
            totalFilesProcessed: processedCount,
            totalChunksCreated
        };
    }

    private getAllFiles(dirPath: string, ignoreService: any, arrayOfFiles: string[] = []): string[] {
        const files = fs.readdirSync(dirPath);

        files.forEach((file) => {
            const absolutePath = path.join(dirPath, file);
            const relativePath = path.relative(this.rootDir, absolutePath).replace(/\\/g, '/');

            // Skip ignored files/directories early
            if (ignoreService.isIgnored(relativePath)) {
                return;
            }

            if (fs.statSync(absolutePath).isDirectory()) {
                arrayOfFiles = this.getAllFiles(absolutePath, ignoreService, arrayOfFiles);
            } else {
                // Chỉ lập chỉ mục các file code
                if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
                    arrayOfFiles.push(absolutePath);
                }
            }
        });

        return arrayOfFiles;
    }

    /**
     * Trích xuất tóm tắt từ RAG index cho mỗi file: số chunks, symbols, summaries.
     * Dùng để bơm context thực vào AI Audit prompt.
     */
    public getFileInsights(): Array<{ file_path: string; chunks: number; symbols: string[]; summaries: string[] }> {
        try {
            const rows = this.db.prepare(`
                SELECT file_path, symbol_name, summary
                FROM chunks
                ORDER BY file_path, start_line
            `).all() as Array<{ file_path: string; symbol_name: string; summary: string }>;

            const grouped: Record<string, { chunks: number; symbols: string[]; summaries: string[] }> = {};
            for (const row of rows) {
                if (!grouped[row.file_path]) {
                    grouped[row.file_path] = { chunks: 0, symbols: [], summaries: [] };
                }
                const g = grouped[row.file_path]!;
                g.chunks++;
                if (row.symbol_name && !g.symbols.includes(row.symbol_name)) {
                    g.symbols.push(row.symbol_name);
                }
                if (row.summary && g.summaries.length < 3) { // giới hạn 3 summary/file
                    g.summaries.push(row.summary.substring(0, 200));
                }
            }

            return Object.entries(grouped).map(([file_path, data]) => ({
                file_path,
                ...data
            }));
        } catch {
            return [];
        }
    }

    /** Kiểm tra DB có dữ liệu index chưa */
    public hasIndexedData(): boolean {
        try {
            const row = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any;
            return (row?.count || 0) > 0;
        } catch {
            return false;
        }
    }
}
