/**
 * finish_task.js
 *
 * Finalizes an AI orchestration turn, announces short completion status,
 * and resets all brains to idle.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { defaultEventBus } = require('./core/event_bus.cjs');
const { getBrainRegistry } = require('./registry/brain_registry.cjs');

async function finishTask() {
    let rawInput = process.argv[2] || "Task completed.";
    let senderBrain = 'Senior_Dev';
    let finalMessage = rawInput;

    const match = rawInput.match(/^\[(.*?)\]:\s*(.*)$/);
    if (match) {
        senderBrain = match[1];
        finalMessage = match[2];
    }

    if (finalMessage !== "SILENT") {
        if (!finalMessage.startsWith("[DONE] ")) {
            finalMessage = "[DONE] " + finalMessage;
        }

        // Stream the final completion message with lock protection
        await defaultEventBus.streamDialogue(
            [{ brain: senderBrain, text: finalMessage }],
            ['NONE']
        );
    } else {
        const brainNames = getBrainRegistry().getBrainNames();
        await defaultEventBus.resetAllBrains(brainNames, 'idle');
    }
}

finishTask().catch((err) => {
    console.error('[finish_task.js] Error:', err.message);
});
