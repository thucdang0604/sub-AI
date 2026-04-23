import { LocalKnowledgeBaseService } from './src/services/LocalKnowledgeBaseService.js';
import { OllamaManagerService } from './src/services/OllamaManagerService.js';
import { TypescriptChunker } from './src/services/Chunker/TypescriptChunker.js';
import path from 'path';

async function runIndexVerification() {
    console.log("=== BẮT ĐẦU KIỂM THỬ HỆ THỐNG RAG (SAU INDEX) ===");
    
    const targetDir = path.resolve(process.cwd());
    const ollama = new OllamaManagerService();
    const chunker = new TypescriptChunker();
    
    // Khởi tạo LKB - Nó sẽ tự kết nối tới .ai_cache/index.db
    const lkb = new LocalKnowledgeBaseService(targetDir, ollama, chunker);
    
    console.log(`[1] Đang kết nối tới Database tại: ${targetDir}/.ai_cache/index.db`);
    
    try {
        const stats = await lkb.getIndexStatus();
        console.log(`=> Trạng thái DB: isIndexed = ${stats.isIndexed}, chunkCount = ${stats.chunkCount}`);
        
        if (stats.chunkCount === 0) {
            console.log("\n[X] THẤT BẠI: Database trống. Vui lòng chạy Index trước khi test!");
            return;
        }

        console.log("\n[2] TEST 1: Semantic Search (Tìm kiếm ngữ nghĩa)");
        const query1 = "Module nào phụ trách giao tiếp với Python Daemon của NPU?";
        console.log(`=> Câu hỏi: "${query1}"`);
        
        const results1 = await lkb.search(query1, 3);
        let test1Pass = false;
        
        console.log("=> KẾT QUẢ TOP 3:");
        results1.forEach((res, i) => {
            console.log(`   ${i + 1}. ${res.file_path} (Score: ${res.score.toFixed(4)})`);
            if (res.file_path.includes('NpuEmbeddingBridge.ts') || res.file_path.includes('npu_service.py')) {
                test1Pass = true;
            }
        });
        
        if (test1Pass) {
            console.log("=> ĐÁNH GIÁ: \x1b[32mPASS\x1b[0m (Tìm thấy NpuBridge)");
        } else {
            console.log("=> ĐÁNH GIÁ: \x1b[31mFAIL\x1b[0m (Không tìm thấy file liên quan tới NPU)");
        }


        console.log("\n[3] TEST 2: Hybrid RRF Search (Từ khóa + Ngữ nghĩa)");
        const query2 = "Làm sao để tìm file mồ côi (orphan files)?";
        console.log(`=> Câu hỏi: "${query2}"`);
        
        const results2 = await lkb.search(query2, 3);
        let test2Pass = false;
        
        console.log("=> KẾT QUẢ TOP 3:");
        results2.forEach((res, i) => {
            console.log(`   ${i + 1}. ${res.file_path} (Score: ${res.score.toFixed(4)})`);
            if (res.file_path.includes('GraphAnalyzerService') || res.file_path.includes('McpServer')) {
                test2Pass = true;
            }
        });

        if (test2Pass) {
            console.log("=> ĐÁNH GIÁ: \x1b[32mPASS\x1b[0m (Tìm thấy logic Orphan trong GraphAnalyzerService/McpServer)");
        } else {
            console.log("=> ĐÁNH GIÁ: \x1b[31mFAIL\x1b[0m (Không tìm thấy logic Orphan)");
        }

        console.log("\n=== TỔNG KẾT KẾT QUẢ KIỂM THỬ ===");
        if (test1Pass && test2Pass) {
            console.log("\x1b[32m=> XUẤT SẮC! Cả 2 bài test đều PASS. Hệ thống RAG và Intel NPU đang hoạt động cực kỳ chính xác trên mã nguồn Sub-AI.\x1b[0m");
        } else {
            console.log("\x1b[33m=> HOÀN TẤT, nhưng có bài test bị FAIL. Cần xem lại quá trình Index hoặc mô hình embedding.\x1b[0m");
        }
        
    } catch (e: any) {
        console.error("\n[X] LỖI HỆ THỐNG TRONG QUÁ TRÌNH TEST:");
        console.error(e);
    }
}

runIndexVerification();
