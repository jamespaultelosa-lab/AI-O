/**
 * stream_thoughts.js
 * 
 * Orchestrates the streaming of AI Persona thoughts to the frontend UI via local webhooks.
 * Supports reading from .json, .txt, or direct string arguments separated by '|'.
 * Delegates pacing, locking, and webhooks to event_bus.cjs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { defaultEventBus } = require('./core/event_bus.cjs');

const input = process.argv[2];
const leadBrains = process.argv[3] ? process.argv[3].split(',') : [];

if (!input) {
    console.error("Please provide a json string of thoughts or a path to a .json file.");
    process.exit(1);
}

let messages = [];
try {
    if (input.endsWith('.json')) {
        messages = JSON.parse(fs.readFileSync(input, 'utf-8'));
    } else if (input.endsWith('.txt')) {
        const content = fs.readFileSync(input, 'utf-8');
        const lines = content.split('\n');
        let currentBrain = null;
        let currentText = [];

        for (const line of lines) {
            const match = line.match(/^\[(.*?)\]:\s*(.*)$/);
            if (match) {
                if (currentBrain) {
                    messages.push({ brain: currentBrain, text: currentText.join('\n').trim() });
                }
                currentBrain = match[1];
                currentText = [match[2]];
            } else if (currentBrain && line.trim()) {
                currentText.push(line);
            }
        }
        if (currentBrain) {
            messages.push({ brain: currentBrain, text: currentText.join('\n').trim() });
        }
    } else {
        const lines = input.split('|');
        let currentBrain = null;
        let currentText = [];

        for (let line of lines) {
            line = line.trim();
            const match = line.match(/^\[(.*?)\]:\s*(.*)$/);
            if (match) {
                if (currentBrain) {
                    messages.push({ brain: currentBrain, text: currentText.join('\n').trim() });
                }
                currentBrain = match[1];
                currentText = [match[2]];
            } else if (currentBrain && line) {
                currentText.push(line);
            }
        }
        if (currentBrain) {
            messages.push({ brain: currentBrain, text: currentText.join('\n').trim() });
        }
    }
} catch (e) {
    console.error("Failed to parse thoughts input:", e.message);
    process.exit(1);
}

async function run() {
    await defaultEventBus.streamDialogue(messages, leadBrains);
}

run().catch((err) => {
    console.error('[stream_thoughts.js] Error:', err.message);
});
