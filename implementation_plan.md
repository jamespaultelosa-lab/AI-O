# Implementation Plan: Conversation History and New Chat

## Recommendation
Complete the in-progress conversation-history feature before starting another
feature. It gives the Thought Stream an uncluttered active chat, durable prior
chat access, and correct routing of task messages to their originating chat.

## Scope
- Keep one immutable `History` conversation for legacy messages and tasks.
- Let users create and switch named conversations in Jarvis UI.
- Persist a conversation id on messages and tasks, including webhook responses
  and approval notifications.
- Load only the selected conversation in the Thought Stream.

## Acceptance Criteria
1. Existing messages and tasks migrate to `History` without loss.
2. New messages, tasks, agent replies, and approvals remain isolated to their
   selected conversation.
3. The UI can create, switch, and load conversations without displaying
   messages from another chat.
4. Invalid conversation and task identifiers fail safely.
5. PHP feature tests and the frontend build pass.

## Verification
- `php artisan test --filter=BrainConversationTest`
- `npm.cmd run build`

## Material Trade-offs
- This is a focused local-history feature; it intentionally does not add
  deletion, search, access control, or cross-device synchronization. Those
  require product and retention decisions first.
