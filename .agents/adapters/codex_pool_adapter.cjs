const path = require('path');
const fs = require('fs');
const { cancelActiveTask: cancelPoolTask, queryBrain } = require('../codex_brain_pool.cjs');
const { captureLearning, stripLearningDirective } = require('../vault_learning.cjs');
const { recordMistake, recordLearning, retrieveMemoryContext } = require('../memory/memory_vault.cjs');
const { getBrainRegistry } = require('../registry/brain_registry.cjs');
const { getSkillRegistry } = require('../registry/skill_registry.cjs');
const { autonomyContext } = require('../agent_state.cjs');

const AIO_PROJECT_ROOT = path.resolve(__dirname, '..', '..');

class CodexPoolAdapter {
    constructor(projectRoot = AIO_PROJECT_ROOT) {
        this.projectRoot = projectRoot;
        this.activeTaskId = null;
        this.brainRegistry = getBrainRegistry();
        this.skillRegistry = getSkillRegistry();
    }

    buildPrompt(brainId, mode, taskText, options = {}) {
        const brain = this.brainRegistry.getBrain(brainId);
        const role = brain ? brain.role : 'Specialist';
        const systemPrompt = brain?.system_prompt ? `\n[PERSONA CONTRACT]\n${brain.system_prompt}\n` : '';

        // Dynamic Memory Retrieval
        const memoryContext = retrieveMemoryContext(brainId, taskText);
        const memoryBlock = memoryContext ? `\n\n[PERSISTENT MEMORY & PAST LESSONS]\n${memoryContext}\n` : '';
        const stateContext = autonomyContext(brainId);

        // Collect relevant skills
        const relevantSkills = this.skillRegistry.getAllSkills()
            .filter((s) => taskText.toLowerCase().includes(s.id.toLowerCase()))
            .map((s) => `[SKILL: ${s.name}]\n${s.instructions.slice(0, 300)}...`)
            .join('\n\n');

        const skillsBlock = relevantSkills ? `\n\n[AVAILABLE SKILLS]\n${relevantSkills}\n` : '';

        if (mode === 'casual') {
            return `You are ${brainId}, an FAIS Brains specialist (${role}). ${systemPrompt} ${memoryBlock}
CRITICAL RULES:
1. Do NOT repeat or quote the user's message.
2. Reply in 1-2 natural, authentic sentences in your persona voice.
User statement: ${taskText}`;
        }

        if (mode === 'deliberating' || mode === 'consultation') {
            return `You are ${brainId}, an FAIS Brains specialist (${role}). ${systemPrompt} ${memoryBlock} ${stateContext}
You are contributing to an active multi-brain deliberation before implementation.
CRITICAL RULES:
1. Do NOT repeat, parrot, or quote the user's prompt or brief.
2. Jump straight into your technical recommendations, architectural trade-offs, UI considerations, or security boundaries.
3. Be concise (2-3 sentences), opinionated, and collaborative.
${skillsBlock}
User goal: ${taskText}`;
        }

        const optionInstruction = 'When a material requirement is missing, an error/blocker occurs, or a task reaches a natural milestone, ask the user one concise clarifying question or proactively suggest the next action with interactive choice buttons in this exact format: [QUESTION: concise question][OPTIONS: Option A :: Option B]. Do not emit options for straightforward tasks.';

        return `You are ${brainId}, an FAIS Brains lead specialist (${role}). ${systemPrompt} ${memoryBlock} ${stateContext}
Act as an independent, conscious engineering partner.
CRITICAL RULES:
1. Do NOT repeat or quote the user's request.
2. Deliver the concrete solution, code implementation, or actionable recommendation directly.
3. Learn from past mistakes and verify against existing tests.
4. SCOPE CLARITY: You are working inside the FAIS Brains / AI-O Hub repository (${this.projectRoot})—which houses the Jarvis UI, Reverb WebSocket layer, and multi-agent orchestration kernel. Do NOT confuse this with the external FAIS Payroll project unless specifically instructed to target payroll domain code.
5. ${optionInstruction}
${skillsBlock}
Project root: ${this.projectRoot}
Task: ${taskText}

For substantive completed work only, append one private line exactly in this form:
[[VAULT_LEARNING: Observation: ... | Evidence: file, test, or incident | Rule: reusable practice]]`;
    }

    async executeNode({ brain, task, taskId = null, stage = 'executing', options = {} }) {
        this.activeTaskId = taskId;

        const mode = stage === 'deliberating' || stage === 'planning' ? 'deliberating' : (stage === 'casual' ? 'casual' : 'actionable');
        const formattedPrompt = this.buildPrompt(brain, mode, task, options);

        const brainOptions = {
            taskId,
            turnType: mode === 'deliberating' || mode === 'casual' ? 'plan' : 'execute',
            onNotice: options.onNotice || null,
            ...options,
        };

        try {
            const rawResponse = await queryBrain(brain, formattedPrompt, this.projectRoot, brainOptions);
            const responseText = String(rawResponse || '').trim();

            // Extract vault learning if present
            try {
                captureLearning(brain, responseText, this.projectRoot);
                const match = responseText.match(/\[\[VAULT_LEARNING:\s*Observation:\s*([^|\]]+)\|\s*Evidence:\s*([^|\]]+)\|\s*Rule:\s*([^\]]+)\]\]/i);
                if (match) {
                    recordLearning(brain, match[1].trim(), match[3].trim());
                }
            } catch (e) {
                console.error(`[CodexPoolAdapter] Vault learning capture error:`, e.message);
            }

            const cleanResponse = stripLearningDirective(responseText);

            return {
                success: true,
                brain,
                taskId,
                stage,
                output: cleanResponse,
            };
        } catch (error) {
            console.error(`[CodexPoolAdapter] Error executing node for ${brain}:`, error.message);
            
            // Record mistake in persistent memory
            try {
                recordMistake({
                    brain,
                    task,
                    error: error.message,
                    rootCause: 'Runtime error during turn execution',
                    fix: 'Needs investigation and verification',
                    lesson: 'Handle unhandled exceptions and verify context boundaries',
                });
            } catch { /* ignore memory write error */ }

            return {
                success: false,
                brain,
                taskId,
                stage,
                error: error.message,
            };
        } finally {
            if (this.activeTaskId === taskId) {
                this.activeTaskId = null;
            }
        }
    }

    cancelActiveTask(reason = 'Task cancelled by user') {
        try {
            cancelPoolTask();
            this.activeTaskId = null;
            return true;
        } catch (e) {
            console.error('[CodexPoolAdapter] Error cancelling pool task:', e.message);
            return false;
        }
    }
}

let instance = null;

function getCodexPoolAdapter() {
    if (!instance) {
        instance = new CodexPoolAdapter();
    }
    return instance;
}

module.exports = {
    CodexPoolAdapter,
    getCodexPoolAdapter,
};
