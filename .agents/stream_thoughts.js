import http from 'http';
import fs from 'fs';

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
    console.error("Failed to parse thoughts JSON:", e.message);
    process.exit(1);
}

function sendWebhook(endpoint, data) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: 'localhost',
            port: 8001,
            path: '/webhook/' + endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
        });

        req.on('error', resolve); 
        req.write(postData);
        req.end();
    });
}

async function stream() {
    // Check if another script is currently speaking
    try {
        const lockFile = path.resolve(__dirname, 'speaking.lock');
        if (fs.existsSync(lockFile)) {
            const finishTime = parseInt(fs.readFileSync(lockFile, 'utf-8'));
            const now = Date.now();
            if (finishTime > now) {
                await new Promise(r => setTimeout(r, finishTime - now + 500));
            }
        }
    } catch (e) {}

    let totalDuration = 0;
    for (const msg of messages) {
        let delay = (msg.text.length * 25) + 800; // base speed 25ms per char
        if (/^(wait|hold on|actually|no,|stop|wait,)/i.test(msg.text)) {
            delay -= 600; // interrupt!
        }
        if (msg.text.endsWith('?') || msg.text.endsWith('!')) {
            delay += 500; // pause after a big statement
        }
        totalDuration += Math.max(delay, 500) + 200; // + 200ms pause
    }
    
    try {
        fs.writeFileSync(path.resolve(__dirname, 'speaking.lock'), (Date.now() + totalDuration).toString());
    } catch (e) {}

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        await sendWebhook('brain-status', { brain: msg.brain, status: 'thinking' });
        await sendWebhook('brain-message', { brain: msg.brain, message: msg.text });
        
        // Delay to keep the brain in 'thinking' state while the frontend types it out
        let delay = (msg.text.length * 25) + 800;
        
        // Simulating interruptions:
        let isInterrupt = false;
        if (/^(wait|hold on|actually|no,|stop|wait,)/i.test(msg.text)) {
            isInterrupt = true;
            delay = Math.max(500, delay - 600);
        }
        
        // Pacing for emphasis
        if (msg.text.endsWith('?') || msg.text.endsWith('!')) {
            delay += 500;
        }

        // If it's an interrupt, wait less *before* they start speaking.
        // Wait, the "before" pause is between messages. So we adjust the pause *before* this message.
        // The delay here is how long they stay in "thinking" status.
        await new Promise(r => setTimeout(r, delay));
        
        await sendWebhook('brain-status', { brain: msg.brain, status: 'idle' });
        
        // Brief pause before next speaker. If the next speaker interrupts, this could be shorter, 
        // but we handle that organically enough with the base pacing.
        const nextMsg = messages[i + 1];
        let pause = 300;
        if (nextMsg && /^(wait|hold on|actually|no,|stop|wait,)/i.test(nextMsg.text)) {
            pause = 50; // practically instantly cuts in
        }
        await new Promise(r => setTimeout(r, pause));
    }

    // After thoughts are done, set brains to executing or standby based on leadBrains
    const allBrains = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev'];
    for (const brain of allBrains) {
        if (leadBrains.includes('NONE')) {
            await sendWebhook('brain-status', { brain, status: 'idle' });
        } else if (leadBrains.length > 0) {
            if (leadBrains.includes(brain)) {
                await sendWebhook('brain-status', { brain, status: 'executing' });
            } else {
                await sendWebhook('brain-status', { brain, status: 'standby' });
            }
        } else {
            await sendWebhook('brain-status', { brain, status: 'executing' });
        }
    }
}

stream();
