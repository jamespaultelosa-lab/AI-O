const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const LOCAL_MEMORY_DIR = path.join(ROOT_DIR, 'storage', 'app', 'memory');
const OBSIDIAN_ROOT = process.env.OBSIDIAN_VAULT_PATH || null;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function memoryPath(filename) {
    ensureDir(LOCAL_MEMORY_DIR);
    return path.join(LOCAL_MEMORY_DIR, filename);
}

function loadJson(file, defaultValue = []) {
    try {
        if (!fs.existsSync(file)) return defaultValue;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return defaultValue;
    }
}

function saveJson(file, data) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Record a mistake, root cause, and lesson learned into persistent memory.
 */
function recordMistake({ brain, task, error, rootCause, fix, lesson }) {
    const mistakesFile = memoryPath('mistakes_log.json');
    const mistakes = loadJson(mistakesFile, []);

    const entry = {
        id: `MST-${String(mistakes.length + 1).padStart(3, '0')}`,
        timestamp: new Date().toISOString(),
        brain: brain || 'Senior_Dev',
        task: String(task || '').slice(0, 200),
        error: String(error || '').slice(0, 300),
        root_cause: rootCause || 'Execution mismatch',
        fix: fix || 'Applied corrective patch',
        lesson: lesson || 'Verify environment and dependencies before execution',
    };

    mistakes.unshift(entry);
    saveJson(mistakesFile, mistakes.slice(0, 100));

    // Also mirror to Obsidian vault if configured
    if (OBSIDIAN_ROOT && fs.existsSync(OBSIDIAN_ROOT)) {
        try {
            const obsFile = path.join(OBSIDIAN_ROOT, 'Mistakes Log.md');
            const mdEntry = `\n### [${entry.id}] ${entry.timestamp} — ${entry.brain}\n- **Task**: ${entry.task}\n- **Error**: ${entry.error}\n- **Root Cause**: ${entry.root_cause}\n- **Fix**: ${entry.fix}\n- **Lesson**: ${entry.lesson}\n`;
            fs.appendFileSync(obsFile, mdEntry, 'utf8');
        } catch { /* Vault write optional */ }
    }

    return entry;
}

/**
 * Record a learned insight or pattern into persistent brain memory.
 */
function recordLearning(brain, observation, rule) {
    const learningsFile = memoryPath(`learnings_${brain.toLowerCase()}.json`);
    const learnings = loadJson(learningsFile, []);

    const entry = {
        timestamp: new Date().toISOString(),
        brain,
        observation: String(observation || '').slice(0, 300),
        rule: String(rule || '').slice(0, 300),
    };

    // Avoid duplicate rules
    if (!learnings.some((l) => l.rule.toLowerCase() === entry.rule.toLowerCase())) {
        learnings.unshift(entry);
        saveJson(learningsFile, learnings.slice(0, 50));
    }

    return entry;
}

/**
 * Retrieve relevant memory context for a given task and brain.
 */
function retrieveMemoryContext(brain, taskText) {
    const text = String(taskText || '').toLowerCase();
    const mistakesFile = memoryPath('mistakes_log.json');
    const mistakes = loadJson(mistakesFile, []);
    const learningsFile = memoryPath(`learnings_${brain.toLowerCase()}.json`);
    const learnings = loadJson(learningsFile, []);

    const relevantMistakes = mistakes
        .filter((m) => text.split(/\s+/).some((w) => w.length > 3 && (m.task.toLowerCase().includes(w) || m.error.toLowerCase().includes(w))))
        .slice(0, 3);

    const relevantLearnings = learnings.slice(0, 5);

    const memoryBlocks = [];

    if (relevantMistakes.length > 0) {
        memoryBlocks.push(`[PAST MISTAKES & LESSONS LEARNED]\n` +
            relevantMistakes.map((m) => `- Mistake on "${m.task}": ${m.lesson} (Fix: ${m.fix})`).join('\n'));
    }

    if (relevantLearnings.length > 0) {
        memoryBlocks.push(`[ESTABLISHED KNOWLEDGE & RULES]\n` +
            relevantLearnings.map((l) => `- Rule: ${l.rule} (Observed: ${l.observation})`).join('\n'));
    }

    return memoryBlocks.join('\n\n');
}

module.exports = {
    recordMistake,
    recordLearning,
    retrieveMemoryContext,
    LOCAL_MEMORY_DIR,
};
