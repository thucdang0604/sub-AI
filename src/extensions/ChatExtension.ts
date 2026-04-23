import { IExtension, IExtensionContext, McpToolDeclaration } from '../core/interfaces/IExtension.js';
import { IRouter } from '../core/interfaces/IRouter.js';
import { StorageService } from '../services/StorageService.js';
import { LLMProviderFactory } from '../services/LLMProviderFactory.js';
import { OllamaManagerService } from '../services/OllamaManagerService.js';
import { LocalKnowledgeBaseService } from '../services/LocalKnowledgeBaseService.js';
import { TypescriptChunker } from '../services/Chunker/TypescriptChunker.js';
import { PromptService } from '../services/PromptService.js';
import * as path from 'path';
import * as fs from 'fs';

interface AIRequestBody {
    prompt?: string;
    model: string;
    fileId?: string;
    fileIds?: string[];
    action?: 'chat' | 'summarize' | 'impact' | 'health' | 'what-to-edit' | 'evaluate-features' | 'analyze-feature' | 'audit';
    featureId?: string;
}

export class ChatExtension implements IExtension {
    name = 'ChatExtension';
    version = '1.0.0';

    private storage!: StorageService;

    async initialize(context: IExtensionContext): Promise<void> {
        this.storage = context.storageService;
        console.log(`[ChatExtension] Initialized`);
    }

    private getSystemPrompt(): string {
        return PromptService.getSystemPrompt();
    }

