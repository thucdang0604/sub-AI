import { IExtension, IExtensionContext, McpToolDeclaration } from '../core/interfaces/IExtension';
import { IRouter } from '../core/interfaces/IRouter';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitExtension implements IExtension {
    name = 'GitManager';
    version = '1.0.0';
    private context?: IExtensionContext;

    async initialize(context: IExtensionContext): Promise<void> {
        this.context = context;
        console.log(`[GitExtension] Initialized.`);
    }

    registerRoutes(router: IRouter): void {
        router.post('/api/git/recent', async (req, res, body) => {
            try {
                const { targetDir, limit = 10 } = body;
                if (!targetDir) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing targetDir" }));
                    return;
                }
                const result = await this.getRecentChanges(targetDir, limit);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result));
            } catch (error: any) {
                // If git is not available (not a git repo), return empty array gracefully
                if (error.message?.includes('not a git repository')) {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify([]));
                    return;
                }
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    registerMcpTools(): McpToolDeclaration[] {
        return [
            {
                declaration: {
                    name: "get_recent_commits",
                    description: "Lấy danh sách các commit gần đây cùng với các file đã thay đổi. Hữu ích để AI hiểu bối cảnh và lịch sử thay đổi của dự án.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            targetDir: { 
                                type: "string",
                                description: "Thư mục gốc của dự án chứa thư mục .git" 
                            },
                            limit: { 
                                type: "number",
                                description: "Số lượng commit muốn lấy (mặc định 5)"
                            }
                        },
                        required: ["targetDir"]
                    }
                },
                handler: async (args: any) => {
                    const { targetDir, limit = 5 } = args;
                    if (!targetDir) {
                        throw new Error("Missing targetDir");
                    }
                    try {
                        const result = await this.getRecentChanges(targetDir, limit);
                        return {
                            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                        };
                    } catch (e: any) {
                        return { isError: true, content: [{ type: "text", text: `Git Error: ${e.message}` }] };
                    }
                }
            },
            {
                declaration: {
                    name: "get_file_history",
                    description: "Lấy lịch sử commit và nội dung thay đổi (git patch) của một file cụ thể để xem ai đã sửa, sửa lúc nào và sửa đoạn nào.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            targetDir: { type: "string" },
                            filePath: { 
                                type: "string",
                                description: "Đường dẫn tương đối của file (vd: src/components/Button.tsx)" 
                            },
                            limit: { 
                                type: "number",
                                description: "Số lượng commit gần nhất của file này (mặc định 3)" 
                            }
                        },
                        required: ["targetDir", "filePath"]
                    }
                },
                handler: async (args: any) => {
                    const { targetDir, filePath, limit = 3 } = args;
                    if (!targetDir || !filePath) {
                        throw new Error("Missing targetDir or filePath");
                    }
                    try {
                        const { stdout } = await execAsync(`git log -p -n ${limit} -- "${filePath}"`, { cwd: targetDir });
                        return {
                            content: [{ type: "text", text: stdout || "No history found or not a git repository." }]
                        };
                    } catch (e: any) {
                        return { isError: true, content: [{ type: "text", text: `Git Error: ${e.message}` }] };
                    }
                }
            }
        ];
    }

    private async getRecentChanges(targetDir: string, limit: number) {
        // Lấy danh sách commit kèm tên tác giả, thời gian, và danh sách file thay đổi
        const cmd = `git log -n ${limit} --pretty=format:"%h|%an|%ad|%s" --name-status --date=short`;
        const { stdout } = await execAsync(cmd, { cwd: targetDir });
        
        const lines = stdout.split('\n');
        const commits: any[] = [];
        let currentCommit: any = null;

        for (const line of lines) {
            if (!line.trim()) continue;
            
            // Nếu dòng có chứa '|' và độ dài mã hash ở đầu, thì đây là dòng header của commit
            if (line.includes('|') && /^[a-f0-9]{7,40}\|/.test(line)) {
                const parts = line.split('|');
                currentCommit = {
                    hash: parts[0],
                    author: parts[1],
                    date: parts[2],
                    message: parts.slice(3).join('|'), // Ghép lại nếu message có dấu |
                    changes: []
                };
                commits.push(currentCommit);
            } else if (currentCommit) {
                // Các dòng tiếp theo là danh sách file (VD: "M\tsrc/file.ts" hoặc "A\tnew.ts")
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    currentCommit.changes.push({
                        status: (parts[0] ?? '').trim(),
                        file: (parts[1] ?? '').trim()
                    });
                }
            }
        }

        return commits;
    }
}
