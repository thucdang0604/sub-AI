import { IAnalyzerService, AnalysisResult } from '../contracts/IAnalyzerService';
import { ProjectGraph, GraphNode, GraphEdge, SymbolInfo, NodeWarning, FeatureCluster } from '../domain/types';
import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const EXTERNAL_PREFIXES = [
    'react', 'next', 'firebase', 'lucide-react', 'sonner', 'swiper',
    'react-dom', 'react-quill', 'react-player', '@google', '@tailwindcss',
    '@xyflow', 'node:', 'fs', 'path', 'crypto', 'stream', 'http', 'https',
    'url', 'util', 'os', 'events', 'buffer', 'zlib', 'clsx'
];

export class GraphAnalyzerService implements IAnalyzerService {

    private static readonly IGNORED_DIRS = new Set([
        'node_modules', 'bower_components',
        'dist', 'build', 'out', '.output', '.next', '.nuxt',
        '.cache', '.temp', '.tmp', '.turbo', '.parcel-cache',
        '.git', '.vscode', '.idea', '.fleet',
        '.firebase',
        'coverage', '.nyc_output',
        '.vercel', '.netlify', '.amplify',
        '__generated__', '.generated',
    ]);

    private static readonly ALLOWED_DOT_DIRS = new Set(['.storybook']);

    private static readonly IGNORED_FILE_PATTERNS = [
        /\.d\.ts$/, /\.d\.mts$/,
        /\.min\.(js|css)$/, /\.bundle\.js$/, /\.chunk\.js$/,
        /\.generated\.\w+$/, /sw\.js$/,
    ];

