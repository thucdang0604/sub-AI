import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphAnalyzerService } from "../services/GraphAnalyzerService";
import { StorageService } from "../services/StorageService";
import { OllamaManagerService } from '../services/OllamaManagerService';
import { TypescriptChunker } from '../services/Chunker/TypescriptChunker';
import { LocalKnowledgeBaseService } from '../services/LocalKnowledgeBaseService';
import { RealtimeWatcherService } from '../services/RealtimeWatcherService';
import { IgnoreService } from '../services/Chunker/IgnoreService';
import { ExtensionManager } from '../core/ExtensionManager';
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

export class SubAIMcpServer {
    private server: Server;
    private analyzer: GraphAnalyzerService;
    private storage: StorageService;
    private lkbCache: Map<string, LocalKnowledgeBaseService> = new Map();
    private watcherCache: Map<string, RealtimeWatcherService> = new Map();
    private ollamaService: OllamaManagerService = new OllamaManagerService();
    private extensionManager?: ExtensionManager | undefined;

    private getLKB(targetDir: string) {
        if (!this.lkbCache.has(targetDir)) {
            const chunker = new TypescriptChunker();
            const lkb = new LocalKnowledgeBaseService(targetDir, this.ollamaService, chunker);
            this.lkbCache.set(targetDir, lkb);
            
            const ignoreService = new IgnoreService(targetDir);
            const watcher = new RealtimeWatcherService(targetDir, lkb, chunker, ignoreService);
            this.watcherCache.set(targetDir, watcher);
        }
        return this.lkbCache.get(targetDir)!;
    }

    constructor(extensionManager?: ExtensionManager) {
        let TOOL_DIR = path.resolve(__dirname, '../..');
        if (TOOL_DIR.includes('dist')) {
            TOOL_DIR = path.resolve(__dirname, '../../..');
        }
        this.analyzer = new GraphAnalyzerService();
        this.storage = new StorageService(TOOL_DIR);
        this.extensionManager = extensionManager;
        
        if (this.extensionManager) {
            this.extensionManager.registerMcpTools();
        }
        this.server = new Server(
            {
                name: "sub-ai-mcp",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
    }

    private setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const dynamicTools = this.extensionManager ? this.extensionManager.getMcpDeclarations() : [];
            const tools: Tool[] = [
                ...dynamicTools
            ];

            return { tools };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            // Check dynamic tools first
            if (this.extensionManager) {
                const handler = this.extensionManager.getMcpToolHandler(request.params.name);
                if (handler) {
                    return await handler(request.params.arguments || {});
                }
            }

            switch (request.params.name) {
                default:
                    throw new Error("Tool not found");
            }
        });
    }

    public async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("🚀 Sub-AI MCP Server running on stdio");
    }
}
