import { NpuEmbeddingBridge } from './src/services/NpuEmbeddingBridge.js';
import { eventManager } from './src/services/EventManager.js';
import path from 'path';

// Mock eventManager for testing
eventManager.on('log', (data) => console.log(`[LOG] ${data.level}: ${data.message}`));

async function main() {
    const rootDir = __dirname;
    console.log(`Testing NPU Bridge in ${rootDir}`);
    
    const bridge = NpuEmbeddingBridge.getInstance(rootDir);
    
    // Đợi một chút để daemon khởi động
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Sending single query embedding request...');
    const qEmb = await bridge.getEmbedding("Làm sao để thiết lập RAG?", "query");
    console.log(`Query embedding received, length: ${qEmb.length}, first 5:`, qEmb.slice(0, 5));
    
    console.log('Sending batch document embedding request...');
    const texts = [
        "function hello() { console.log('world'); }",
        "class NpuBridge { constructor() {} }"
    ];
    
    const dEmbs = await bridge.getEmbeddingsBatch(texts, "document");
    console.log(`Batch embedding received, count: ${dEmbs.length}`);
    console.log(`Doc 1 embedding length: ${dEmbs[0]?.length}, first 5:`, dEmbs[0]?.slice(0, 5));
    console.log(`Doc 2 embedding length: ${dEmbs[1]?.length}, first 5:`, dEmbs[1]?.slice(0, 5));
    
    console.log('Test completed. Exiting...');
    process.exit(0);
}

main().catch(console.error);
