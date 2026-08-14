const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function speak(brain, message) {
    try {
        const speakScript = path.resolve(__dirname, 'speak.cjs');
        execSync(`node "${speakScript}" ${brain} "${message.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    } catch (e) {
        console.error("Speak failed", e);
    }
}

function finishTask(message) {
    try {
        const finishScript = path.resolve(__dirname, 'finish_task.js');
        execSync(`node "${finishScript}" "${message.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    } catch (e) {
        console.error("Finish task failed", e);
    }
}

speak('Architect', 'Starting FAIS Brains Manual Evolution Sequence...');

// 1. Trigger the Laravel export command to harvest data
speak('Senior_Dev', 'Harvesting daily experiences and mistakes from the Memory Vault...');
try {
    const projectRoot = path.resolve(__dirname, '..');
    execSync('php artisan fais:export-evolution --output=storage/logs/evolution_data.json', { stdio: 'pipe', cwd: projectRoot });
} catch (e) {
    const errorMsg = "Failed to export evolution data. " + e.message;
    fs.writeFileSync(path.resolve(__dirname, '..', 'storage', 'logs', 'evolution_error.log'), errorMsg + '\\n' + (e.stdout ? e.stdout.toString() : '') + '\\n' + (e.stderr ? e.stderr.toString() : ''));
    finishTask(errorMsg);
    process.exit(1);
}

const dataPath = path.resolve(__dirname, '..', 'storage', 'logs', 'evolution_data.json');
const skillsDir = path.resolve(__dirname, '..', 'Docs', 'Skills');

if (!fs.existsSync(dataPath)) {
    console.error("Required data files are missing.");
    process.exit(1);
}

if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

speak('Architect', `Loaded ${data.count} recent memories for mining.`);

if (data.count === 0) {
    finishTask("No new memories to learn from today. Evolution sequence completed.");
    process.exit(0);
}

// 2. Extract context
const lessons = data.memories
    .filter(m => m.message && (m.message.includes('ERROR') || m.brain === 'SYSTEM' || m.message.includes('Mistake')))
    .map(m => `- [${m.brain}]: ${m.message.substring(0, 100)}...`)
    .join('\n');

if (!lessons) {
    speak('Architect', "No errors or explicit mistakes found in recent memory. Proceeding with general structural review.");
} else {
    speak('Architect', 'Mining the following recent friction points for rule improvements:\n' + lessons.substring(0, 200) + '...');
}

// 3. Evolve into modular Obsidian Skills (Mocked/Static for safety without an API key)
speak('Senior_Dev', 'Simulating LLM SkillOpt consolidation and replay into Obsidian Markdown...');
setTimeout(() => {
    // Generate a file name based on the topic
    const topic = 'React_UI_Contrast';
    const newSkillPath = path.join(skillsDir, `${topic}.md`);
    
    // Create the modular skill file
    const skillContent = `---
type: skill
tags: [react, ui, contrast]
date: ${new Date().toISOString().split('T')[0]}
---

# ${topic}

## Context
When refactoring complex React layouts, critical buttons (like 'New Chat') often lose visibility due to Tailwind class overrides.

## The Rule
The team MUST proactively check UI contrast and visibility of critical buttons when refactoring complex React layouts. Always use established contrast colors from the design system.

## Verification
Before completing a task, check the browser render to ensure primary buttons have at least a 4.5:1 contrast ratio against their background.
`;
    
    fs.writeFileSync(newSkillPath, skillContent);
    finishTask(`Evolution complete! Created a new Obsidian skill file at Docs/Skills/${topic}.md. Diff is ready for your manual review before commit.`);
}, 2000);
