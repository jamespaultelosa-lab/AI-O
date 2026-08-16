const fs = require('fs');
const path = require('path');

const BRAINS_DIR = path.resolve(__dirname, '..', 'brains');

function parseFrontmatter(content) {
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
        return { frontmatter: {}, body: content };
    }

    const endIdx = trimmed.indexOf('\n---', 3);
    if (endIdx === -1) {
        return { frontmatter: {}, body: content };
    }

    const frontmatterBlock = trimmed.slice(3, endIdx).trim();
    const body = trimmed.slice(endIdx + 4).trim();
    const frontmatter = {};

    let currentListKey = null;

    for (const rawLine of frontmatterBlock.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        // Check for list item
        if (line.startsWith('- ') && currentListKey) {
            const itemValue = line.slice(2).trim().replace(/^['"](.*)['"]$/, '$1');
            if (!Array.isArray(frontmatter[currentListKey])) {
                frontmatter[currentListKey] = [];
            }
            frontmatter[currentListKey].push(itemValue);
            continue;
        }

        // Check for key: value or nested object key
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const valueStr = line.slice(colonIdx + 1).trim();

            if (!valueStr) {
                // Potential list or nested object header
                currentListKey = key;
                frontmatter[key] = [];
            } else {
                currentListKey = null;
                // Parse scalar values
                let parsedVal = valueStr.replace(/^['"](.*)['"]$/, '$1');
                if (parsedVal === 'true') parsedVal = true;
                else if (parsedVal === 'false') parsedVal = false;
                else if (!isNaN(Number(parsedVal)) && parsedVal !== '') parsedVal = Number(parsedVal);
                frontmatter[key] = parsedVal;
            }
        }
    }

    return { frontmatter, body };
}

class BrainRegistry {
    constructor(brainsDir = BRAINS_DIR) {
        this.brainsDir = brainsDir;
        this.brains = new Map();
        this.lastLoaded = 0;
        this.load();
    }

    load() {
        if (!fs.existsSync(this.brainsDir)) {
            return;
        }

        const entries = fs.readdirSync(this.brainsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && (entry.name.endsWith('.agent.md') || entry.name.endsWith('.manifest.json'))) {
                const filePath = path.join(this.brainsDir, entry.name);
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    if (entry.name.endsWith('.manifest.json')) {
                        const parsed = JSON.parse(content);
                        this.registerBrain(parsed.id || entry.name.replace('.manifest.json', ''), parsed);
                    } else {
                        const { frontmatter, body } = parseFrontmatter(content);
                        const id = frontmatter.id || entry.name.replace('.agent.md', '').replace(/^\w/, (c) => c.toUpperCase());
                        this.registerBrain(id, {
                            id,
                            name: frontmatter.name || id,
                            role: frontmatter.role || 'Specialist',
                            color: frontmatter.color || '#6b7280',
                            avatar: frontmatter.avatar || 'Brain',
                            lead_capable: frontmatter.lead_capable !== false,
                            model_tier: frontmatter.model_tier || 'standard',
                            domain_keywords: Array.isArray(frontmatter.domain_keywords) ? frontmatter.domain_keywords : [],
                            collaboration_keywords: Array.isArray(frontmatter.collaboration_keywords) ? frontmatter.collaboration_keywords : [],
                            speech_profile: frontmatter.speech_profile || {},
                            system_prompt: body,
                            manifest_path: filePath,
                        });
                    }
                } catch (e) {
                    console.error(`[BrainRegistry] Error loading brain manifest ${entry.name}:`, e.message);
                }
            }
        }
        this.lastLoaded = Date.now();
    }

    registerBrain(id, brainDefinition) {
        this.brains.set(id, {
            ...brainDefinition,
            id,
            domain_keywords: brainDefinition.domain_keywords || [],
            collaboration_keywords: brainDefinition.collaboration_keywords || [],
        });
    }

    getBrain(id) {
        return this.brains.get(id) || null;
    }

    hasBrain(id) {
        return this.brains.has(id);
    }

    getAllBrains() {
        return Array.from(this.brains.values());
    }

    getBrainNames() {
        return Array.from(this.brains.keys());
    }

    matchBrainsForTask(taskText) {
        const text = String(taskText || '').toLowerCase();
        const matches = [];

        for (const brain of this.brains.values()) {
            let score = 0;
            const matchedTerms = [];

            for (const keyword of brain.domain_keywords) {
                if (text.includes(keyword.toLowerCase())) {
                    score += 10;
                    matchedTerms.push(keyword);
                }
            }

            for (const collabKeyword of brain.collaboration_keywords) {
                if (text.includes(collabKeyword.toLowerCase())) {
                    score += 5;
                    matchedTerms.push(collabKeyword);
                }
            }

            if (score > 0) {
                matches.push({ brain, score, matchedTerms });
            }
        }

        return matches.sort((a, b) => b.score - a.score);
    }

    getLeadCandidate(taskText, fallbackLead = 'Senior_Dev') {
        const matches = this.matchBrainsForTask(taskText);
        const leadEligible = matches.filter((m) => m.brain.lead_capable);
        if (leadEligible.length > 0) {
            return leadEligible[0].brain.id;
        }
        return this.hasBrain(fallbackLead) ? fallbackLead : (this.getBrainNames()[0] || 'Senior_Dev');
    }

    getConsultants(taskText, leadBrainId, maxConsultants = 2) {
        const matches = this.matchBrainsForTask(taskText);
        const consultants = [];

        for (const match of matches) {
            if (match.brain.id !== leadBrainId && !consultants.includes(match.brain.id)) {
                consultants.push(match.brain.id);
                if (consultants.length >= maxConsultants) break;
            }
        }

        return consultants;
    }
}

let instance = null;

function getBrainRegistry() {
    if (!instance) {
        instance = new BrainRegistry();
    }
    return instance;
}

module.exports = {
    BrainRegistry,
    getBrainRegistry,
    parseFrontmatter,
};
