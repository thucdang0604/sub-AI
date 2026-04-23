import { Project, Node, SyntaxKind } from 'ts-morph';
import { IChunker, CodeChunk } from './IChunker.js';
import crypto from 'crypto';

export class TypescriptChunker implements IChunker {
    private project: Project;

    constructor() {
        this.project = new Project();
    }

    private generateHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex'); // Dùng md5 cho nhẹ
    }

    public async chunkFile(absolutePath: string, relativePath: string): Promise<CodeChunk[]> {
        const chunks: CodeChunk[] = [];
        
        let sourceFile = this.project.getSourceFile(absolutePath);
        if (!sourceFile) {
            sourceFile = this.project.addSourceFileAtPath(absolutePath);
        } else {
            sourceFile.refreshFromFileSystemSync();
        }

        if (!sourceFile) return chunks;

        const classes = sourceFile.getClasses();
        const functions = sourceFile.getFunctions();
        const interfaces = sourceFile.getInterfaces();
        const variables = sourceFile.getVariableStatements().filter(v => v.isExported());

        const processNode = (node: Node, name: string, type: string) => {
            const text = node.getText();
            if (text.split('\n').length < 3 && type !== 'Interface') return;

            const startLine = node.getStartLineNumber();
            const endLine = node.getEndLineNumber();
            
            const dependencies = new Set<string>();
            node.forEachDescendant(descendant => {
                if (Node.isIdentifier(descendant)) {
                    dependencies.add(descendant.getText());
                }
            });

            const maxChunkLength = 4000;
            if (text.length > maxChunkLength) {
                // Split chunk to prevent OOM
                const parts = Math.ceil(text.length / maxChunkLength);
                for (let i = 0; i < parts; i++) {
                    const subText = text.substring(i * maxChunkLength, (i + 1) * maxChunkLength);
                    chunks.push({
                        id: this.generateHash(subText),
                        file_path: relativePath,
                        start_line: startLine,
                        end_line: endLine,
                        symbol_name: `${name || 'anonymous'}_part${i + 1}`,
                        code_content: subText,
                        dependencies: Array.from(dependencies).slice(0, 10)
                    });
                }
            } else {
                chunks.push({
                    id: this.generateHash(text),
                    file_path: relativePath,
                    start_line: startLine,
                    end_line: endLine,
                    symbol_name: name || 'anonymous',
                    code_content: text,
                    dependencies: Array.from(dependencies).slice(0, 10)
                });
            }
        };

        classes.forEach(c => processNode(c, c.getName() || 'AnonymousClass', 'Class'));
        functions.forEach(f => processNode(f, f.getName() || 'AnonymousFunction', 'Function'));
        interfaces.forEach(i => processNode(i, i.getName() || 'AnonymousInterface', 'Interface'));
        variables.forEach(v => {
            const decls = v.getDeclarations();
            if (decls && decls.length > 0) {
                processNode(v, decls[0]?.getName() || 'AnonymousVariable', 'Variable');
            }
        });

        if (chunks.length === 0 && sourceFile) {
            const text = sourceFile.getText();
            const maxChunkLength = 4000;
            if (text.length > maxChunkLength) {
                const parts = Math.ceil(text.length / maxChunkLength);
                for (let i = 0; i < parts; i++) {
                    const subText = text.substring(i * maxChunkLength, (i + 1) * maxChunkLength);
                    chunks.push({
                        id: this.generateHash(subText),
                        file_path: relativePath,
                        start_line: 1,
                        end_line: sourceFile.getEndLineNumber(),
                        symbol_name: `FileModule_part${i + 1}`,
                        code_content: subText,
                        dependencies: []
                    });
                }
            } else {
                chunks.push({
                    id: this.generateHash(text),
                    file_path: relativePath,
                    start_line: 1,
                    end_line: sourceFile.getEndLineNumber(),
                    symbol_name: 'FileModule',
                    code_content: text,
                    dependencies: []
                });
            }
        }

        return chunks;
    }
}
