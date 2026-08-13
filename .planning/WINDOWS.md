---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-13T13:03:18.543Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | unrun-verify | tests/Feature/TaskPromptTransportTest.php |  | PHP feature verification unrun because php is unavailable in this environment. | open |  | 2026-08-13T13:03:18.543Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "tests/Feature/TaskPromptTransportTest.php",
    "line": null,
    "description": "PHP feature verification unrun because php is unavailable in this environment.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-13T13:03:18.543Z",
    "resolved_at": null
  }
]
````
