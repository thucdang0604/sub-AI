import { IExtension, IExtensionContext, McpToolDeclaration } from '../core/interfaces/IExtension.js';
import { IRouter } from '../core/interfaces/IRouter.js';
import { OllamaManagerService } from '../services/OllamaManagerService.js';
import { TypescriptChunker } from '../services/Chunker/TypescriptChunker.js';
import { LocalKnowledgeBaseService } from '../services/LocalKnowledgeBaseService.js';
import { eventBus } from '../core/EventBus.js';

export class RagExtension implements IExtension {
  name = 'RagExtension';
  version = '1.0.0';

  private getLKB(targetDir: string) {
    const ollama = new OllamaManagerService();
    const chunker = new TypescriptChunker();
    return new LocalKnowledgeBaseService(targetDir, ollama, chunker);
  }

  async initialize(context: IExtensionContext): Promise<void> {
    console.log(`[RagExtension] Initialized`);
  }

  registerRoutes(router: IRouter): void {
    router.post('/api/rag/index', async (req, res, body) => {
        if (!body || !body.targetDir) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing targetDir' }));
            return;
        }
        
        try {
            const kb = this.getLKB(body.targetDir);
            
            // Fire-and-forget so we stream progress to UI via SSE
            kb.indexProject({ forceReset: body.forceReset || false, modelName: body.model }).catch((e: any) => {
                eventBus.emitLog('error', 'Lỗi trong quá trình index project: ' + e.message);
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'Started indexing' }));
        } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });

    router.post('/api/rag/status', async (req, res, body) => {
        if (!body || !body.targetDir) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing targetDir' }));
            return;
        }
        
        try {
            const kb = this.getLKB(body.targetDir);
            const status = kb.getIndexStatus();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
        } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });

    router.post('/api/rag/search', async (req, res, body) => {
        if (!body || !body.targetDir || !body.query) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing targetDir or query' }));
            return;
        }
        
        try {
            const kb = this.getLKB(body.targetDir);
            const results = await kb.search(body.query, body.limit || 5);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ results }));
        } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
  }

  registerMcpTools(): McpToolDeclaration[] {
    return [
        {
            declaration: {
                name: "index_codebase",
                description: "Khởi tạo hệ thống RAG cục bộ, quét toàn bộ dự án để băm và sinh embeddings cho các file mã nguồn.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: { type: "string", description: "Đường dẫn tuyệt đối đến thư mục chứa dự án." },
                        force_reindex: { type: "boolean", description: "Xóa sạch CSDL và quét lại toàn bộ nếu là true." }
                    },
                    required: ["targetDir"]
                }
            },
            handler: async (args: any) => {
                const { targetDir, force_reindex } = args;
                if (!targetDir) {
                    throw new Error("Missing targetDir argument");
                }
                
                try {
                    const ollama = new OllamaManagerService();
                    const isRunning = await ollama.isOllamaRunning();
                    if (!isRunning) {
                        throw new Error(`[OLLAMA ERROR] Ollama is not running! Vui lòng khởi động phần mềm Ollama trên máy tính của bạn trước khi index.`);
                    }
                    
                    const kb = this.getLKB(targetDir);
                    const stats = await kb.indexProject({ forceReset: force_reindex === true });
                    
                    return {
                        content: [{ 
                            type: "text", 
                            text: `Hoàn tất index. Đã xử lý ${stats?.totalFilesProcessed} files, tạo ra ${stats?.totalChunksCreated} chunks.` 
                        }]
                    };
                } catch (e: any) {
                    return { isError: true, content: [{ type: "text", text: e.message }] };
                }
            }
        },
        {
            declaration: {
                name: "semantic_search_code",
                description: "Tìm kiếm ngữ nghĩa trong mã nguồn (kết hợp vector + keyword search) dựa trên nội dung hàm, class, hoặc biến.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: { type: "string" },
                        query: { type: "string", description: "Truy vấn, ví dụ: 'Hàm xử lý đơn hàng' hoặc 'Authentication middleware'." },
                        limit: { type: "number", description: "Số lượng kết quả tối đa trả về, mặc định 5." }
                    },
                    required: ["targetDir", "query"]
                }
            },
            handler: async (args: any) => {
                const { targetDir, query, limit } = args;
                if (!targetDir || !query) {
                    throw new Error("Missing targetDir or query argument");
                }
                try {
                    const kb = this.getLKB(targetDir);
                    const results = await kb.search(query, limit || 5);
                    return {
                        content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
                    };
                } catch (e: any) {
                    return { isError: true, content: [{ type: "text", text: e.message }] };
                }
            }
        },
        {
            declaration: {
                name: "get_micro_context",
                description: "Lấy chính xác nội dung của một code chunk dựa vào chunk_id do RAG trả về.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: { type: "string" },
                        chunk_id: { type: "string" }
                    },
                    required: ["targetDir", "chunk_id"]
                }
            },
            handler: async (args: any) => {
                const { targetDir, chunk_id } = args;
                if (!targetDir || !chunk_id) {
                    throw new Error("Missing targetDir or chunk_id argument");
                }
                try {
                    const kb = this.getLKB(targetDir);
                    const chunk = kb.getChunkById(chunk_id);
                    if (!chunk) throw new Error('Chunk not found');
                    return {
                        content: [{ type: "text", text: chunk.code_content }]
                    };
                } catch (e: any) {
                    return { isError: true, content: [{ type: "text", text: e.message }] };
                }
            }
        }
    ];
  }
}
