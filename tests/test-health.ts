import { StorageService } from './src/services/StorageService';
import path from 'path';
import os from 'os';

(async () => {
    // The graph was saved by CLI to tool cache
    const TOOL_DIR = path.resolve(__dirname, '.');
    const storage = new StorageService(TOOL_DIR);
    const graph = await storage.loadGraphFromToolDir();
    if (!graph) { console.log('No graph found in', TOOL_DIR); process.exit(1); }

    const circularDeps = graph.edges.filter(e => e.isCircular).map(e => ({ from: e.source, to: e.target }));
    const orphanFiles = graph.nodes.filter(n => n.isOrphan).map(n => ({ file: n.id, lines: n.lines || 0, category: n.category }));
    const GOD_FILE_THRESHOLD = 400;
    const godFiles = graph.nodes.filter(n => (n.lines || 0) > GOD_FILE_THRESHOLD).map(n => {
        const fanOut = graph.edges.filter(e => e.source === n.id).length;
        const fanIn = graph.edges.filter(e => e.target === n.id).length;
        return { file: n.id, lines: n.lines, category: n.category, fanOut, fanIn };
    }).sort((a, b) => (b.lines || 0) - (a.lines || 0));

    const warnings: any[] = [];
    for (const node of graph.nodes) {
        if (node.warnings && node.warnings.length > 0) {
            warnings.push({ file: node.id, warnings: node.warnings });
        }
    }

    const deadExportFiles: any[] = [];
    for (const node of graph.nodes) {
        if (!node.exports || node.exports.length === 0) continue;
        if (['config', 'page', 'layout', 'api'].includes(node.category)) continue;
        const importers = graph.edges.filter(e => e.target === node.id);
        if (importers.length === 0) {
            deadExportFiles.push({ file: node.id, lines: node.lines, exportCount: node.exports.length, category: node.category });
        }
    }

    const impactMap = new Map<string, number>();
    for (const edge of graph.edges) {
        impactMap.set(edge.target, (impactMap.get(edge.target) || 0) + 1);
    }
    const highImpact = Array.from(impactMap.entries()).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const healthScore = Math.max(0, 100 - (circularDeps.length * 15) - (orphanFiles.length * 2) - (godFiles.length * 5) - (warnings.filter(w => w.warnings.some((ww: any) => ww.severity === 'high')).length * 10) - (deadExportFiles.length * 3));

    console.log(`\n=== HEALTH REPORT: ${graph.projectRoot} ===`);
    console.log(`Total files: ${graph.nodes.length} | Edges: ${graph.edges.length} | Score: ${healthScore}/100`);
    console.log(`\n🔄 Circular Deps (${circularDeps.length}):`);
    circularDeps.forEach(c => console.log(`  ${c.from} ↔ ${c.to}`));
    console.log(`\n👻 Orphan Files (${orphanFiles.length}):`);
    orphanFiles.forEach(o => console.log(`  ${o.file} (${o.lines} lines, ${o.category})`));
    console.log(`\n🐘 God Files (${godFiles.length}):`);
    godFiles.forEach(g => console.log(`  ${g.file} (${g.lines} lines, fanIn:${g.fanIn} fanOut:${g.fanOut})`));
    console.log(`\n☠️ Dead Export Files (${deadExportFiles.length}):`);
    deadExportFiles.forEach(d => console.log(`  ${d.file} (${d.lines} lines, ${d.exportCount} exports, ${d.category})`));
    console.log(`\n⚠️ Warnings (${warnings.length} files):`);
    warnings.forEach(w => console.log(`  ${w.file}: ${w.warnings.map((ww: any) => `${ww.type}(${ww.severity})`).join(', ')}`));
    console.log(`\n🎯 High Impact (${highImpact.length}):`);
    highImpact.forEach(([file, count]) => console.log(`  ${file} ← ${count} importers`));

    process.exit(0);
})();
