import fs from 'fs';
import path from 'path';
import ignore, { Ignore } from 'ignore';

export class IgnoreService {
    private ig: Ignore;
    private rootDir: string;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.ig = ignore();
        
        // Luôn loại trừ các thư mục nhạy cảm và rác
        this.ig.add(['.git', 'node_modules', 'dist', 'build', '.ai_cache', '.next', 'out', 'coverage']);

        this.loadGitignore();
    }

    private loadGitignore() {
        const gitignorePath = path.join(this.rootDir, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            this.ig.add(content);
        }
    }

    /**
     * Checks if a file path should be ignored.
     * The path should be relative to the rootDir.
     */
    public isIgnored(relativePath: string): boolean {
        return this.ig.ignores(relativePath);
    }
}
