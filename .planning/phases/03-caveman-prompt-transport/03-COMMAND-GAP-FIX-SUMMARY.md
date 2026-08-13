# Phase 03 Command Literal Gap Fix

**Date:** 2026-08-13

The protected-literal matcher now recognizes supported CLI command starters at a word boundary anywhere in prose. Commands are tokenized before ordinary-prose compaction and restored verbatim, so internal whitespace is unchanged.

Regression coverage uses `Please really make sure to npm    install package@1.2.3 now.` and verifies the compressed transport retains `npm    install package@1.2.3 now.` byte-for-byte.

Verification passed:

- `node --test tests\\Node\\caveman_prompt_transport.test.cjs` (5/5)
- `npm.cmd run build`
- `git diff --check`

No commit was created because the shared worktree contains unrelated in-progress changes.
