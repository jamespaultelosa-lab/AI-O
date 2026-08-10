const { execSync } = require('child_process');
const path = require('path');

// Usage: node ask_options.js "BrainName" "Question to ask" "Option 1" "Option 2" ...
const args = process.argv.slice(2);

if (args.length < 3) {
    console.error("Usage: node ask_options.js <BrainName> <Question> <Option1> [Option2...]");
    process.exit(1);
}

const brainName = args[0];
const question = args[1];
const options = args.slice(2);

const optionsStr = `[OPTIONS: ${options.join(' | ')}]`;
const fullMessage = `[${brainName}]: ${question} ${optionsStr}`;

try {
    const streamScript = path.join(__dirname, 'stream_thoughts.js');
    execSync(`node "${streamScript}" "${fullMessage}" ${brainName}`, { stdio: 'inherit' });
} catch (e) {
    console.error("Failed to broadcast options:", e.message);
    process.exit(1);
}
