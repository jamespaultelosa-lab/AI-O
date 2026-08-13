const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTransport() {
    const source = fs.readFileSync(path.join(__dirname, '../../resources/js/lib/cavemanPromptTransport.ts'), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('exports', 'module', output)(module.exports, module);
    return module.exports;
}

const { buildBrainDispatchPayload, buildCavemanPromptTransport } = loadTransport();

test('compacts ordinary prose deterministically while retaining the display text', () => {
    const displayTask = 'You should really make sure to update the dashboard in order to fix the issue.';
    const first = buildCavemanPromptTransport(displayTask);

    assert.deepEqual(first, buildCavemanPromptTransport(displayTask));
    assert.equal(first.displayTask, displayTask);
    assert.equal(first.compressedTask, 'ensure update the dashboard to fix the issue.');
});

test('preserves every protected literal byte-for-byte', () => {
    const literals = [
        '```ts\nconst x = 1;\n```', '`npm run build`', 'https://example.test/a?x=1',
        './resources/js/app.tsx', 'npm run build -- --mode=production', '$NODE_ENV',
        'v1.2.3', '[IMAGES: data:image/png;base64,ABC :: data:image/jpeg;base64,XYZ]',
    ];
    const result = buildCavemanPromptTransport(`Please really inspect ${literals.join(' then ')} carefully.`);

    for (const literal of literals) assert.ok(result.compressedTask.includes(literal), literal);
});

test('returns the original text when code delimiters cannot be safely tokenized', () => {
    const displayTask = 'Please update `unfinished code';
    assert.deepEqual(buildCavemanPromptTransport(displayTask), { displayTask, compressedTask: displayTask });
});

test('dispatch payload keeps original display text and a separate compact transport field', () => {
    const displayTask = 'You should really make sure to update the dashboard.';
    const payload = buildBrainDispatchPayload(displayTask, ['data:image/png;base64,ABC']);

    assert.equal(payload.display_task, displayTask);
    assert.notEqual(payload.task, displayTask);
    assert.deepEqual(payload.images, ['data:image/png;base64,ABC']);
});
