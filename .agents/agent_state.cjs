const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.BRAIN_AGENT_STATE_FILE || path.resolve(__dirname, '..', 'storage', 'app', 'agent_ipc', 'agent_state.json');
const MAX_ITEMS = 6;
const SECRET_PATTERN = /(?:api[_ -]?key|secret|password|token|authorization:\s*bearer|private key)/i;

function defaultState() {
    return {
        version: 1,
        updated_at: null,
        focus: null,
        open_questions: [],
        recent_outcomes: [],
        brain_state: {},
        pending_goal: null,
        active_engine: 'codex',
    };
}

function safeSummary(value, maxLength = 280) {
    const summary = String(value || '').replace(/\s+/g, ' ').trim();
    if (!summary || SECRET_PATTERN.test(summary)) return 'Sensitive task details withheld.';
    return summary.slice(0, maxLength);
}

function loadState(file = STATE_FILE) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ...defaultState(), ...parsed };
    } catch {
        return defaultState();
    }
}

function saveState(state, file = STATE_FILE) {
    const next = { ...defaultState(), ...state, updated_at: new Date().toISOString() };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
    return next;
}

function getActiveEngine(file = STATE_FILE) {
    const state = loadState(file);
    return state.active_engine || 'codex';
}

function setActiveEngine(engine, file = STATE_FILE) {
    const state = loadState(file);
    state.active_engine = engine === 'antigravity' ? 'antigravity' : 'codex';
    return saveState(state, file);
}

function setPendingGoal({ originalTask, blockedBy, file = STATE_FILE }) {
    const state = loadState(file);
    state.pending_goal = {
        original_task: safeSummary(originalTask),
        blocked_by: safeSummary(blockedBy),
        status: 'blocked',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    return saveState(state, file);
}

function getPendingGoal(file = STATE_FILE) {
    const state = loadState(file);
    return state.pending_goal || null;
}

function clearPendingGoal(file = STATE_FILE) {
    const state = loadState(file);
    state.pending_goal = null;
    return saveState(state, file);
}

function updatePendingGoalStatus(status, file = STATE_FILE) {
    const state = loadState(file);
    if (state.pending_goal) {
        state.pending_goal.status = status;
        state.pending_goal.updated_at = new Date().toISOString();
        return saveState(state, file);
    }
    return state;
}

function recordDispatch({ taskId = null, task, route, file = STATE_FILE }) {
    const state = loadState(file);
    const summary = safeSummary(task);
    state.focus = {
        task_id: taskId,
        summary,
        lead: route.lead,
        collaboration: route.consultants.length > 0,
        status: 'active',
        started_at: new Date().toISOString(),
    };
    state.brain_state[route.lead] = { mode: 'leading', updated_at: new Date().toISOString() };
    for (const brain of route.consultants) state.brain_state[brain] = { mode: 'reviewing', updated_at: new Date().toISOString() };
    return saveState(state, file);
}

function recordOutcome({ taskId = null, status, summary, openQuestion = null, file = STATE_FILE }) {
    const state = loadState(file);
    if (state.focus && (!taskId || state.focus.task_id === taskId)) state.focus.status = status;
    if (openQuestion) state.open_questions = [safeSummary(openQuestion, 180), ...state.open_questions].filter((value, index, values) => values.indexOf(value) === index).slice(0, MAX_ITEMS);
    state.recent_outcomes = [{ task_id: taskId, status, summary: safeSummary(summary, 180), at: new Date().toISOString() }, ...state.recent_outcomes].slice(0, MAX_ITEMS);
    return saveState(state, file);
}

function autonomyContext(brain, file = STATE_FILE) {
    const state = loadState(file);
    const focus = state.focus?.status === 'active' ? state.focus.summary : null;
    const questions = state.open_questions.slice(0, 2);
    const pendingGoal = state.pending_goal;
    const engine = state.active_engine || 'codex';
    const parts = [];
    parts.push(`Active execution engine: ${engine}`);
    if (focus) parts.push(`Current durable focus: ${focus}`);
    if (pendingGoal && pendingGoal.status !== 'completed') {
        parts.push(`Chained pending goal: User originally wanted to "${pendingGoal.original_task}", but was blocked by "${pendingGoal.blocked_by}". Status: ${pendingGoal.status}.`);
    }
    if (questions.length) parts.push(`Unresolved user questions: ${questions.join(' | ')}`);
    parts.push(`You are ${brain}; maintain continuity, but do not invent memories or claim consciousness.`);
    return parts.join('\n');
}

module.exports = {
    STATE_FILE,
    autonomyContext,
    clearPendingGoal,
    defaultState,
    getActiveEngine,
    getPendingGoal,
    loadState,
    recordDispatch,
    recordOutcome,
    safeSummary,
    setActiveEngine,
    setPendingGoal,
    updatePendingGoalStatus,
};


