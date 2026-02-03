import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '../../..'); // Go up from server/src/scripts
const outputFile = path.join(rootDir, 'ghostly_codebase_dump.txt');

const ignorePatterns = [
    'node_modules',
    '.git',
    '.venv',
    'venv',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.DS_Store',
    '.env',
    'gender_net.caffemodel', // Binary
    'opencv_face_detector_uint8.pb', // Binary 
    'uploaded_media',
    '.gemini'
];

const includeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml', '.dockerfile', 'Dockerfile'
];

function shouldIgnore(entryName: string) {
    return ignorePatterns.some(pattern => entryName.includes(pattern));
}

function isTextFile(filePath: string) {
    const ext = path.extname(filePath);
    return includeExtensions.includes(ext) || filePath.endsWith('Dockerfile') || filePath.endsWith('.gitignore');
}

function walkDir(dir: string, fileList: string[] = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        if (shouldIgnore(file)) continue;

        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            if (isTextFile(filePath)) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

const allFiles = walkDir(rootDir);
let outputContent = `# Ghostly Codebase Dump\n# Generated on ${new Date().toISOString()}\n\n`;

console.log(`Scanning ${rootDir}...`);

allFiles.forEach(file => {
    const relativePath = path.relative(rootDir, file);
    // Double check ignore for full path (e.g. nested node_modules)
    if (shouldIgnore(relativePath)) return;

    try {
        const content = fs.readFileSync(file, 'utf-8');
        outputContent += `================================================================================\n`;
        outputContent += `FILE: ${relativePath}\n`;
        outputContent += `================================================================================\n`;
        outputContent += content + `\n\n`;
        console.log(`Added: ${relativePath}`);
    } catch (e) {
        console.error(`Error reading ${file}:`, e);
    }
});

fs.writeFileSync(outputFile, outputContent);
console.log(`\nReport generated at: ${outputFile}`);
console.log(`Total files: ${allFiles.length}`);
