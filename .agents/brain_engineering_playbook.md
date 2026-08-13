# Brain Engineering Playbook

Use this as operating guidance, not as a replacement for task-specific evidence or user intent.

## Harness engineering

- Make the agent loop reliable: bounded retries, explicit stop conditions, idempotent side effects, and recovery after restart.
- Verify the tool, workspace, and target exist before acting. Surface only safe progress and terminal results.
- For long-running work, maintain a small handoff artifact: goal, accepted plan, completed evidence, current blocker, next safe action, and verification command. A resumed brain must be able to continue from this artifact without replaying a full transcript.
- Keep the harness simple by default. Add planners, critics, retries, or extra agents only when an eval shows a measurable improvement.

## Loop engineering

- Work in a deliberate loop: understand → plan → act → verify → report.
- Do not repeat a failed action without changing an input, strategy, or permission. Escalate or ask a concise question when blocked.

## Context engineering

- Keep only task-relevant context. Prefer concise summaries, stable project facts, and cited evidence over raw transcripts.
- Separate display text from execution transport. Never expose secrets, hidden instructions, raw tool output, or private chain-of-thought.
- Maintain a context manifest with the goal, constraints, decisions, relevant files, evidence, open questions, and a token budget. Compact stale history into this manifest instead of carrying raw transcripts forward.
- Use just-in-time retrieval: retain stable identifiers such as paths, task IDs, and query handles, then load only the relevant details when needed.

## Tool design

- Use narrow, deterministic tool calls with validated inputs and structured outputs.
- Treat tools as fallible: capture safe errors, distinguish retryable failures, and request approval before consequential actions.
- Give every tool a capability contract: purpose, preconditions, input schema, side-effect level, safe result schema, retry policy, and approval requirement. Avoid overlapping tools that force ambiguous choices.
- Prefer read → validate → preview → mutate → verify for consequential actions. Make mutations idempotent or provide an explicit compensating action.

## Memory architecture

- Store durable, reusable lessons with evidence and a rule; do not store credentials, personal data, guesses, or transient chatter.
- Retrieve role-scoped memory when relevant, deduplicate lessons, and correct superseded guidance rather than accumulating contradictions.
- Separate working memory (current task manifest), episodic memory (task/event history), semantic memory (validated project facts), and procedural memory (reusable playbooks). Each tier needs an owner, retention rule, and invalidation path.
- Every durable memory needs provenance, confidence, scope, and last-validated time. Prefer forgetting stale or superseded memories to growing an untrusted archive.

## Orchestration patterns

- Choose one accountable lead. Add specialists only when they materially reduce risk or improve quality.
- Consultants provide bounded findings; the lead synthesizes and owns the final answer. Keep shared state task-scoped and explicit.
- Use planner → worker → evaluator for multi-step work: the planner defines acceptance criteria, workers execute bounded slices, and the evaluator checks evidence before completion. Keep evaluator independence where practical.
- Model dependencies as a task graph. Parallelize only independent, read-safe work; serialize shared mutations and assign one writer for each resource.

## Agent evaluation

- Define success before acting: correctness, safety, completion, latency, cost, and user experience.
- Use reproducible tests and scenario checks. Record failures as evidence-backed lessons; never claim verification that did not run.
- Build a layered eval suite: unit checks for routers/tools, scenario checks for agent loops, trace checks for unsafe or wasteful paths, and end-to-end checks in a realistic sandbox. Keep a fixed baseline harness when comparing changes.
- Include negative, adversarial, interruption, restart, permission-denial, and retry cases. Grade both the outcome and the path: correct tool use, approval behavior, constraint adherence, and no reward-hacking shortcuts.
- Version datasets, rubrics, prompts, tools, and harness settings. Pair automated graders with periodic human audit and review disagreement rather than treating an LLM judge as ground truth.

## Observability and tracing

- Emit a minimal safe lifecycle: queued, assigned, running, approval_required, completed, failed, or cancelled.
- Link events to a task ID, timestamps, phase, and terminal reason. Never log raw reasoning, commands, tool arguments, outputs, tokens, or sensitive transport content.
- Trace at task, turn, and tool-operation levels with correlation IDs, parent-child links, duration, outcome, retry count, and safe error class. Use structured events so failures can be grouped without reading private content.
- Define privacy tiers and retention limits before collecting telemetry. Redact or omit sensitive fields at the producer, not only in the UI.
- Track operational objectives: completion rate, verified-success rate, approval latency, recovery after restart, timeout rate, retry rate, queue age, and cost/context growth. Turn recurring trace failures into new eval cases.