    private getSystemGuideMarkdown(): string {
        return `# 📖 Hướng dẫn Sử dụng Sub-AI — Hệ thống Phân tích Kiến trúc Thông minh

## 🎯 Tổng quan
Sub-AI là một hệ thống AI cục bộ hỗ trợ phân tích kiến trúc mã nguồn, tìm kiếm ngữ nghĩa (Semantic Search),
đánh giá sức khoẻ dự án, và đề xuất cải tiến — tất cả chạy hoàn toàn trên máy của bạn, tận dụng **Intel NPU** và **Ollama**.

---

## 🖥️ Giao diện Dashboard (Web UI)

Dashboard được chia thành **6 tab chính** ở sidebar bên phải:

### 1. 💬 Tab Trò chuyện (Chat)
- **Mục đích:** Tương tác trực tiếp với AI về kiến trúc dự án
- **Cách dùng:**
  - Nhập câu hỏi vào ô chat, ví dụ: \`"Giải thích file Server.ts làm gì?"\`
  - **Click node** trên đồ thị → chọn hành động: Tóm tắt, Phân tích ảnh hưởng, Audit
  - **Shift+Click** để chọn nhiều node cùng lúc
- **Lịch sử:** Bấm icon ⏳ để xem và khôi phục các phiên chat cũ

### 2. 🗄️ Tab RAG (Knowledge Base)
- **Mục đích:** Quản lý cơ sở dữ liệu vector cục bộ
- **Các bước:**
  1. Phân tích dự án trước (nhập đường dẫn → bấm Phân tích)
  2. Bấm **"Index Project"** để bắt đầu quét và sinh embeddings
  3. Theo dõi tiến trình qua **thanh progress bar** và **activity logs** realtime
  4. Sau khi index xong, nhập câu hỏi ở ô tìm kiếm, ví dụ: \`"Hàm xử lý authentication"\`
- **Chi tiết kỹ thuật:**
  - Embeddings: \`bge-m3-openvino\` (1024 chiều) chạy trên **Intel NPU**
  - Tóm tắt code: Ollama LLM (model tùy chọn)
  - Tìm kiếm: Hybrid (Vector + Full-Text Search) kết hợp thuật toán RRF

### 3. 📊 Tab Tính năng (Features)
- **Mục đích:** Nhóm các file theo feature/chức năng
- **Cách dùng:**
  - Bấm **"Đánh giá Tính năng"** để AI phân nhóm và đánh giá toàn bộ
  - Click **"🔍 Phân tích"** trên từng cụm feature để xem chi tiết
  - Chuyển chế độ hiển thị đồ thị: Force / Architecture / Features
  - Xuất báo cáo dạng Markdown bằng nút Export

### 4. 🏥 Tab Sức khoẻ (Health)
- **Mục đích:** Dashboard chẩn đoán sức khoẻ kiến trúc
- **Các chỉ số:**
  | Chỉ số | Mô tả | Ngưỡng cảnh báo |
  |--------|--------|-----------------|
  | ⚠ God Files | File quá lớn, quá nhiều dependency | >500 dòng VÀ >5 importers |
  | ⚡ High Fan-out | File import quá nhiều file khác | >10 imports |
  | 💀 Dead Exports | Export không ai sử dụng | 0 importers |
  | 🔗 File Mồ Côi | Không được import, không phải entry | Không có liên kết |
  | 🔄 Circular Deps | Dependency vòng tròn (A→B→A) | Bất kỳ |
- **🤖 AI Audit:** Bấm **"Bắt đầu AI Audit"** để AI đưa ra kế hoạch refactoring ưu tiên

### 5. ⚙️ Tab Cài đặt (Settings)
- **Chọn Model AI:** Dropdown hiển thị tất cả model Ollama/OpenAI/Gemini khả dụng
- **API Keys:** Nhập OpenAI hoặc Gemini API key (tuỳ chọn)
- **Cấu hình vật lý đồ thị:** Điều chỉnh khoảng cách cụm, lực đẩy, lực hút

### 6. 📖 Tab Hướng dẫn (Tab này)
- Hiển thị tài liệu hướng dẫn sử dụng chi tiết

---

## 🔧 Tích hợp MCP (Model Context Protocol)

Sub-AI cung cấp **8 MCP tools** cho các AI agent bên ngoài (Gemini, Cursor, etc.):

| Tool | Mô tả |
|------|--------|
| \`analyze_project\` | Phân tích kiến trúc, tạo AI_FILE_MAP.md |
| \`get_ai_file_map\` | Đọc bản đồ kiến trúc đã tạo |
| \`get_file_impact\` | Phân tích ảnh hưởng của 1 file cụ thể |
| \`get_health_report\` | Lấy báo cáo sức khoẻ toàn diện |
| \`index_codebase\` | Khởi tạo RAG — quét và sinh embeddings |
| \`semantic_search_code\` | Tìm kiếm ngữ nghĩa trong codebase |
| \`get_micro_context\` | Lấy nội dung chi tiết 1 code chunk |
| \`get_project_guidelines\` | Đọc các file quy ước dự án |
| \`get_system_guide\` | Đọc hướng dẫn sử dụng hệ thống |

---

## ⚡ Kiến trúc Hệ thống

\`\`\`
┌──────────────────────────────────────────────────┐
│                 Web Dashboard (Vue 3)            │
│  Chat │ RAG │ Features │ Health │ Settings │ Guide│
└──────────┬───────────────────────────────────────┘
           │ REST API + SSE
┌──────────▼───────────────────────────────────────┐
│              Node.js Server (Server.ts)          │
│  ┌─────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │ Ollama  │ │ NPU Bridge   │ │ Graph Analyzer│ │
│  │ Manager │ │ (bge-m3-ov)  │ │ (TypeScript)  │ │
│  └────┬────┘ └──────┬───────┘ └───────┬───────┘ │
│       │             │                 │         │
│  ┌────▼────────────▼─────────────────▼───────┐ │
│  │     LocalKnowledgeBaseService (RAG)        │ │
│  │  SQLite + sqlite-vec │ FTS5 │ Hybrid RRF   │ │
│  └───────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
           │ stdio JSON
┌──────────▼───────────────────────────────────────┐
│           MCP Server (McpServer.ts)              │
│        Kết nối với Gemini / Cursor / v.v.        │
└──────────────────────────────────────────────────┘
\`\`\`

---

## 🚀 Khởi động Nhanh

1. **Đảm bảo Ollama đang chạy** trên máy (mặc định port 11434)
2. Chạy \`npm run start\` trong thư mục Sub-AI
3. Mở trình duyệt tại \`http://localhost:3000\`
4. Nhập đường dẫn dự án → Bấm **Phân tích**
5. Bấm **Index Project** để tạo vector database
6. Bắt đầu tương tác: Chat, Search, Audit!

> **Lưu ý:** Lần đầu index sẽ mất vài phút tuỳ kích thước dự án. Các lần sau sẽ nhanh hơn nhờ cache MD5.
`;
    }

