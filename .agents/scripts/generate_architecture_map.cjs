const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TARGET_ROOT = 'C:\\Projects\\fais-payroll-srs';
const OUTPUT_JSON = path.join(PROJECT_ROOT, '.agents/architecture_map.json');
const OUTPUT_MD = 'C:\\Users\\ICTDO-James\\Documents\\Fais Project\\FAIS\\ARCHITECTURE.md';

function scanDirectory(dir, fileList = [], filterExt = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            fileList = scanDirectory(fullPath, fileList, filterExt);
        } else {
            if (filterExt.length === 0 || filterExt.some(ext => file.endsWith(ext))) {
                fileList.push(fullPath);
            }
        }
    }
    return fileList;
}

function getRelativePath(fullPath) {
    return path.relative(TARGET_ROOT, fullPath).replace(/\\/g, '/');
}

function analyzePHPFiles(subDir, typeName) {
    const targetDir = path.join(TARGET_ROOT, subDir);
    const files = scanDirectory(targetDir, [], ['.php']);
    return files.map(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const methods = [];
        const matches = content.matchAll(/function\s+([a-zA-Z0-9_]+)\s*\(/g);
        for (const match of matches) {
            if (!['__construct', 'boot', 'up', 'down'].includes(match[1])) {
                methods.push(match[1]);
            }
        }
        return {
            path: getRelativePath(file),
            type: typeName,
            name: path.basename(file, '.php'),
            methods: methods.slice(0, 10)
        };
    });
}

function analyzeReactComponents() {
    const pagesDir = path.join(TARGET_ROOT, 'resources/js/Pages');
    const compDir = path.join(TARGET_ROOT, 'resources/js/Components');
    const files = [
        ...scanDirectory(pagesDir, [], ['.tsx', '.jsx']),
        ...scanDirectory(compDir, [], ['.tsx', '.jsx'])
    ];
    
    return files.map(file => {
        return {
            path: getRelativePath(file),
            type: file.includes('Pages') ? 'Page' : 'Component',
            name: path.basename(file, path.extname(file))
        };
    });
}

function runScanner() {
    console.log("Scanning full project architecture map...");
    
    const architecture = {
        models: analyzePHPFiles('app/Models', 'Model'),
        controllers: analyzePHPFiles('app/Http/Controllers', 'Controller'),
        services: analyzePHPFiles('app/Services', 'Service'),
        events: analyzePHPFiles('app/Events', 'Event'),
        react: analyzeReactComponents(),
        migrations: analyzePHPFiles('database/migrations', 'Migration'),
        scanned_at: new Date().toISOString()
    };

    // Write JSON map
    if (!fs.existsSync(path.dirname(OUTPUT_JSON))) {
        fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
    }
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(architecture, null, 2));
    console.log(`Wrote JSON map to ${OUTPUT_JSON}`);

    // Generate Markdown for Obsidian Vault
    let mdContent = `# Project Architecture Map\n\n`;
    mdContent += `*Last updated: ${architecture.scanned_at}*\n\n`;
    mdContent += `Total Scanned Components: ${architecture.models.length + architecture.controllers.length + architecture.services.length + architecture.react.length}\n\n`;

    mdContent += `## Controllers\n`;
    architecture.controllers.forEach(c => {
        mdContent += `- **${c.name}** (\`${c.path}\`)\n`;
    });

    mdContent += `\n## Services\n`;
    architecture.services.forEach(s => {
        mdContent += `- **${s.name}** (\`${s.path}\`)\n`;
    });

    mdContent += `\n## Database Models\n`;
    architecture.models.forEach(m => {
        mdContent += `- **${m.name}** (\`${m.path}\`)\n`;
    });

    if (fs.existsSync(OUTPUT_MD)) {
        let existingContent = fs.readFileSync(OUTPUT_MD, 'utf-8');
        const startTag = '<!-- GSD:architecture-start source:ARCHITECTURE.md -->';
        const endTag = '<!-- GSD:architecture-end -->';
        
        if (existingContent.includes(startTag) && existingContent.includes(endTag)) {
            const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'm');
            existingContent = existingContent.replace(regex, `${startTag}\n\n${mdContent}\n${endTag}`);
            fs.writeFileSync(OUTPUT_MD, existingContent);
        } else {
            fs.appendFileSync(OUTPUT_MD, `\n\n${mdContent}`);
        }
    } else {
        fs.writeFileSync(OUTPUT_MD, mdContent);
    }
    
    console.log(`Updated Obsidian Vault at ${OUTPUT_MD}`);
}

runScanner();