    async analyze(targetDir: string): Promise<AnalysisResult> {
        const projectRoot = path.resolve(targetDir);
        
        if (!fs.existsSync(projectRoot)) {
            throw new Error(`Directory not found: ${projectRoot}`);
        }

        // Sử dụng projectRoot làm điểm bắt đầu quét để quét TOÀN BỘ dự án được chọn
        const srcDir = projectRoot;

        const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
        const hasTsConfig = fs.existsSync(tsConfigPath);

        // Read tsconfig paths for alias resolution (e.g. @/ → src/)
        // IMPORTANT: ts-morph ignores compilerOptions when tsConfigFilePath is set,
        // so we must NOT use tsConfigFilePath — instead pass everything via compilerOptions
        let tsPaths: Record<string, string[]> = {};
        if (hasTsConfig) {
            try {
                const tsConfigRaw = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'));
                tsPaths = tsConfigRaw.compilerOptions?.paths || {};
            } catch { /* ignore parse errors */ }
        }

        const project = new Project({
            compilerOptions: {
                allowJs: true,
                resolveJsonModule: true,
                baseUrl: projectRoot,
                paths: tsPaths,
            },
            skipAddingFilesFromTsConfig: true,
        });

        const filesToAnalyze = this.scanFiles(projectRoot);
        const vueFileMap = new Map<string, string>(); // virtualPath → original .vue path

        for (const file of filesToAnalyze) {
            const normalizedFile = file.replace(/\\/g, '/');
            if (file.endsWith('.vue')) {
                const extracted = this.extractVueScript(file);
                if (extracted) {
                    const virtualPath = normalizedFile + '.__extracted__.' + extracted.lang;
                    project.createSourceFile(virtualPath, extracted.scriptContent, { overwrite: true });
                    vueFileMap.set(virtualPath, normalizedFile);
                }
            } else {
                project.addSourceFileAtPath(normalizedFile);
            }
        }
        
        const sourceFiles = project.getSourceFiles();

        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const nodeIds = new Set<string>();

        const gitHeatmap = this.getGitHeatmap(projectRoot);

        for (const sourceFile of sourceFiles) {
            const filePath = sourceFile.getFilePath();
            // Map virtual Vue file back to original .vue path
            const actualPath = vueFileMap.get(filePath) || filePath;
            const relPath = path.relative(projectRoot, actualPath).replace(/\\/g, '/');
            const nodeId = relPath;
            const category = this.classifyFile(relPath);
            const lineCount = sourceFile.getEndLineNumber();

            // Extract exported symbols
            const exports: SymbolInfo[] = [];
            const exportedDecls = sourceFile.getExportedDeclarations();
            for (const [name, declarations] of exportedDecls.entries()) {
                if (declarations.length > 0) {
                    const decl = declarations[0];
                    let type: SymbolInfo['type'] = 'unknown';
                    
                    if (Node.isClassDeclaration(decl)) type = 'class';
                    else if (Node.isFunctionDeclaration(decl) || Node.isArrowFunction(decl)) type = 'function';
                    else if (Node.isInterfaceDeclaration(decl)) type = 'interface';
                    else if (Node.isTypeAliasDeclaration(decl)) type = 'type';
                    else if (Node.isVariableDeclaration(decl)) type = 'variable';

                    exports.push({ name, type });
                }
            }

            const docs: string[] = [];
            const urlRegex = /(https?:\/\/[^\s"']+)/g;
            const extractUrls = (text: string) => {
                let match;
                while ((match = urlRegex.exec(text)) !== null) {
                    let url = match[1];
                    if (url) {
                        // Clean trailing punctuation
                        url = url.replace(/[.,:;)]$/, '');
                        if (!docs.includes(url)) docs.push(url);
                    }
                }
            };
            sourceFile.getDescendantsOfKind(SyntaxKind.SingleLineCommentTrivia).forEach(c => extractUrls(c.getText()));
            sourceFile.getDescendantsOfKind(SyntaxKind.MultiLineCommentTrivia).forEach(c => extractUrls(c.getText()));

            const gitChanges = gitHeatmap[nodeId] || 0;

            const nodeData: GraphNode = { id: nodeId, category, lines: lineCount, exports, gitChanges };
            if (docs.length > 0) {
                nodeData.docs = docs;
            }
            nodes.push(nodeData);
            nodeIds.add(nodeId);

            // Extract imports and build edges
            const importDecls = sourceFile.getImportDeclarations();
            for (const importDecl of importDecls) {
                const moduleSpecifier = importDecl.getModuleSpecifierValue();
                if (this.isExternal(moduleSpecifier)) continue;

                const importedSourceFile = importDecl.getModuleSpecifierSourceFile();
                if (importedSourceFile) {
                    const targetPath = importedSourceFile.getFilePath();
                    const actualTargetPath = vueFileMap.get(targetPath) || targetPath;
                    const targetId = path.relative(projectRoot, actualTargetPath).replace(/\\/g, '/');
                    edges.push({ source: nodeId, target: targetId });
                } else {
                    const resolved = this.resolveImportManual(moduleSpecifier, filePath, srcDir, projectRoot);
                    if (resolved) {
                        const targetId = path.relative(projectRoot, resolved).replace(/\\/g, '/');
                        edges.push({ source: nodeId, target: targetId });
                    }
                }
            }
            
            // Dynamic imports
            const dynamicImports = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
                .filter(callExpr => callExpr.getExpression().getKind() === SyntaxKind.ImportKeyword);
            
            for (const dynamicImport of dynamicImports) {
                const args = dynamicImport.getArguments();
                if (args.length > 0 && Node.isStringLiteral(args[0])) {
                    const moduleSpecifier = args[0].getLiteralValue();
                    if (this.isExternal(moduleSpecifier)) continue;
                    
                    // Manual resolve for dynamic imports if not resolved by ts-morph easily
                    const resolved = this.resolveImportManual(moduleSpecifier, filePath, srcDir, projectRoot);
                    if (resolved) {
                        const targetId = path.relative(projectRoot, resolved).replace(/\\/g, '/');
                        edges.push({ source: nodeId, target: targetId });
                    }
                }
            }
        }

        // Deduplicate Edges
        const edgeSet = new Set<string>();
        const uniqueEdges = edges
            .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
            .filter(e => {
                const key = `${e.source}->${e.target}`;
                if (edgeSet.has(key)) return false;
                edgeSet.add(key);
                return true;
            });

        // Detect Circular Dependencies
        this.detectCircularDependencies(nodes, uniqueEdges);

        // Detect Orphan Files
        this.detectOrphanFiles(nodes, uniqueEdges);

        // Detect Warnings (runs AFTER detectOrphanFiles)
        this.detectWarnings(nodes, uniqueEdges);

        // Detect Feature Clusters
        const features = this.detectFeatures(nodes, uniqueEdges);

        const graph: ProjectGraph = {
            projectRoot,
            srcDir,
            nodes,
            edges: uniqueEdges,
            features,
        };

        const fileDependenciesMd = this.generateMdDependencies(graph);
        const aiFileMapMd = this.generateAiMap(graph);

        return { graph, fileDependenciesMd, aiFileMapMd };
    }

    calculateImpact(graph: ProjectGraph, fileId: string): { fileId: string; directImpact: string[]; transitiveImpact: string[]; } | null {
        const { importedByMap } = this.buildMaps(graph);
        
        // Ensure fileId matches the graph node ID format
        const normalizedFileId = fileId.replace(/\\/g, '/');
        const node = graph.nodes.find(n => n.id === normalizedFileId || n.id.endsWith(normalizedFileId));
        
        if (!node) return null;

        const directImpact = importedByMap[node.id] || [];
        const transitiveSet = this.getTransitiveImporters(node.id, importedByMap);
        transitiveSet.delete(node.id); // Remove self
        
        // Remove direct impact from transitive to avoid overlap
        directImpact.forEach(d => transitiveSet.delete(d));

        return {
            fileId: node.id,
            directImpact,
            transitiveImpact: Array.from(transitiveSet)
        };
    }

    private scanFiles(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat && stat.isDirectory()) {
                if (GraphAnalyzerService.IGNORED_DIRS.has(file)) continue;
                if (file.startsWith('.') && !GraphAnalyzerService.ALLOWED_DOT_DIRS.has(file)) continue;
                results = results.concat(this.scanFiles(fullPath));
            } else {
                if (/\.(ts|tsx|js|jsx|mjs|vue)$/.test(file)) {
                    if (GraphAnalyzerService.IGNORED_FILE_PATTERNS.some(p => p.test(file))) continue;
                    results.push(fullPath);
                }
            }
        }
        return results;
    }

    private resolveImportManual(specifier: string, fromFile: string, srcDir: string, projectRoot: string): string | null {
        let targetPath = '';
        if (specifier.startsWith('@/')) {
            const srcMapped = path.resolve(projectRoot, 'src', specifier.slice(2));
            const rootMapped = path.resolve(projectRoot, specifier.slice(2));
            
            const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', ''];
            let found = false;
            for (const ext of EXTENSIONS) {
                if (fs.existsSync(srcMapped + ext)) { targetPath = srcMapped; found = true; break; }
            }
            if (!found) targetPath = rootMapped;
        } else if (specifier.startsWith('.')) {
            targetPath = path.resolve(path.dirname(fromFile), specifier);
        } else {
            return null;
        }
        
        const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue'];
        for (const ext of EXTENSIONS) {
            if (fs.existsSync(targetPath + ext)) return targetPath + ext;
        }
        for (const ext of EXTENSIONS) {
            const indexPath = path.join(targetPath, 'index' + ext);
            if (fs.existsSync(indexPath)) return indexPath;
        }
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) return targetPath;
        return null;
    }

    private isExternal(specifier: string): boolean {
        return EXTERNAL_PREFIXES.some(prefix => specifier.startsWith(prefix));
    }

    private classifyFile(relPath: string): string {
        const n = relPath.replace(/\\/g, '/');
        const basename = path.basename(n);

        // Layer 0: Presentation
        if (/page\.(tsx?|jsx?|vue)$/.test(basename)) return 'page';
        if (/layout\.(tsx?|jsx?)$/.test(basename)) return 'layout';
        if (/(^|\/)(views?|screens?)\//.test(n)) return 'view';

        // Layer 1: Components
        if (/(^|\/)(components?|widgets?)\//.test(n)) return 'component';

        // Layer 2: API / Routes
        if (/(^|\/)api\//.test(n)) return 'api';
        if (/(^|\/)routes?\//.test(n)) return 'route';
        if (/(^|\/)controllers?\//.test(n)) return 'controller';
        if (/(^|\/)middleware\//.test(n)) return 'middleware';

        // Layer 3: Logic
        if (/(^|\/)services?\//.test(n)) return 'service';
        if (/(^|\/)hooks?\//.test(n) || /^use[A-Z]/.test(basename)) return 'hook';
        if (/(^|\/)(utils?|helpers?)\//.test(n)) return 'util';
        if (/(^|\/)lib\//.test(n)) return 'lib';

        // Layer 4: Data
        if (/(^|\/)models?\//.test(n)) return 'model';
        if (/(^|\/)(schemas?|prisma)\//.test(n)) return 'schema';
        if (/(^|\/)(types?|interfaces?)\//.test(n)) return 'type';
        if (/(^|\/)(stores?|state|redux|pinia)\//.test(n)) return 'store';

        // Layer 5: Config
        if (/config/.test(n) || /(^|\/)constants?\//.test(n)) return 'config';

        return 'other';
    }

    private extractVueScript(filePath: string): { scriptContent: string; lang: string } | null {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
        if (!match) return null;
        const attrs = match[1] || '';
        const scriptContent = (match[2] || '').trim();
        if (!scriptContent) return null;
        const lang = /lang=["']ts["']/.test(attrs) ? 'ts' : 'js';
        return { scriptContent, lang };
    }

    private detectCircularDependencies(nodes: GraphNode[], edges: GraphEdge[]) {
        // Tarjan's or simple DFS for cycle detection
        const adjacencyList: Record<string, string[]> = {};
        for (const edge of edges) {
            if (!adjacencyList[edge.source]) adjacencyList[edge.source] = [];
            adjacencyList[edge.source]!.push(edge.target);
        }

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = (nodeId: string, path: string[]) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);

            const neighbors = adjacencyList[nodeId] || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor, [...path]);
                } else if (recursionStack.has(neighbor)) {
                    // Cycle detected! Mark the edge as circular
                    const edgeToMark = edges.find(e => e.source === nodeId && e.target === neighbor);
                    if (edgeToMark) edgeToMark.isCircular = true;
                }
            }

            recursionStack.delete(nodeId);
        };

        for (const node of nodes) {
            if (!visited.has(node.id)) {
                dfs(node.id, []);
            }
        }
    }

    private detectOrphanFiles(nodes: GraphNode[], edges: GraphEdge[]) {
        const importedByCount: Record<string, number> = {};
        for (const edge of edges) {
            importedByCount[edge.target] = (importedByCount[edge.target] || 0) + 1;
        }

        const ENTRY_POINT_PATTERNS = [
            /^index\.(ts|tsx|js|jsx)$/,
            /^main\.(ts|tsx|js|jsx)$/,
            /^app\.(ts|tsx|js|jsx|vue)$/,
            /page\.(tsx|jsx|vue)$/,
            /layout\.(tsx|jsx|vue)$/,
            /route\.(ts|js)$/,
            /not-found\.(tsx|jsx)$/,
            /loading\.(tsx|jsx)$/,
            /error\.(tsx|jsx)$/,
            /sitemap\.(ts|js)$/,
            /robots\.(ts|js)$/,
            /cli\.(ts|js)$/,
            /vite\.config\.(ts|js)$/,
            /next\.config\.(ts|js|mjs)$/,
            /tailwind\.config\.(ts|js|mjs)$/,
            /postcss\.config\.(ts|js|mjs)$/,
            /eslint\.config\.(ts|js|mjs)$/
        ];

        for (const node of nodes) {
            const isImported = (importedByCount[node.id] || 0) > 0;
            const basename = path.basename(node.id);
            const isEntryPoint = ENTRY_POINT_PATTERNS.some(p => p.test(basename));
            
            if (!isImported && !isEntryPoint) {
                node.isOrphan = true;
            } else {
                node.isOrphan = false; // explicitly set
            }
        }
    }

    private detectWarnings(nodes: GraphNode[], edges: GraphEdge[]) {
        const importsCount: Record<string, number> = {};
        const importedByCount: Record<string, number> = {};

        for (const edge of edges) {
            importsCount[edge.source] = (importsCount[edge.source] || 0) + 1;
            importedByCount[edge.target] = (importedByCount[edge.target] || 0) + 1;
        }

        const ENTRY_POINT_PATTERNS = [
            /^index\.(ts|tsx|js|jsx|vue)$/, /^main\.(ts|tsx|js|jsx)$/,
            /^app\.(ts|tsx|js|jsx|vue)$/, /page\.(tsx|jsx|vue)$/,
            /layout\.(tsx|jsx|vue)$/, /route\.(ts|js)$/,
            /not-found\.(tsx|jsx)$/, /loading\.(tsx|jsx)$/,
            /error\.(tsx|jsx)$/, /sitemap\.(ts|js)$/,
            /robots\.(ts|js)$/, /cli\.(ts|js)$/,
            /vite\.config\.(ts|js)$/, /next\.config\.(ts|js|mjs)$/,
            /tailwind\.config\.(ts|js|mjs)$/, /postcss\.config\.(ts|js|mjs)$/,
            /eslint\.config\.(ts|js|mjs)$/
        ];

        for (const node of nodes) {
            const warnings: NodeWarning[] = [];
            const lines = node.lines || 0;
            const usedBy = importedByCount[node.id] || 0;
            const imports = importsCount[node.id] || 0;
            const basename = path.basename(node.id);
            const isEntryPoint = ENTRY_POINT_PATTERNS.some(p => p.test(basename));

            // God File: >500 lines AND >5 importers
            if (lines > 500 && usedBy > 5) {
                warnings.push({ type: 'god-file', severity: 'high',
                    message: `God File: ${lines} lines, used by ${usedBy} files` });
            } else if (lines > 800) {
                // Large File: >800 lines
                warnings.push({ type: 'large-file', severity: 'medium',
                    message: `Large file: ${lines} lines` });
            }
            // High Fan-out: >10 imports
            if (imports > 10) {
                warnings.push({ type: 'high-fan-out', severity: 'medium',
                    message: `High coupling: imports ${imports} files` });
            }
            // Dead Exports: has exports but nobody imports it (not entry point, not orphan)
            if (!isEntryPoint && (node.exports?.length || 0) > 0 && usedBy === 0 && !node.isOrphan) {
                warnings.push({ type: 'dead-exports', severity: 'low',
                    message: `Has ${node.exports!.length} exports but not imported by anyone` });
            }
            // Orphan
            if (node.isOrphan) {
                warnings.push({ type: 'orphan', severity: 'low',
                    message: 'Orphan: never imported, not an entry point' });
            }

            // Security & Logic Scanners (Basic Pattern matching)
            const filePath = path.join(path.resolve(edges.length > 0 ? '' : ''), node.id); // Not perfect, but we can check the file name or try reading contents if needed.
            // Since we have the file path, we can check basic strings.
            const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
            if (content) {
                if (/process\.env\.[a-zA-Z0-9_]+/.test(content) && !node.id.includes('.env') && !node.id.includes('config')) {
                    warnings.push({ type: 'env-leak' as any, severity: 'high', message: 'Potential Environment Variable Leak: direct process.env usage outside config files.' });
                }
                if (/innerHTML|v-html|dangerouslySetInnerHTML/.test(content)) {
                    warnings.push({ type: 'unsafe-dom' as any, severity: 'medium', message: 'Unsafe DOM manipulation detected (innerHTML / v-html / dangerouslySetInnerHTML).' });
                }
                if (/(password|secret|token)\s*=\s*['"][^'"]+['"]/.test(content)) {
                    warnings.push({ type: 'hardcoded-secret' as any, severity: 'high', message: 'Potential hardcoded secret or password detected.' });
                }
            }

            // High Git churn warning
            if (node.gitChanges && node.gitChanges > 20) {
                warnings.push({ type: 'high-churn' as any, severity: 'medium', message: `High Git Churn: Changed ${node.gitChanges} times recently.` });
            }

            if (warnings.length > 0) node.warnings = warnings;
        }
    }

    private detectFeatures(nodes: GraphNode[], edges: GraphEdge[]): FeatureCluster[] {
        // Build adjacency: source → [targets] (imports)
        const importsMap: Record<string, string[]> = {};
        for (const e of edges) {
            if (!importsMap[e.source]) importsMap[e.source] = [];
            importsMap[e.source]!.push(e.target);
        }

        // 1. Find entry points based on naming conventions or lack of incoming dependencies (in-degree 0)
        const ENTRY_PATTERNS = [
            /page\.(tsx?|jsx?|vue)$/i, 
            /layout\.(tsx?|jsx?|vue)$/i,
            /view\.(tsx?|jsx?|vue)$/i,
            /controller\.(ts|js)$/i,
            /route\.(ts|js)$/i,
            /^App\.(tsx?|jsx?|vue)$/i, 
            /^main\.(ts|js)$/i,
            /^index\.(ts|tsx|js|jsx|vue)$/i,
            /(views|pages|routes|controllers|features)\/[^\/]+\.(vue|tsx?|jsx?|ts|js)$/i,
            /(views|pages|routes|controllers|features)\/[^\/]+\/index\.(vue|tsx?|jsx?|ts|js)$/i
        ];
        
        // Find nodes that match entry patterns
        let entryNodes = nodes.filter(n => {
            const basename = path.basename(n.id);
            // Also check full path for directory-based patterns
            return ENTRY_PATTERNS.some(p => p.test(basename) || p.test(n.id));
        });

        // If no entry patterns match, fallback to finding nodes with in-degree = 0 (no imports point to them)
        if (entryNodes.length === 0) {
            const importedFiles = new Set<string>();
            edges.forEach(e => importedFiles.add(e.target));
            entryNodes = nodes.filter(n => !importedFiles.has(n.id) && !n.id.includes('.test.') && !n.id.includes('.spec.'));
        }

        // 2. BFS from each entry point → collect transitive deps
        const getTransitiveDeps = (startId: string): Set<string> => {
            const visited = new Set<string>();
            const queue = [startId];
            while (queue.length > 0) {
                const curr = queue.shift()!;
                if (visited.has(curr)) continue;
                visited.add(curr);
                for (const dep of (importsMap[curr] || [])) {
                    if (!visited.has(dep)) queue.push(dep);
                }
            }
            return visited;
        };

        // 3. Group entry points by logical feature name
        const getFeatureName = (entryPath: string) => {
            const basename = path.basename(entryPath);
            const dirname = path.dirname(entryPath);
            
            let prefix = '';
            if (entryPath.includes('/(customer)/')) prefix = 'Customer - ';
            else if (entryPath.includes('/admin/')) prefix = 'Admin - ';
            else if (entryPath.includes('/api/')) prefix = 'API - ';
            
            // If it's a page/layout inside a folder (e.g. app/cart/page.tsx -> cart)
            if (/^(page|layout|index|route|controller)\./i.test(basename)) {
                const parts = dirname.split('/');
                let name: string | undefined = parts[parts.length - 1];
                // if it's dynamic like [id], combine with parent
                if (name && name.startsWith('[') && parts.length > 1) {
                    name = parts[parts.length - 2] + '/' + name;
                }
                // if the name is just "app" or "pages" or "src", it's the root/core feature
                if (name && ['app', 'pages', 'src', '.', '', 'views', 'controllers', 'routes', 'features'].includes(name.toLowerCase())) return prefix + 'core';
                return prefix + (name || 'core');
            }
            
            // If it's a direct file like pages/tracking.tsx -> tracking
            let name: string | undefined = basename.split('.')[0];
            if (name && (name.toLowerCase() === 'app' || name.toLowerCase() === 'main')) return prefix + 'core';
            
            // Remove common suffixes for cleaner names (e.g. TrackingView -> Tracking)
            if (name) name = name.replace(/(View|Page|Controller|Route)$/i, '');
            return prefix + (name || 'core');
        };

        const featureClusters: Record<string, { entries: string[], allFiles: Set<string> }> = {};
        for (const entry of entryNodes) {
            const featureName = getFeatureName(entry.id);
            const cluster = featureClusters[featureName] || { entries: [], allFiles: new Set() };
            featureClusters[featureName] = cluster;
            cluster.entries.push(entry.id);
            const deps = getTransitiveDeps(entry.id);
            deps.forEach(d => cluster.allFiles.add(d));
        }

        const clusterValues = Object.values(featureClusters);
        const totalFiles = nodes.length;
        
        // Remove 'core' from threshold evaluation so it doesn't trigger the fallback unnecessarily
        const nonCoreClusters = Object.entries(featureClusters).filter(([k]) => k !== 'core').map(e => e[1]);
        
        const needsFallback = nonCoreClusters.length === 0 && (clusterValues.length <= 2 ||
            (clusterValues.length > 0 && Math.max(...clusterValues.map(c => c.allFiles.size)) > totalFiles * 0.9));

        if (needsFallback && totalFiles > 5) {
            const dirGroups: Record<string, string[]> = {};
            for (const node of nodes) {
                const topDir = node.id.split('/').slice(0, 2).join('/') || 'root';
                if (!dirGroups[topDir]) dirGroups[topDir] = [];
                dirGroups[topDir].push(node.id);
            }

            const features: FeatureCluster[] = [];
            for (const [dir, files] of Object.entries(dirGroups)) {
                if (files.length < 2) continue;
                const name = dir.split('/').pop() || dir;
                const totalLines = files.reduce((sum, fid) => {
                    const n = nodes.find(nd => nd.id === fid);
                    return sum + (n?.lines || 0);
                }, 0);
                features.push({
                    id: dir.replace(/[^a-zA-Z0-9]/g, '-'),
                    name: name.charAt(0).toUpperCase() + name.slice(1),
                    entryPoints: [],
                    files,
                    sharedFiles: [],
                    totalLines,
                });
            }
            return features.sort((a, b) => b.files.length - a.files.length);
        }

        // 5. Build features from entry-point clusters
        const allClusterFiles = new Map<string, number>();
        for (const c of clusterValues) {
            c.allFiles.forEach(f => allClusterFiles.set(f, (allClusterFiles.get(f) || 0) + 1));
        }
        const sharedThreshold = Math.max(2, Math.ceil(clusterValues.length * 0.6));

        const features: FeatureCluster[] = [];
        for (const [featureName, cluster] of Object.entries(featureClusters)) {
            const files = Array.from(cluster.allFiles);
            // Skip core if there are other features, or keep it as a baseline
            if (featureName === 'core' && nonCoreClusters.length > 0) continue;
            
            if (files.length < 2 && featureName !== 'core') continue;
            
            const shared = files.filter(f => (allClusterFiles.get(f) || 0) >= sharedThreshold);
            const totalLines = files.reduce((sum, fid) => {
                const n = nodes.find(nd => nd.id === fid);
                return sum + (n?.lines || 0);
            }, 0);
            
            features.push({
                id: featureName.replace(/[^a-zA-Z0-9]/g, '-'),
                name: featureName.charAt(0).toUpperCase() + featureName.slice(1),
                entryPoints: cluster.entries,
                files,
                sharedFiles: shared,
                totalLines,
            });
        }

        return features.sort((a, b) => b.files.length - a.files.length);
    }

    private getTransitiveImporters(fileId: string, importedByMap: Record<string, string[]>, visited = new Set<string>()): Set<string> {
        if (visited.has(fileId)) return visited;
        visited.add(fileId);
        const importers = importedByMap[fileId] || [];
        for (const imp of importers) {
            this.getTransitiveImporters(imp, importedByMap, visited);
        }
        return visited;
    }

    private shortName(fileId: string): string {
        let s = fileId.replace(/^src\//, '');
        s = s.replace(/\.(tsx?|jsx?|ts|js)$/, '');
        s = s.replace(/^components\//, 'c/');
        s = s.replace(/^app\/\([^)]+\)\//, '');
        s = s.replace(/^app\//, '');
        return s;
    }

    private buildMaps(graph: ProjectGraph): { importsMap: Record<string, string[]>, importedByMap: Record<string, string[]> } {
        const importsMap: Record<string, string[]> = {};
        const importedByMap: Record<string, string[]> = {};
        for (const e of graph.edges) {
            if (!importsMap[e.source]) importsMap[e.source] = [];
            importsMap[e.source]!.push(e.target);
            if (!importedByMap[e.target]) importedByMap[e.target] = [];
            importedByMap[e.target]!.push(e.source);
        }
        return { importsMap, importedByMap };
    }

    private generateMdDependencies(graph: ProjectGraph): string {
        const { importsMap, importedByMap } = this.buildMaps(graph);
        const sortedNodes = [...graph.nodes].sort((a, b) => {
            const countA = (importedByMap[a.id] || []).length;
            const countB = (importedByMap[b.id] || []).length;
            return countB - countA;
        });

        let md = `# 📂 FILE DEPENDENCIES MAP (AST Parsed)\n\n`;
        md += `> **Auto-generated** by Tool using \`ts-morph\`\n`;
        md += `> **Files**: ${graph.nodes.length} | **Import links**: ${graph.edges.length}\n\n`;
        md += `---\n\n`;

        // Add circular dependencies section if any
        const circularEdges = graph.edges.filter(e => e.isCircular);
        if (circularEdges.length > 0) {
            md += `## ⚠️ CIRCULAR DEPENDENCIES DETECTED\n\n`;
            md += `*Lưu ý: Các file này đang import chéo lẫn nhau, có thể gây lỗi runtime hoặc khó maintain.*\n\n`;
            circularEdges.forEach(e => {
                md += `- \`${e.source}\` 🔄 \`${e.target}\`\n`;
            });
            md += `\n---\n\n`;
        }

        md += `## 🎯 IMPACT SUMMARY — Top 20 Most-Imported Files\n\n`;
        md += `| # | File | Category | Direct Importers | Transitive Impact | Exported Symbols |\n`;
        md += `|---|------|----------|-----------------|-------------------|------------------|\n`;

        sortedNodes.slice(0, 20).forEach((n, i) => {
            const directCount = (importedByMap[n.id] || []).length;
            const transitiveSet = this.getTransitiveImporters(n.id, importedByMap);
            transitiveSet.delete(n.id);
            const exportNames = (n.exports || []).map(ex => ex.name).join(', ');
            md += `| ${i + 1} | \`${n.id}\` | ${n.category} | ${directCount} | ${transitiveSet.size} | ${exportNames.length > 50 ? exportNames.substring(0, 50) + '...' : exportNames || '-'} |\n`;
        });

        return md;
    }

    private generateAiMap(graph: ProjectGraph): string {
        const { importsMap, importedByMap } = this.buildMaps(graph);
        let aiMap = `# AI CONTEXT FILE MAP — Detailed Dependency Reference\n\n`;
        aiMap += `Đây là bản đồ file của dự án. AI (như Cursor/Antigravity) sử dụng file này để hiểu context.\n\n`;
        
        const sortedNodes = [...graph.nodes].sort((a, b) => {
            const countA = (importedByMap[a.id] || []).length;
            const countB = (importedByMap[b.id] || []).length;
            return countB - countA;
        });

        for (const n of sortedNodes) {
            const fileImportedBy = importedByMap[n.id] || [];
            const fileImports = importsMap[n.id] || [];
            if (fileImportedBy.length === 0 && fileImports.length === 0 && (!n.exports || n.exports.length === 0)) continue;

            const sn = this.shortName(n.id);
            aiMap += `### \`${n.id}\` (${n.category})\n`;
            if (n.exports && n.exports.length > 0) {
                const exportsStr = n.exports.map(e => `${e.type} ${e.name}`).join(', ');
                aiMap += `- **Exports**: ${exportsStr}\n`;
            }
            
            if (fileImportedBy.length > 0) {
                const transitiveSet = this.getTransitiveImporters(n.id, importedByMap);
                transitiveSet.delete(n.id);
                const importerNames = fileImportedBy.map(f => this.shortName(f));
                aiMap += `- **Imported by**: [${importerNames.join(', ')}] (${fileImportedBy.length} direct, ${transitiveSet.size} transitive)\n`;
            }
            if (fileImports.length > 0) {
                const depNames = fileImports.map(f => this.shortName(f));
                aiMap += `- **Imports**: [${depNames.join(', ')}]\n`;
            }
            aiMap += '\n';
        }
        return aiMap;
    }

    private getGitHeatmap(targetDir: string): Record<string, number> {
        const heatmap: Record<string, number> = {};
        try {
            // Get files changed in the last 100 commits
            const output = execSync('git log -n 100 --name-only --format=""', { cwd: targetDir, encoding: 'utf-8', stdio: 'pipe' });
            const files = output.split('\n').map((f: string) => f.trim()).filter((f: string) => f);
            for (const f of files) {
                // Normalize path
                const normalized = f.replace(/\\/g, '/');
                heatmap[normalized] = (heatmap[normalized] || 0) + 1;
            }
        } catch (e) {
            // Not a git repo or git not installed, ignore quietly
        }
        return heatmap;
    }
}
