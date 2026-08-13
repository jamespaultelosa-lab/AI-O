/**
 * Builds the two prompt representations used by the Brain dispatcher.
 *
 * The compressor intentionally has a small, finite rule set: it normalizes
 * ordinary prose whitespace and removes a few filler phrases. Technical
 * literals are first replaced with opaque tokens and restored verbatim.
 */
export interface CavemanPromptTransport {
    displayTask: string;
    compressedTask: string;
}

const TOKEN_PREFIX = '\uE000CAVEMAN_';
const TOKEN_SUFFIX = '_\uE001';

// Matches are ordered from widest to narrowest so protected literals do not overlap.
const PROTECTED_LITERAL = /```[\s\S]*?```|`[^`\r\n]*`|\[IMAGES:\s*[\s\S]*?\]|(?:https?:\/\/|www\.)[^\s<>'"`]+|(?:\.?\.?\/|~\/|[A-Za-z]:\\)[^\s<>'"`]+|\$[A-Za-z_][A-Za-z0-9_]*|\b(?:[A-Z][A-Z0-9_]{2,})\b|\b\d+(?:\.\d+)+(?:[-+][A-Za-z0-9.-]+)?\b|\b\d+(?:\.\d+)?(?:%|px|ms|s|MB|GB)?\b|(?:^|(?<=[.;:!?]\s))\s*(?:npm|pnpm|yarn|git|node|php|composer|docker|kubectl|cargo|python(?:3)?|pip)\b[^\r\n]*/gm;

function hasUnclosedDelimitedLiteral(input: string): boolean {
    const fenceCount = (input.match(/```/g) ?? []).length;
    if (fenceCount % 2 !== 0) return true;

    return (input.match(/(?<!\\)`/g) ?? []).length % 2 !== 0;
}

function compactOrdinaryProse(input: string): string {
    return input
        .replace(/\b(?:just|really|basically|actually|simply|essentially|generally)\b\s*/gi, '')
        .replace(/\bin order to\b/gi, 'to')
        .replace(/\bmake sure to\b/gi, 'ensure')
        .replace(/\byou should\b\s*/gi, '')
        .replace(/[ \t\r\n]+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
}

/**
 * Preserve protected literals byte-for-byte. If the input cannot be safely
 * tokenized (for example, an unclosed code delimiter), transport the original.
 */
export function buildCavemanPromptTransport(displayTask: string): CavemanPromptTransport {
    if (displayTask.includes(TOKEN_PREFIX) || hasUnclosedDelimitedLiteral(displayTask)) {
        return { displayTask, compressedTask: displayTask };
    }

    const literals: string[] = [];
    const tokenized = displayTask.replace(PROTECTED_LITERAL, (literal) => {
        const token = `${TOKEN_PREFIX}${literals.length}${TOKEN_SUFFIX}`;
        literals.push(literal);
        return token;
    });

    const compressedTask = compactOrdinaryProse(tokenized).replace(
        new RegExp(`${TOKEN_PREFIX}(\\d+)${TOKEN_SUFFIX}`, 'g'),
        (_token, index: string) => literals[Number(index)],
    );

    if (compressedTask.includes(TOKEN_PREFIX)) {
        return { displayTask, compressedTask: displayTask };
    }

    return { displayTask, compressedTask };
}
