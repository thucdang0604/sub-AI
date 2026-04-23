import { Project } from 'ts-morph';
import path from 'path';
import fs from 'fs';

const projectRoot = 'm:/QLCH_VanLanh';
const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
const tsConfigRaw = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'));
const tsPaths = tsConfigRaw.compilerOptions?.paths;

// Approach: DON'T use tsConfigFilePath, pass everything via compilerOptions
const project = new Project({
    compilerOptions: {
        allowJs: true,
        resolveJsonModule: true,
        baseUrl: projectRoot,
        paths: tsPaths || {},
    },
    skipAddingFilesFromTsConfig: true,
});

const testFile = path.join(projectRoot, 'src/app/admin/products/page.tsx');
const toastFile = path.join(projectRoot, 'src/lib/toast.ts');
const ufFile = path.join(projectRoot, 'src/lib/useFirestore.ts');
project.addSourceFileAtPath(testFile);
project.addSourceFileAtPath(toastFile);
project.addSourceFileAtPath(ufFile);

const sf = project.getSourceFile(testFile)!;
for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    const resolved = imp.getModuleSpecifierSourceFile();
    if (spec.startsWith('@/')) {
        console.log(`${spec} => ${resolved ? 'OK: ' + path.relative(projectRoot, resolved.getFilePath()) : 'NULL'}`);
    }
}
process.exit(0);
