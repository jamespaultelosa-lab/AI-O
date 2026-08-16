const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./brain_registry.cjs');

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

class SkillRegistry {
    constructor(skillsDir = SKILLS_DIR) {
        this.skillsDir = skillsDir;
        this.skills = new Map();
        this.load();
    }

    load() {
        if (!fs.existsSync(this.skillsDir)) return;

        const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const skillFile = path.join(this.skillsDir, entry.name, 'SKILL.md');
                if (fs.existsSync(skillFile)) {
                    try {
                        const content = fs.readFileSync(skillFile, 'utf8');
                        const { frontmatter, body } = parseFrontmatter(content);
                        this.skills.set(entry.name, {
                            id: entry.name,
                            name: frontmatter.name || entry.name,
                            description: frontmatter.description || '',
                            path: skillFile,
                            instructions: body,
                        });
                    } catch (e) {
                        console.error(`[SkillRegistry] Error loading skill ${entry.name}:`, e.message);
                    }
                }
            }
        }
    }

    getSkill(id) {
        return this.skills.get(id) || null;
    }

    getAllSkills() {
        return Array.from(this.skills.values());
    }
}

let instance = null;

function getSkillRegistry() {
    if (!instance) {
        instance = new SkillRegistry();
    }
    return instance;
}

module.exports = {
    SkillRegistry,
    getSkillRegistry,
};
