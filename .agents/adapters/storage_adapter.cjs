const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STORAGE_DIR = process.env.BRAIN_STORAGE_DIR || path.join(ROOT_DIR, 'storage', 'app', 'agent_ipc');
const LOCK_FILE = path.join(ROOT_DIR, '.agents', 'speaking.lock');
const BRIEF_FILE = process.env.BRAIN_CONTEXT_FILE || path.join(STORAGE_DIR, 'current_brief.json');
const TASK_FILE = path.join(STORAGE_DIR, 'pending_task.json');
const QUEUE_FILE = path.join(STORAGE_DIR, 'task_queue.json');
const ABORT_FILE = path.join(STORAGE_DIR, 'abort_task.json');
const PID_FILE = path.join(STORAGE_DIR, 'watcher.pid');

function ensureStorageDir() {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
}

function readJsonFile(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return defaultValue;
    }
}

function writeJsonFile(filePath, data) {
    ensureStorageDir();
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

// Global speaking lock helpers adhering to strict concurrency rules
async function acquireSpeakingLock(durationMs) {
    const lockExpiry = Date.now() + durationMs;
    // Resilient lock check: wait out any active lock
    while (fs.existsSync(LOCK_FILE)) {
        try {
            const currentExpiry = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
            const now = Date.now();
            if (Number.isFinite(currentExpiry) && currentExpiry > now) {
                const waitTime = Math.min(currentExpiry - now + 50, 2000);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
            } else {
                break;
            }
        } catch {
            break;
        }
    }

    try {
        fs.writeFileSync(LOCK_FILE, lockExpiry.toString(), 'utf8');
    } catch (e) {
        console.error('[StorageAdapter] Failed writing lock file:', e.message);
    }
}

function releaseSpeakingLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
        }
    } catch {
        // Ignore unlink failures if file was already cleared
    }
}

function getCurrentBrief() {
    const data = readJsonFile(BRIEF_FILE, null);
    return typeof data?.task === 'string' && data.task.trim() ? data.task.trim() : null;
}

function setCurrentBrief(task) {
    const brief = String(task || '').trim();
    if (!brief) return;
    writeJsonFile(BRIEF_FILE, {
        task: brief,
        updated_at: new Date().toISOString(),
    });
}

function getTaskQueue() {
    return readJsonFile(QUEUE_FILE, []) || [];
}

function setTaskQueue(queue) {
    writeJsonFile(QUEUE_FILE, Array.isArray(queue) ? queue : []);
}

function getPendingTask() {
    return readJsonFile(TASK_FILE, null);
}

function setPendingTask(payload) {
    writeJsonFile(TASK_FILE, payload || { display_task: null, transport_task: null, timestamp: null });
}

function getAbortSignal() {
    return readJsonFile(ABORT_FILE, null);
}

function clearAbortSignal() {
    writeJsonFile(ABORT_FILE, { abort: false, timestamp: null });
}

module.exports = {
    STORAGE_DIR,
    LOCK_FILE,
    BRIEF_FILE,
    TASK_FILE,
    QUEUE_FILE,
    ABORT_FILE,
    PID_FILE,
    ensureStorageDir,
    readJsonFile,
    writeJsonFile,
    acquireSpeakingLock,
    releaseSpeakingLock,
    getCurrentBrief,
    setCurrentBrief,
    getTaskQueue,
    setTaskQueue,
    getPendingTask,
    setPendingTask,
    getAbortSignal,
    clearAbortSignal,
};
