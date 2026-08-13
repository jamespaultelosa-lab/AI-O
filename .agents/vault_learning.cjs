const fs = require('fs');
const path = require('path');

const ROLE_DIRECTORIES = {
    Architect: 'Architect',
    Security: 'Security',
    Senior_Dev: 'Senior_Dev',
    Junior_Dev: 'Junior_Dev',
};
const MAX_CONTEXT_CHARS = 12000;
const MAX_LEARNING_CHARS = 700;
const ENGINEERING_PLAYBOOK = path.join(__dirname, 'brain_engineering_playbook.md');
const LEARNING_PATTERN = /\[\[VAULT_LEARNING:\s*(Observation:\s*[^|\]]+)\|\s*(Evidence:\s*[^|\]]+)\|\s*(Rule:\s*[^\]]+)\]\]/i;
const SECRET_PATTERN = /(?:api[_ -]?key|secret|password|token|authorization:\s*bearer|private key)/i;

function vaultRoot() {
    return process.env.OBSIDIAN_VAULT_PATH || null;
}

function readBounded(file, remaining) {
    try {
        return fs.readFileSync(file, 'utf8').slice(0, remaining);
    } catch {
        return '';
    }
}

function loadVaultContext(brain) {
    const playbook = readBounded(ENGINEERING_PLAYBOOK, 6000);
    const root = vaultRoot();
    const roleDirectory = ROLE_DIRECTORIES[brain];
    if (!root || !roleDirectory || !fs.existsSync(root)) return playbook;

    const files = [
        path.join(root, 'Global_Context', 'Consciousness_Protocol.md'),
        path.join(root, 'Brains', roleDirectory, 'Persona.md'),
        path.join(root, 'Brains', roleDirectory, 'Rules.md'),
        path.join(root, 'Brains', roleDirectory, 'Design_Principles.md'),
        path.join(root, 'Brains', roleDirectory, 'Vulnerability_Checks.md'),
        path.join(root, 'Brains', roleDirectory, 'Review_Checklist.md'),
        path.join(root, 'Brains', roleDirectory, 'Learnings.md'),
        path.join(root, 'Brains', roleDirectory, 'Mistakes.md'),
    ];
    const sections = [];
    let remaining = MAX_CONTEXT_CHARS - playbook.length;
    if (playbook.trim()) sections.push(`Source: ${path.basename(ENGINEERING_PLAYBOOK)}\n${playbook.trim()}`);
    for (const file of files) {
        if (remaining <= 0 || !fs.existsSync(file)) continue;
        const content = readBounded(file, remaining);
        if (!content.trim()) continue;
        sections.push(`Source: ${path.basename(file)}\n${content.trim()}`);
        remaining -= content.length;
    }
    return sections.join('\n\n---\n\n');
}

function stripLearningDirective(message) {
    return String(message || '').replace(LEARNING_PATTERN, '').trim();
}

function captureLearning(brain, message) {
    const root = vaultRoot();
    const roleDirectory = ROLE_DIRECTORIES[brain];
    const match = String(message || '').match(LEARNING_PATTERN);
    if (!root || !roleDirectory || !match) return { written: false, reason: 'no-learning' };

    const learning = match.slice(1).map((part) => part.trim()).join(' | ');
    if (learning.length > MAX_LEARNING_CHARS || SECRET_PATTERN.test(learning)) {
        return { written: false, reason: 'unsafe-learning' };
    }

    try {
        const file = path.join(root, 'Brains', roleDirectory, 'Learnings.md');
        let existing = '';
        try { existing = fs.readFileSync(file, 'utf8'); } catch { existing = `# ${brain} Learnings\n`; }
        if (existing.toLowerCase().includes(learning.toLowerCase())) {
            return { written: false, reason: 'duplicate-learning' };
        }

        const entry = `\n- ${new Date().toISOString()} — ${learning}\n`;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, entry, 'utf8');
        return { written: true, file };
    } catch {
        return { written: false, reason: 'vault-unavailable' };
    }
}

module.exports = { captureLearning, loadVaultContext, stripLearningDirective };
