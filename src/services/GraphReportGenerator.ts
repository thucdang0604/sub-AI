/**
 * GraphReportGenerator — Markdown report + AI map generation
 * 
 * Extracted from GraphAnalyzerService.ts (Issue #9 God File refactor)
 * Handles: MD dependency reports, AI context maps, feature detection
 */

import path from 'path';
import { ProjectGraph, GraphNode, GraphEdge, FeatureCluster } from '../domain/types';

// ─── Utility Helpers ───

export function getTransitiveImporters(fileId: string, importedByMap: Record<string, string[]>, visited = new Set<string>()): Set<string> {
    if (visited.has(fileId)) return visited;
    visited.add(fileId);
    const importers = importedByMap[fileId] || [];
    for (const imp of importers) {
        getTransitiveImporters(imp, importedByMap, visited);
    }
    return visited;
}

export function shortName(fileId: string): string {
    let s = fileId.replace(/^src\//, '');
    s = s.replace(/\.(tsx?|jsx?|ts|js)$/, '');
    s = s.replace(/^components\//, 'c/');
    s = s.replace(/^app\/\([^)]+\)\//, '');
    s = s.replace(/^app\//, '');
    return s;
}

export function buildMaps(graph: ProjectGraph): { importsMap: Record<string, string[]>, importedByMap: Record<string, string[]> } {
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

// ─── Report Generators ───

export function generateMdDependencies(graph: ProjectGraph): string {
    const { importsMap, importedByMap } = buildMaps(graph);
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
        const transitiveSet = getTransitiveImporters(n.id, importedByMap);
        transitiveSet.delete(n.id);
        const exportNames = (n.exports || []).map(ex => ex.name).join(', ');
        md += `| ${i + 1} | \`${n.id}\` | ${n.category} | ${directCount} | ${transitiveSet.size} | ${exportNames.length > 50 ? exportNames.substring(0, 50) + '...' : exportNames || '-'} |\n`;
    });

    return md;
}

export function generateAiMap(graph: ProjectGraph): string {
    const { importsMap, importedByMap } = buildMaps(graph);
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

        const sn = shortName(n.id);
        aiMap += `### \`${n.id}\` (${n.category})\n`;
        if (n.exports && n.exports.length > 0) {
            const exportsStr = n.exports.map(e => `${e.type} ${e.name}`).join(', ');
            aiMap += `- **Exports**: ${exportsStr}\n`;
        }
        
        if (fileImportedBy.length > 0) {
            const transitiveSet = getTransitiveImporters(n.id, importedByMap);
            transitiveSet.delete(n.id);
            const importerNames = fileImportedBy.map(f => shortName(f));
            aiMap += `- **Imported by**: [${importerNames.join(', ')}] (${fileImportedBy.length} direct, ${transitiveSet.size} transitive)\n`;
        }
        if (fileImports.length > 0) {
            const depNames = fileImports.map(f => shortName(f));
            aiMap += `- **Imports**: [${depNames.join(', ')}]\n`;
        }
        aiMap += '\n';
    }
    return aiMap;
}

// ─── Feature Detection ───

export function detectFeatures(nodes: GraphNode[], edges: GraphEdge[]): FeatureCluster[] {
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