    registerRoutes(router: IRouter): void {
        const jsonResponse = (res: any, status: number, data: any) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        };

        // API Guide
        router.get('/api/guide', async (req, res) => {
            const guideMarkdown = this.getSystemGuideMarkdown();
            return jsonResponse(res, 200, { content: guideMarkdown });
        });

        // API Models
        router.get('/api/ai/models', async (req, res) => {
            const ollama = LLMProviderFactory.getProvider('ollama');
            const openai = LLMProviderFactory.getProvider('openai');
            const gemini = LLMProviderFactory.getProvider('gemini');
            const modelsArrays = await Promise.all([
                ollama.getModels().catch(() => []),
                openai.getModels().catch(() => []),
                gemini.getModels().catch(() => []),
            ]);
            const models = modelsArrays.flat();
            return jsonResponse(res, 200, { models });
        });

        // Chat History GET List
        router.get('/api/ai/history', async (req, res) => {
            const sessions = await this.storage.getChatSessions();
            return jsonResponse(res, 200, { sessions });
        });

        // Chat History GET Single
        router.get('/api/ai/history/:id', async (req, res) => {
            const id = req.url?.split('/api/ai/history/')[1] || '';
            const session = await this.storage.getChatSession(id);
            if (!session) return jsonResponse(res, 404, { error: 'Session not found' });
            return jsonResponse(res, 200, session);
        });

        // Chat History POST
        router.post('/api/ai/history', async (req, res, body) => {
            if (!body || !body.id) return jsonResponse(res, 400, { error: 'Missing session id' });
            
            body.updatedAt = new Date().toISOString();
            if (!body.createdAt) body.createdAt = body.updatedAt;
            
            await this.storage.saveChatSession(body);
            return jsonResponse(res, 200, { ok: true, id: body.id });
        });

        // Chat History DELETE
        router.delete('/api/ai/history/:id', async (req, res) => {
            const id = req.url?.split('/api/ai/history/')[1] || '';
            await this.storage.deleteChatSession(id);
            return jsonResponse(res, 200, { ok: true });
        });

        // Read File Content
        router.post('/api/ai/read-file', async (req, res, body) => {
            const graph = await this.storage.loadGraphFromToolDir();
            if (!graph) return jsonResponse(res, 400, { error: 'No graph loaded' });

            const content = await this.storage.readProjectFile(graph.projectRoot, graph.srcDir, body.fileId);
            if (content === null) return jsonResponse(res, 404, { error: `File not found: ${body.fileId}` });

            return jsonResponse(res, 200, { fileId: body.fileId, content, lines: content.split('\n').length });
        });

