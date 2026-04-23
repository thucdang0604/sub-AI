import { IExtension, IExtensionContext, McpToolDeclaration } from '../core/interfaces/IExtension';
import { IRouter } from '../core/interfaces/IRouter';
import { GraphAnalyzerService } from '../../src/services/GraphAnalyzerService';
import { StorageService } from '../../src/services/StorageService';

export class GraphExtension implements IExtension {
  name = 'GraphExtension';
  version = '1.0.0';
  private storage!: StorageService;
  private analyzer!: GraphAnalyzerService;

  async initialize(context: IExtensionContext): Promise<void> {
    this.storage = context.storageService;
    this.analyzer = new GraphAnalyzerService();
    console.log(`[GraphExtension] Initialized`);
  }

  registerRoutes(router: IRouter): void {
    router.post('/api/analyze', async (req, res, body) => {
        if (!body || !body.targetDir) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing targetDir' }));
            return;
        }
        
        try {
            const result = await this.analyzer.analyze(body.targetDir);
            await this.storage.saveGraphToToolDir(result.graph);
            await this.storage.saveAIMapsToProject(body.targetDir, result.fileDependenciesMd, result.aiFileMapMd);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'Analysis complete' }));
        } catch (err: any) {
            console.error('Analysis error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Analysis failed' }));
        }
    });

    router.get('/api/impact', async (req, res, body) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const fileId = url.searchParams.get('fileId');
        if (!fileId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing fileId query parameter' }));
            return;
        }

        try {
            const graph = await this.storage.loadGraphFromToolDir();
            if (!graph) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No graph loaded, please analyze first' }));
                return;
            }

            const impact = this.analyzer.calculateImpact(graph, fileId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(impact));
        } catch (err: any) {
            console.error('Impact analysis error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Impact analysis failed' }));
        }
    });

    router.get('/api/health', async (req, res) => {
        try {
            const graph = await this.storage.loadGraphFromToolDir();
            if (!graph) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No graph loaded. Analyze project first.' }));
                return;
            }

            const report = this.buildHealthReport(graph);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(report));
        } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
  }

  private buildHealthReport(graph: any) {
    const circularDeps = graph.edges
      .filter((e: any) => e.isCircular)
      .map((e: any) => ({ from: e.source, to: e.target }));

    const orphanFiles = graph.nodes
      .filter((n: any) => n.isOrphan)
      .map((n: any) => ({ file: n.id, lines: n.lines || 0, category: n.category }));

    const GOD_FILE_THRESHOLD = 400;
    const godFiles = graph.nodes
      .filter((n: any) => (n.lines || 0) > GOD_FILE_THRESHOLD)
      .map((n: any) => {
        const fanOut = graph.edges.filter((e: any) => e.source === n.id).length;
        const fanIn = graph.edges.filter((e: any) => e.target === n.id).length;
        return { file: n.id, lines: n.lines || 0, category: n.category, fanOut, fanIn };
      })
      .sort((a: any, b: any) => b.lines - a.lines);

    const warnings: any[] = [];
    for (const node of graph.nodes) {
      if (node.warnings && node.warnings.length > 0) {
        warnings.push({ file: node.id, lines: node.lines || 0, category: node.category, warnings: node.warnings });
      }
    }

    const deadExportFiles: any[] = [];
    for (const node of graph.nodes) {
      if (!node.exports || node.exports.length === 0) continue;
      if (['config', 'page', 'layout', 'api'].includes(node.category)) continue;
      const importers = graph.edges.filter((e: any) => e.target === node.id);
      if (importers.length === 0) {
        deadExportFiles.push({ file: node.id, lines: node.lines || 0, exportCount: node.exports.length, category: node.category });
      }
    }

    const impactMap = new Map<string, number>();
    for (const edge of graph.edges) {
      impactMap.set(edge.target, (impactMap.get(edge.target) || 0) + 1);
    }
    const highImpactFiles = Array.from(impactMap.entries())
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([file, importerCount]) => {
        const node = graph.nodes.find((n: any) => n.id === file);
        return { file, importerCount, lines: node?.lines || 0, category: node?.category || 'unknown' };
      });

    const healthScore = Math.max(0, 100
      - (circularDeps.length * 15)
      - (orphanFiles.length * 2)
      - (godFiles.length * 5)
      - (warnings.filter((w: any) => w.warnings.some((ww: any) => ww.severity === 'high')).length * 10)
      - (deadExportFiles.length * 3)
    );

    return {
      summary: {
        projectRoot: graph.projectRoot,
        totalFiles: graph.nodes.length,
        totalEdges: graph.edges.length,
        healthScore,
      },
      circularDependencies: circularDeps,
      orphanFiles,
      godFiles,
      deadExportFiles,
      highImpactFiles,
      securityWarnings: warnings.filter((w: any) => w.warnings.some((ww: any) => ww.type === 'env-leak' || ww.type === 'hardcoded-secret' || ww.type === 'unsafe-dom')),
      allWarnings: warnings,
    };
  }

  registerMcpTools(): McpToolDeclaration[] {
    return [
        {
            declaration: {
                name: "analyze_project",
                description: "Phân tích kiến trúc dự án và tạo ra file AI_FILE_MAP.md. Cần cung cấp đường dẫn tuyệt đối đến thư mục gốc của dự án.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: {
                            type: "string",
                            description: "Đường dẫn tuyệt đối đến thư mục chứa mã nguồn cần phân tích",
                        },
                    },
                    required: ["targetDir"],
                },
            },
            handler: async (args: any) => {
                const { targetDir } = args;
                if (!targetDir) {
                    throw new Error("Missing targetDir argument");
                }
                const result = await this.analyzer.analyze(targetDir);
                await this.storage.saveGraphToToolDir(result.graph);
                await this.storage.saveAIMapsToProject(targetDir, result.fileDependenciesMd, result.aiFileMapMd);
                return {
                    content: [{
                        type: "text",
                        text: `Project analyzed successfully. Found ${result.graph.nodes.length} files. AI_FILE_MAP.md generated at root.`,
                    }],
                };
            }
        },
        {
            declaration: {
                name: "get_ai_file_map",
                description: "Đọc nội dung bản đồ kiến trúc AI_FILE_MAP.md của dự án để hiểu bối cảnh và các file liên kết.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: {
                            type: "string",
                            description: "Đường dẫn tuyệt đối đến thư mục chứa mã nguồn",
                        },
                    },
                    required: ["targetDir"],
                },
            },
            handler: async (args: any) => {
                const { targetDir } = args;
                if (!targetDir) {
                    throw new Error("Missing targetDir argument");
                }
                const mapContent = await this.storage.readAIMap(targetDir);
                if (!mapContent) {
                    return {
                        content: [{
                            type: "text",
                            text: "AI_FILE_MAP.md not found. Please run analyze_project first.",
                        }],
                    };
                }
                return {
                    content: [{
                        type: "text",
                        text: mapContent,
                    }],
                };
            }
        },
        {
            declaration: {
                name: "get_file_impact",
                description: "Phân tích mức độ ảnh hưởng của một file cụ thể (ai gọi nó, nó gọi ai) dựa trên đồ thị phụ thuộc đã được tạo.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: {
                            type: "string",
                            description: "Đường dẫn tuyệt đối đến thư mục gốc của dự án",
                        },
                        fileId: {
                            type: "string",
                            description: "Đường dẫn tương đối của file cần phân tích (ví dụ: src/components/Button.tsx)",
                        },
                    },
                    required: ["targetDir", "fileId"],
                },
            },
            handler: async (args: any) => {
                const { fileId } = args;
                if (!fileId) {
                    throw new Error("Missing fileId argument");
                }
                const graph = await this.storage.loadGraphFromToolDir();
                if (!graph) {
                    return {
                        content: [{
                            type: "text",
                            text: "Project graph not found. Please run analyze_project first.",
                        }],
                    };
                }
                
                try {
                    const impact = this.analyzer.calculateImpact(graph, fileId);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(impact, null, 2),
                        }],
                    };
                } catch (e: any) {
                    return {
                        content: [{
                            type: "text",
                            text: `Error calculating impact: ${e.message}`,
                        }],
                    };
                }
            }
        },
        {
            declaration: {
                name: "get_health_report",
                description: "Tổng hợp báo cáo sức khỏe kiến trúc từ đồ thị phụ thuộc: circular dependencies, orphan files, god files, security warnings, dead exports. Dùng để cross-reference với mã nguồn thực tế.",
                inputSchema: {
                    type: "object",
                    properties: {
                        targetDir: {
                            type: "string",
                            description: "Đường dẫn tuyệt đối đến thư mục gốc của dự án",
                        },
                    },
                    required: ["targetDir"],
                },
            },
            handler: async (args: any) => {
                const { targetDir } = args;
                if (!targetDir) {
                    throw new Error("Missing targetDir argument");
                }
                const graph = await this.storage.loadGraphFromToolDir();
                if (!graph || graph.projectRoot !== targetDir) {
                    return {
                        content: [{ type: "text", text: `Không tìm thấy đồ thị phụ thuộc cho ${targetDir}. Vui lòng chạy analyze_project trước.` }]
                    };
                }

                // 1. Circular Dependencies
                const circularDeps = graph.edges
                    .filter((e: any) => e.isCircular)
                    .map((e: any) => ({ from: e.source, to: e.target }));

                // 2. Orphan Files (never imported, not entry points)
                const orphanFiles = graph.nodes
                    .filter((n: any) => n.isOrphan)
                    .map((n: any) => ({ file: n.id, lines: n.lines || 0, category: n.category }));

                // 3. God Files (high lines + high fan-out)
                const GOD_FILE_THRESHOLD = 400;
                const godFiles = graph.nodes
                    .filter((n: any) => (n.lines || 0) > GOD_FILE_THRESHOLD)
                    .map((n: any) => {
                        const fanOut = graph.edges.filter((e: any) => e.source === n.id).length;
                        const fanIn = graph.edges.filter((e: any) => e.target === n.id).length;
                        return { file: n.id, lines: n.lines || 0, category: n.category, fanOut, fanIn };
                    })
                    .sort((a: any, b: any) => b.lines - a.lines);

                // 4. All Warnings
                const warnings: any[] = [];
                for (const node of graph.nodes) {
                    if (node.warnings && node.warnings.length > 0) {
                        warnings.push({
                            file: node.id,
                            lines: node.lines || 0,
                            category: node.category,
                            warnings: node.warnings
                        });
                    }
                }

                // 5. Dead Export Files
                const deadExportFiles: any[] = [];
                for (const node of graph.nodes) {
                    if (!node.exports || node.exports.length === 0) continue;
                    if (['config', 'page', 'layout', 'api'].includes(node.category)) continue;
                    const importers = graph.edges.filter((e: any) => e.target === node.id);
                    if (importers.length === 0) {
                        deadExportFiles.push({
                            file: node.id,
                            lines: node.lines || 0,
                            exportCount: node.exports.length,
                            category: node.category,
                        });
                    }
                }

                // 6. High Impact Files (most depended upon)
                const impactMap = new Map<string, number>();
                for (const edge of graph.edges) {
                    impactMap.set(edge.target, (impactMap.get(edge.target) || 0) + 1);
                }
                const highImpactFiles = Array.from(impactMap.entries())
                    .filter(([, count]) => count >= 3)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([file, importerCount]) => {
                        const node = graph.nodes.find((n: any) => n.id === file);
                        return { file, importerCount, lines: node?.lines || 0, category: node?.category || 'unknown' };
                    });

                // Summary
                const summary = {
                    projectRoot: graph.projectRoot,
                    totalFiles: graph.nodes.length,
                    totalEdges: graph.edges.length,
                    healthScore: Math.max(0, 100
                        - (circularDeps.length * 15)
                        - (orphanFiles.length * 2)
                        - (godFiles.length * 5)
                        - (warnings.filter(w => w.warnings.some((ww: any) => ww.severity === 'high')).length * 10)
                        - (deadExportFiles.length * 3)
                    ),
                };

                const report = {
                    summary,
                    circularDependencies: circularDeps,
                    orphanFiles,
                    godFiles,
                    deadExportFiles,
                    securityWarnings: warnings.filter(w => w.warnings.some((ww: any) => ww.type === 'env-leak' || ww.type === 'hardcoded-secret' || ww.type === 'unsafe-dom')),
                    allWarnings: warnings,
                    highImpactFiles,
                    features: graph.features?.map((f: any) => ({ id: f.id, name: f.name, fileCount: f.files.length, totalLines: f.totalLines })) || [],
                };

                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(report, null, 2)
                    }],
                };
            }
        }
    ];
  }
}
