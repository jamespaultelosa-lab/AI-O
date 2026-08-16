const { defaultEventBus } = require('./core/event_bus.cjs');

const brain = process.argv[2];
const text = process.argv[3];

if (!brain || !text) {
    console.error("Usage: node speak.cjs <BrainName> <Message>");
    process.exit(1);
}

async function speak() {
    // Stream single message with proper pacing and status transitions
    await defaultEventBus.streamDialogue([{ brain, text }], [brain]);
}

speak().catch((err) => {
    console.error('[speak.cjs] Error:', err.message);
});
