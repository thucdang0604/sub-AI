#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import { appConfig } from '../src/core/AppConfig';
import { StorageService } from '../src/services/StorageService';
import { GraphAnalyzerService } from '../src/services/GraphAnalyzerService';
import { LLMProviderFactory } from '../src/services/LLMProviderFactory.js';
import path from 'path';

async function run() {
    let TOOL_DIR = path.resolve(__dirname, '..');
    if (TOOL_DIR.endsWith('dist')) {
        TOOL_DIR = path.resolve(TOOL_DIR, '..');
    }
    
    let command = process.argv[2] || '';
    let prompt = '';
    let targetArg = process.cwd();

    if (command === 'ask') {
        prompt = process.argv[3] || '';
        targetArg = process.argv[4] || process.cwd();
    } else if (command === 'scan') {
        targetArg = process.argv[3] || process.cwd();
    } else if (command === 'mcp') {
        // do not change targetArg or command
    } else {
        targetArg = command || process.cwd();
        command = 'scan';
    }

    const targetDir = path.resolve(targetArg);
    const storage = new StorageService(TOOL_DIR);

    if (command === 'ask') {
        if (!prompt) {
            console.error('❌ Vui lòng cung cấp yêu cầu tính năng. Ví dụ: npm run cli ask "Tạo trang login"');
            process.exit(1);
        }

        console.log(`🧠 Đang phân tích yêu cầu: "${prompt}" cho dự án tại: ${targetDir}`);
        
        let aiMapContent = await storage.readAIMap(targetDir);
        if (!aiMapContent) {
            console.log(`⚠️ Không tìm thấy file cache AI_FILE_MAP.md. Đang quét toàn bộ dự án để tạo nhanh...`);
            const analyzer = new GraphAnalyzerService();
            const { graph, fileDependenciesMd, aiFileMapMd } = await analyzer.analyze(targetDir);
            await storage.saveGraphToToolDir(graph);
            await storage.saveAIMapsToProject(targetDir, fileDependenciesMd, aiFileMapMd);
            aiMapContent = aiFileMapMd;
        }

        // Fetch models from all configured providers
        const ollama = LLMProviderFactory.getProvider('ollama');
        const openai = LLMProviderFactory.getProvider('openai');
        const gemini = LLMProviderFactory.getProvider('gemini');
        
        const modelsArrays = await Promise.all([
            ollama.getModels().catch(() => []),
            openai.getModels().catch(() => []),
            gemini.getModels().catch(() => []),
        ]);
        const modelList = modelsArrays.flat();
        // Cung cấp ngữ cảnh vào system prompt
        const systemPrompt = `Bạn là một AI Context Router / System Architect xuất sắc. Dưới đây là Bản đồ phụ thuộc Code của dự án:\n\n${aiMapContent}\n\nYêu cầu tính năng mới từ user: "${prompt}"\n\nHãy phân tích và trả về danh sách CÁC FILE CẦN KIỂM TRA HOẶC SỬA ĐỔI để thực hiện yêu cầu. Trình bày dạng các gạch đầu dòng kèm lý do CỰC KỲ NGẮN GỌN cho mỗi file. Nếu cần tạo file mới, hãy dự định tên file đó.\nChỉ trả lời chuyên môn, không nói dài dòng.`;
        
        const defaultModel = modelList.length > 0 ? modelList[0]?.name : 'qwen2.5:7b';
        const model = appConfig.aiModel || appConfig.ollamaModel || defaultModel || 'qwen2.5:7b';
        
        const llm = LLMProviderFactory.getProviderForModel(model);

        console.log(`\n🤖 Bot đang đọc bản đồ dự án và suy nghĩ... (Model: ${model})\n--------------------------------------------------------------`);
        try {
            const stream = llm.streamGenerate(model, prompt, systemPrompt);
            for await (const chunk of stream) {
                process.stdout.write(chunk);
            }
            console.log('\n--------------------------------------------------------------');
        } catch (e: any) {
             console.error('\n❌ Lỗi kết nối AI Ollama:', e.message);
        }

    } else if (command === 'mcp') {
        // Start MCP Server
        const { SubAIMcpServer } = await import('../src/mcp/McpServer.js');
        const { ExtensionManager } = await import('../src/core/ExtensionManager.js');
        const { SystemExtension } = await import('../src/extensions/SystemExtension.js');
        const { GraphExtension } = await import('../src/extensions/GraphExtension.js');
        const { RagExtension } = await import('../src/extensions/RagExtension.js');
        const { ChatExtension } = await import('../src/extensions/ChatExtension.js');
        const { eventBus } = await import('../src/core/EventBus.js');

        const extensionManager = new ExtensionManager();
        extensionManager.register(new SystemExtension());
        extensionManager.register(new GraphExtension());
        extensionManager.register(new RagExtension());
        extensionManager.register(new ChatExtension());
        
        await extensionManager.initializeAll({ eventBus, storageService: storage as any });

        const mcpServer = new SubAIMcpServer(extensionManager);
        await mcpServer.start();
        
    } else {
        // SCAN
        console.log(`🔍 Scanning directory: ${targetDir}`);
        
        const analyzer = new GraphAnalyzerService();
        
        try {
            const { graph, fileDependenciesMd, aiFileMapMd } = await analyzer.analyze(targetDir);
            
            console.log(`   Found ${graph.nodes.length} source files.`);
            
            await storage.saveGraphToToolDir(graph);
            console.log(`✅ JSON → Saved to Tool Cache`);
            
            await storage.saveAIMapsToProject(graph.projectRoot, fileDependenciesMd, aiFileMapMd);
            const mapLines = aiFileMapMd.split('\n').length;
            console.log(`✅ AI Map → Saved to ${graph.projectRoot} (${mapLines} lines)`);
            
            // Console stats
            console.log(`\n📊 Summary:`);
            console.log(`   Nodes: ${graph.nodes.length}`);
            console.log(`   Edges: ${graph.edges.length}`);
            
            const counts: Record<string, number> = {};
            for (const e of graph.edges) {
                counts[e.target] = (counts[e.target] || 0) + 1;
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) {
                console.log(`\n🎯 Top 5 most-imported files:`);
                sorted.slice(0, 5).forEach(([file, count], i) => {
                    console.log(`   ${i + 1}. ${file} (${count} direct importers)`);
                });
            }
            
        } catch (e) {
            console.error('❌ Error scanning project:', e);
            process.exit(1);
        }
    }
}

run();