        // API Audit Recommendation
        router.post('/api/audit/recommend', async (req, res, body) => {
            if (!body || !body.model) return jsonResponse(res, 400, { error: 'Missing model' });
            
            try {
                const graph = await this.storage.loadGraphFromToolDir();
                if (!graph) return jsonResponse(res, 400, { error: 'Chưa phân tích dự án. Hãy bấm "Phân tích" trước.' });

                // --- Thu thập dữ liệu định lượng ---
                const totalFiles = graph.nodes.length;
                const totalEdges = graph.edges.length;
                const totalLines = graph.nodes.reduce((sum, n) => sum + (n.lines || 0), 0);

                let fileMetrics = `| File | Lines | Imports | Imported By | Category | Complexity |\n`;
                fileMetrics += `|---|---|---|---|---|---|\n`;

                const importersMap: Record<string, number> = {};
                const importedByMap: Record<string, number> = {};
                graph.edges.forEach(e => {
                    const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
                    const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
                    importersMap[src] = (importersMap[src] || 0) + 1;
                    importedByMap[tgt] = (importedByMap[tgt] || 0) + 1;
                });

                graph.nodes.sort((a, b) => (b.lines || 0) - (a.lines || 0)).forEach(n => {
                    const imports = importersMap[n.id] || 0;
                    const importedBy = importedByMap[n.id] || 0;
                    let complexity = 'Low';
                    if ((n.lines || 0) > 300 || imports > 10 || importedBy > 20) complexity = 'High';
                    else if ((n.lines || 0) > 150 || imports > 5 || importedBy > 10) complexity = 'Medium';
                    
                    fileMetrics += `| \`${n.id}\` | ${n.lines || 0} | ${imports} | ${importedBy} | ${n.category || 'N/A'} | ${complexity} |\n`;
                });

                const orphans = graph.nodes.filter(n => !(importersMap[n.id] || 0) && !(importedByMap[n.id] || 0) && !n.id.includes('index') && !n.id.includes('main'));
                
                // Thu thập health summary từ GraphAnalyzerService (giả lập ở đây)
                let healthSummary = '';
                const godFiles = graph.nodes.filter(n => (n.lines || 0) > 500 && (importedByMap[n.id] || 0) > 5);
                const highFanOut = Object.entries(importersMap).filter(([k, v]) => v > 15).map(e => e[0]);
                const deadExports = graph.nodes.filter(n => (importedByMap[n.id] || 0) === 0 && !n.id.includes('index') && !n.id.includes('main'));
                const circularEdges = graph.edges.filter(e1 => graph.edges.some(e2 => e2.source === e1.target && e2.target === e1.source));

                healthSummary += `## Health Diagnostics\n`;
                healthSummary += `- **God Files**: ${godFiles.length} files\n`;
                healthSummary += `- **High Fan-out (>15 imports)**: ${highFanOut.length} files\n`;
                healthSummary += `- **Potential Dead Exports**: ${deadExports.length} files\n`;
                healthSummary += `- **Circular Dependencies**: ${circularEdges.length} pairs\n`;

                // --- Thu thập ngữ cảnh dự án (package.json, README, cấu trúc thư mục) ---
                let projectIdentity = '';
                try {
                    const pkgPath = path.join(graph.projectRoot, 'package.json');
                    if (fs.existsSync(pkgPath)) {
                        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                        projectIdentity += `## Thông tin Dự án (package.json)\n`;
                        projectIdentity += `- **Tên:** ${pkg.name || 'N/A'}\n`;
                        projectIdentity += `- **Mô tả:** ${pkg.description || 'Không có'}\n`;
                        projectIdentity += `- **Version:** ${pkg.version || 'N/A'}\n`;
                        if (pkg.scripts) {
                            projectIdentity += `- **Scripts:** ${Object.keys(pkg.scripts).join(', ')}\n`;
                        }
                        const deps = Object.keys(pkg.dependencies || {});
                        const devDeps = Object.keys(pkg.devDependencies || {});
                        if (deps.length > 0) projectIdentity += `- **Dependencies chính:** ${deps.join(', ')}\n`;
                        if (devDeps.length > 0) projectIdentity += `- **DevDependencies:** ${devDeps.join(', ')}\n`;
                        projectIdentity += '\n';
                    }
                } catch { /* bỏ qua */ }

                let readmeExcerpt = '';
                try {
                    const readmePaths = ['README.md', 'readme.md', 'README.MD'];
                    for (const rp of readmePaths) {
                        const fullP = path.join(graph.projectRoot, rp);
                        if (fs.existsSync(fullP)) {
                            const content = fs.readFileSync(fullP, 'utf-8');
                            readmeExcerpt = `## README (trích)\n${content.substring(0, 1500)}\n\n`;
                            break;
                        }
                    }
                } catch { /* bỏ qua */ }

                let folderStructure = '';
                try {
                    const listDir = (dir: string, prefix: string, depth: number): string => {
                        if (depth > 2) return '';
                        let result = '';
                        const items = fs.readdirSync(dir).filter(f => 
                            !['node_modules', '.git', '.ai_cache', 'dist', '.next', '.nuxt', 'coverage', '.firebase'].includes(f)
                        ).sort();
                        for (const item of items) {
                            const full = path.join(dir, item);
                            const stat = fs.statSync(full);
                            if (stat.isDirectory()) {
                                result += `${prefix}📁 ${item}/\n`;
                                result += listDir(full, prefix + '  ', depth + 1);
                            } else if (depth <= 1) {
                                result += `${prefix}📄 ${item}\n`;
                            }
                        }
                        return result;
                    };
                    folderStructure = `## Cấu trúc Thư mục\n\`\`\`\n${listDir(graph.projectRoot, '', 0)}\`\`\`\n\n`;
                } catch { /* bỏ qua */ }

                let keyExports = '';
                const significantExports = graph.nodes
                    .filter(n => n.exports && n.exports.length > 0)
                    .map(n => ({
                        file: n.id,
                        exports: n.exports!.map(e => `${e.type} ${e.name}`)
                    }));
                if (significantExports.length > 0) {
                    keyExports = `## Exports chính (class/function/interface)\n`;
                    for (const se of significantExports) {
                        keyExports += `- **${se.file}**: ${se.exports.join(', ')}\n`;
                    }
                    keyExports += '\n';
                }

                let ragInsights = '';
                try {
                    const chunker = new TypescriptChunker();
                    const ollamaManager = new OllamaManagerService();
                    const lkb = new LocalKnowledgeBaseService(graph.projectRoot, ollamaManager, chunker);
                    if (lkb.hasIndexedData()) {
                        const insights = lkb.getFileInsights();
                        if (insights.length > 0) {
                            ragInsights = `\n## Mô tả chức năng từng file (RAG Index)\n`;
                            for (const fi of insights) {
                                ragInsights += `\n### ${fi.file_path} (${fi.chunks} chunks, symbols: ${fi.symbols.join(', ') || 'N/A'})\n`;
                                for (const summary of fi.summaries) {
                                    ragInsights += `- ${summary}\n`;
                                }
                            }
                        }
                    }
                } catch (ragErr) {
                    // RAG chưa sẵn sàng — bỏ qua
                }

                const systemPrompt = PromptService.getAuditRecommendSystemPrompt(
                    totalFiles,
                    totalLines,
                    totalEdges,
                    circularEdges.length,
                    orphans.length,
                    projectIdentity,
                    readmeExcerpt,
                    folderStructure,
                    keyExports,
                    fileMetrics,
                    healthSummary,
                    ragInsights
                );

                const provider = LLMProviderFactory.getProviderForModel(body.model);
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                });

                const stream = await provider.streamGenerate(body.model, "Phân tích kiến trúc và đề xuất cải tiến dựa trên dữ liệu thực", systemPrompt);
                for await (const chunk of stream) {
                    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
                }
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                res.end();
                return;
            } catch (err: any) {
                console.error('Audit recommend error:', err);
                jsonResponse(res, 500, { error: err.message || 'Audit recommend failed' });
                return;
            }
        });

        // AI Generation Stream
        router.post('/api/ai', async (req, res, body) => {
            const bodyParsed = body as AIRequestBody;
            if (!bodyParsed.model) return jsonResponse(res, 400, { error: 'No model selected' });

            const graph = await this.storage.loadGraphFromToolDir();
            let fullPrompt = '';
            const systemPrompt = this.getSystemPrompt();

            switch (bodyParsed.action) {
                case 'summarize': {
                    const fileId = bodyParsed.fileId || (bodyParsed.fileIds && bodyParsed.fileIds[0]);
                    if (!graph || !fileId) return jsonResponse(res, 400, { error: 'Missing fileId/graph' });
                    const content = await this.storage.readProjectFile(graph.projectRoot, graph.srcDir, fileId);
                    if (!content) return jsonResponse(res, 404, { error: 'File not found' });
                    const imports = graph.edges.filter(e => e.source === fileId).map(e => e.target);
                    const importedBy = graph.edges.filter(e => e.target === fileId).map(e => e.source);
                    fullPrompt = PromptService.getSummarizePrompt(fileId, imports, importedBy, content);
                    break;
                }
                case 'impact': {
                    const fileId = bodyParsed.fileId || (bodyParsed.fileIds && bodyParsed.fileIds[0]);
                    if (!fileId) return jsonResponse(res, 400, { error: 'Missing fileId' });
                    
                    let importedBy: string[] = [];
                    let transitive: string[] = [];

                    if (graph) {
                        importedBy = graph.edges.filter(e => e.target === fileId).map(e => e.source);
                        
                        // compute transitive impact (blast radius)
                        const importedByMap: Record<string, string[]> = {};
                        for (const link of graph.edges) {
                            const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
                            const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
                            if (!importedByMap[targetId]) importedByMap[targetId] = [];
                            importedByMap[targetId].push(sourceId);
                        }
                        
                        const visited = new Set<string>();
                        const queue = [fileId];
                        while (queue.length > 0) {
                            const curr = queue.shift()!;
                            if (!visited.has(curr)) {
                                visited.add(curr);
                                const imps = importedByMap[curr] || [];
                                for (const imp of imps) {
                                    if (!visited.has(imp)) queue.push(imp);
                                }
                            }
                        }
                        visited.delete(fileId);
                        transitive = Array.from(visited);
                    }

                    fullPrompt = PromptService.getImpactPrompt(fileId, importedBy.length, transitive.length);
                    break;
                }
                case 'health': {
                    const aiMapContent = (graph ? await this.storage.readAIMap(graph.projectRoot) : null) || '(No Map)';
                    fullPrompt = PromptService.getHealthPrompt(aiMapContent);
                    break;
                }
                case 'chat': {
                    if (!bodyParsed.prompt) return jsonResponse(res, 400, { error: 'No prompt' });
                    let fileContext = '';
                    const idsToLoad = bodyParsed.fileIds && bodyParsed.fileIds.length > 0 ? bodyParsed.fileIds : (bodyParsed.fileId ? [bodyParsed.fileId] : []);
                    
                    if (idsToLoad.length > 0 && graph) {
                        for (const id of idsToLoad) {
                            const content = await this.storage.readProjectFile(graph.projectRoot, graph.srcDir, id);
                            if (content) {
                                fileContext += `\nContext File \`${id}\`:\n\`\`\`\n${content.slice(0,6000)}\n\`\`\`\n`;
                            }
                        }
                    }
                    fullPrompt = `${bodyParsed.prompt}${fileContext}`;
                    break;
                }
                case 'what-to-edit': {
                    if (!bodyParsed.prompt) return jsonResponse(res, 400, { error: 'No prompt' });
                    const aiMapContent = (graph ? await this.storage.readAIMap(graph.projectRoot) : null) || '(No Map)';
                    fullPrompt = PromptService.getWhatToEditPrompt(aiMapContent, bodyParsed.prompt);
                    break;
                }
                case 'evaluate-features': {
                    const aiMapContent = (graph ? await this.storage.readAIMap(graph.projectRoot) : null) || '(No Map)';
                    fullPrompt = PromptService.getEvaluateFeaturesPrompt(aiMapContent);
                    break;
                }
                case 'analyze-feature': {
                    if (!graph || !bodyParsed.featureId) {
                        return jsonResponse(res, 400, { error: 'Missing featureId or graph' });
                    }
                    const cluster = graph.features?.find((f: any) => f.id === bodyParsed.featureId);
                    if (!cluster) {
                        return jsonResponse(res, 404, { error: 'Feature cluster not found' });
                    }

                    let sourceContext = '';
                    let totalChars = 0;
                    for (const fileId of cluster.files) {
                        const content = await this.storage.readProjectFile(graph.projectRoot, graph.srcDir, fileId);
                        if (content) {
                            sourceContext += `\n### File: \`${fileId}\`\n\`\`\`\n${content}\n\`\`\`\n`;
                            totalChars += content.length;
                        }
                    }

                    const estimatedTokens = Math.ceil(totalChars / 4);

                    fullPrompt = PromptService.getAnalyzeFeaturePrompt(cluster.name, cluster.files.length, estimatedTokens, cluster.entryPoints, cluster.sharedFiles, sourceContext);
                    break;
                }
                case 'audit': {
                    const auditFileIds = bodyParsed.fileIds || (bodyParsed.fileId ? [bodyParsed.fileId] : []);
                    if (!graph || auditFileIds.length === 0) {
                        return jsonResponse(res, 400, { error: 'Missing files or graph for audit' });
                    }

                    let auditContext = '';
                    let auditTotalChars = 0;
                    for (const fid of auditFileIds) {
                        const content = await this.storage.readProjectFile(graph.projectRoot, graph.srcDir, fid);
                        if (content) {
                            const imports = graph.edges.filter(e => e.source === fid).map(e => e.target);
                            const importedBy = graph.edges.filter(e => e.target === fid).map(e => e.source);
                            auditContext += `\n### File: \`${fid}\`\n**Imports**: ${imports.join(', ') || 'none'}\n**Imported by**: ${importedBy.join(', ') || 'none'}\n\`\`\`\n${content.slice(0, 10000)}\n\`\`\`\n`;
                            auditTotalChars += content.length;
                        }
                    }

                    if (!auditContext) {
                        return jsonResponse(res, 404, { error: 'Could not read any of the specified files' });
                    }

                    const nodeInfo = auditFileIds.map(fid => {
                        const node = graph!.nodes.find(n => n.id === fid);
                        if (!node) return '';
                        const warns = node.warnings?.map((w: any) => `${w.severity}: ${w.message}`).join(', ') || 'none';
                        return `- \`${fid}\`: ${node.category}, ${node.lines} lines, warnings=[${warns}]`;
                    }).filter(Boolean).join('\n');

                    fullPrompt = PromptService.getAuditPrompt(nodeInfo, auditContext);
                    break;
                }
            }

            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });

            try {
                const provider = LLMProviderFactory.getProviderForModel(bodyParsed.model);
                const stream = provider.streamGenerate(bodyParsed.model, fullPrompt, systemPrompt);
                for await (const chunk of stream) {
                    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
                }
                res.end();
            } catch (e: any) {
                res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
                res.end();
            }
            return;
        });

    }

    registerMcpTools(): McpToolDeclaration[] {
        return [
            {
                declaration: {
                    name: "get_project_guidelines",
                    description: "Đọc cấu hình dự án (IDE_SETUP.md, .cursorrules, ARCHITECTURE.md, v.v) để AI hiểu rules và quy ước.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            targetDir: { type: "string" }
                        },
                        required: ["targetDir"]
                    }
                },
                handler: async (args: any) => {
                    const { targetDir } = args;
                    try {
                        const candidates = ['.cursorrules', 'IDE_SETUP.md', 'ARCHITECTURE.md', 'README.md'];
                        const results: any = {};
                        for (const file of candidates) {
                            const fullPath = path.join(targetDir, file);
                            if (fs.existsSync(fullPath)) {
                                results[file] = fs.readFileSync(fullPath, 'utf8');
                            }
                        }
                        return {
                            content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
                        };
                    } catch (e: any) {
                        return { isError: true, content: [{ type: "text", text: e.message }] };
                    }
                }
            }
        ];
    }
}
