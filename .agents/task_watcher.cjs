const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { cancelActiveTask, orchestrate } = require('./brain_orchestrator.cjs');

const IPC_DIRECTORY = path.resolve(__dirname, '..', 'storage', 'app', 'agent_ipc');
const TASK_FILE = path.join(IPC_DIRECTORY, 'pending_task.json');
const QUEUE_FILE = path.join(IPC_DIRECTORY, 'task_queue.json');
const ABORT_FILE = path.join(IPC_DIRECTORY, 'abort_task.json');
let lastTimestamp = null;
let isProcessing = false;

function sendWebhook(endpoint, data) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(data);
        const req = http.request({
            hostname: '127.0.0.1',
            port: 8001,
            path: `/api/webhook/${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (response) => {
            response.resume();
            resolve();
        });
        req.setTimeout(3000, () => {
            req.destroy();
            resolve();
        });
        req.on('error', () => resolve());
        req.write(postData);
        req.end();
    });
}

function normalizeTaskPayload(payload) {
    if (!payload
        || typeof payload.display_task !== 'string' || payload.display_task.trim().length === 0
        || typeof payload.transport_task !== 'string' || payload.transport_task.trim().length === 0
        || typeof payload.timestamp !== 'string' || payload.timestamp.length === 0) {
        return null;
    }

    return {
        // task_id was added after the original watcher protocol. Preserve it
        // when present, but keep older queue files fully valid.
        task_id: typeof payload.task_id === 'string' && payload.task_id.trim().length > 0
            ? payload.task_id.trim()
            : null,
        conversation_id: typeof payload.conversation_id === 'string' && payload.conversation_id.trim().length > 0
            ? payload.conversation_id.trim()
            : null,
        display_task: payload.display_task,
        transport_task: payload.transport_task,
        images: Array.isArray(payload.images) ? payload.images.filter((image) => typeof image === 'string') : [],
        assigned_model: typeof payload.assigned_model === 'string' ? payload.assigned_model : '',
        timestamp: payload.timestamp,
    };
}

function startWatcher() {
fs.mkdirSync(IPC_DIRECTORY, { recursive: true });

// Keep mutable runtime state in Laravel's writable storage area rather than
// beside tracked agent source files.
const PID_FILE = path.join(IPC_DIRECTORY, 'watcher.pid');

if (fs.existsSync(PID_FILE)) {
    try {
        const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
        if (oldPid && oldPid !== process.pid) {
            try {
                process.kill(oldPid, 'SIGTERM');
                console.log(`[TASK WATCHER] Killed previous watcher PID ${oldPid}. New watcher PID ${process.pid} active.`);
            } catch (e) { }
        }
    } catch (e) { }
}

fs.writeFileSync(PID_FILE, process.pid.toString());

process.on('exit', () => {
    try {
        if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf-8').trim() === process.pid.toString()) {
            fs.unlinkSync(PID_FILE);
        }
    } catch (e) { }
});

if (!fs.existsSync(TASK_FILE)) {
    fs.writeFileSync(TASK_FILE, JSON.stringify({ display_task: null, transport_task: null, timestamp: null }));
}
if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}
if (!fs.existsSync(ABORT_FILE)) {
    fs.writeFileSync(ABORT_FILE, JSON.stringify({ timestamp: null }));
}

console.log('Watching for new tasks at:', QUEUE_FILE);

async function processQueueOrPending() {
    if (isProcessing) return;
    isProcessing = true;
    try {
        let taskData = null;

        // 1. Check queue file first
        if (fs.existsSync(QUEUE_FILE)) {
            const queueContent = fs.readFileSync(QUEUE_FILE, 'utf-8');
            let queue = [];
            try { queue = JSON.parse(queueContent); } catch (e) { }

            if (Array.isArray(queue) && queue.length > 0) {
                taskData = normalizeTaskPayload(queue.shift()); // FIFO dequeue
                fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
            }
        }

        // 2. Fallback to pending_task.json
        if (!taskData && fs.existsSync(TASK_FILE)) {
            const pendingContent = fs.readFileSync(TASK_FILE, 'utf-8');
            try {
                const pending = JSON.parse(pendingContent);
                const normalizedPending = normalizeTaskPayload(pending);
                if (normalizedPending && normalizedPending.timestamp !== lastTimestamp) {
                    taskData = normalizedPending;
                    fs.writeFileSync(TASK_FILE, JSON.stringify({ display_task: null, transport_task: null, timestamp: null }));
                }
            } catch (e) { }
        }

        if (taskData && taskData.transport_task && taskData.timestamp !== lastTimestamp) {
            lastTimestamp = taskData.timestamp;
            console.log('NEW_TASK_RECEIVED:', taskData.timestamp);
            if (taskData.assigned_model) {
                console.log(`\n======================================================`);
                console.log(`[SYSTEM ROUTER] Recommended Model: ${taskData.assigned_model}`);
                console.log(`======================================================\n`);

                if (taskData.assigned_model.toLowerCase().includes('opus')) {
                    console.log("[CONTEXT ENGINE] Heavy task detected. Running architecture map scanner...");
                    try {
                        execSync(`node ${path.resolve(__dirname, 'scripts/generate_architecture_map.cjs')}`, { stdio: 'inherit' });
                    } catch (err) {
                        console.error("[CONTEXT ENGINE] Failed to run scanner:", err);
                    }
                }
            }

            // Clear pending_task.json to avoid re-triggering
            fs.writeFileSync(TASK_FILE, JSON.stringify({ display_task: null, transport_task: null, timestamp: null }));

            await orchestrate(taskData);
        }
    } catch (e) {
        console.error('[TASK WATCHER] Brain orchestration failed:', e.message);
    } finally {
        isProcessing = false;
    }
}

// Initial check on startup
processQueueOrPending();

// Watch both queue file and pending file
if (fs.existsSync(QUEUE_FILE)) {
    fs.watch(QUEUE_FILE, () => processQueueOrPending());
}
if (fs.existsSync(TASK_FILE)) {
    fs.watch(TASK_FILE, () => processQueueOrPending());
}
if (fs.existsSync(ABORT_FILE)) {
    fs.watch(ABORT_FILE, () => cancelActiveTask());
}

}

if (require.main === module) {
    startWatcher();
}

module.exports = { normalizeTaskPayload, startWatcher };
