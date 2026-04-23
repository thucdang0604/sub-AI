import { LocalKnowledgeBaseService } from './src/services/LocalKnowledgeBaseService.js';
import path from 'path';

async function runTest() {
    console.log("=== BẮT ĐẦU TEST LOCAL RAG TRÊN DỰ ÁN NÀY ===");
    
    const { OllamaManagerService } = await import('./src/services/OllamaManagerService.js');
    const { TypescriptChunker } = await import('./src/services/Chunker/TypescriptChunker.js');
    
    const targetDir = path.resolve(process.cwd());
    const ollama = new OllamaManagerService();
    const chunker = new TypescriptChunker();
    const lkb = new LocalKnowledgeBaseService(targetDir, ollama, chunker);
    
    console.log(`[1] Đang quét và lập chỉ mục dự án: ${targetDir}`);
    try {
        console.log("=> Kiểm tra và tải model AI (nếu chưa có)...");
        await ollama.checkAndPullModel('nomic-embed-text');
        await ollama.checkAndPullModel('qwen2.5-coder:1.5b');
        
        // Gọi indexProject với force_reindex = true để xem từ đầu
        await lkb.indexProject({ forceReset: true });
        console.log("=> Lập chỉ mục thành công!");
        console.log(`=> CSDL nằm tại: ${path.join(targetDir, '.ai_cache', 'index.db')}`);
        
        console.log("\n[2] Bắt đầu test Semantic Search (Hybrid Search RRF)...");
        const query = "Làm sao để tìm kiếm file bị mồ côi (orphan files)?";
        console.log(`=> Câu hỏi: "${query}"`);
        
        const searchResults = await lkb.search(query, 3);
        console.log("=> KẾT QUẢ TÌM KIẾM:");
        searchResults.forEach((res, i) => {
            console.log(`\n--- Top ${i + 1} (Score: ${res.score}) ---`);
            console.log(`File: ${res.file_path}`);
            console.log(`Symbol: ${res.symbol_name}`);
            console.log(`CodeSnippet (50 chars): ${res.code_content.slice(0, 50).replace(/\n/g, ' ')}...`);
        });

        console.log("\n=== TEST HOÀN TẤT MƯỢT MÀ ===");
    } catch (e: any) {
        console.error("\n[X] LỖI TRONG QUÁ TRÌNH TEST:");
        console.error(e.message);
    }
}

runTest();
