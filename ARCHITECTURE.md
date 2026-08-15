# Project Architecture Map

## FAIS Brains Runtime Orchestration

`composer run dev` starts Laravel, the queue worker, Vite, Reverb, and
`.agents/task_watcher.cjs`. The watcher consumes task IPC files from
`storage/app/agent_ipc`, routes work through `.agents/brain_orchestrator.cjs`,
and delegates model turns to `.agents/codex_brain_pool.cjs`.

The pool owns one long-lived `codex app-server --stdio` process and one durable
Codex thread per brain (`Architect`, `Security`, `Senior_Dev`, and
`Junior_Dev`). Normal tasks use one lead brain; heavy multi-domain tasks use up
to three sequential consultants followed by one lead synthesis. The abort IPC
signal interrupts active turns without stopping the watcher.

### Prompt Transport Boundary

The browser submits two validated strings: `display_task` is the full user text
for intent routing, history, acknowledgements, and audit logs; `task` is the
compressed input. Laravel stores the latter as `transport_task` in the IPC
payload, alongside attachment URLs as separate metadata. The watcher rejects
legacy or incomplete payloads. The orchestrator routes with `display_task`, but
every Codex prompt and decision follow-up uses only `transport_task` plus the
attachment metadata. The full display text never enters watcher logs, webhook
payloads, error output, previous execution context, or model prompts.

### Conversation History & Cross-Device Sync

`brain_conversations` owns the Thought Stream's chat boundaries. Existing
messages and tasks are placed in the permanent `History` conversation during
migration; newly created chats receive an ID that travels with dispatch IPC,
task records, webhook replies, and approval notifications. The Jarvis UI loads
and displays only the selected conversation, while the shared broadcast channel
includes that conversation ID so inactive chats do not pollute the active view.

To synchronize chat history across multiple workstations via git,
`BrainHistorySyncService` maintains a version-controlled JSON data snapshot at
`database/brain_history.json`. Writing messages or creating conversations automatically
exports the latest state, while application startup, database seeders, CLI
`php artisan brain:sync-history`, and UI reads automatically import any missing or
updated conversations and messages idempotently into SQLite.

Task submission does not create a `SYSTEM` acknowledgement. While Codex is
working, its lifecycle items publish deduplicated, safe phase updates from the
active brain (for example, reviewing, running a command, or preparing changes).
Raw reasoning, commands, arguments, tool output, and file paths are never
broadcast.

Brief greetings addressed to the group are a separate conversational path: all
four brain threads reply. Explicit aliases (`archi`/`architect`, `security`,
`senior dev`, and `junior`) select the corresponding lead instead of falling
through to the default Senior Dev route.

### Proactive Suggestions & Stateful Goal Chaining

FAIS Brains actively guide user workflow via structured option buttons in the
format `[QUESTION: concise question][OPTIONS: Option A :: Option B]`.
When a multi-step objective (such as committing and pushing changes) encounters
failing tests, build errors, or merge conflicts, `agent_state.cjs` records a
chained `pending_goal` with the original task and blocker. The lead brain diagnoses
the failure and suggests a fix using interactive option buttons.
Once the user chooses to fix the issue and the fix is resolved, the orchestrator
automatically updates the goal state and prompts the brain to propose continuing
the initial objective (e.g., commit & push). Unrelated tasks or explicit cancellation
automatically clear the pending goal queue.

### Autonomous Self-Healing Loop

When an actionable turn encounters test failures, compiler/type errors, or build
issues, `.agents/brain_orchestrator.cjs` invokes a bounded autonomous self-healing loop
(up to 2 attempts). It broadcasts real-time `[AUTONOMY]` diagnostic updates to the UI,
investigates root causes, applies fixes, and re-verifies. If resolved within 2 attempts,
it announces the fix. If still failing after 2 attempts, it escalates to the user with
interactive option buttons.

### Visual Git Diff Viewer & Quick Actions Command Deck

- **Visual Diff Viewer**: Messages containing `[DIFF: path\n```diff\n...\n```]` or
  fenced diff code blocks render as interactive, collapsible syntax-highlighted cards
  with line additions (`+`), deletions (`-`), file header badges, and copy capabilities.
- **Quick Actions Command Deck**: A horizontal pill-button toolbar above the input
  terminal provides 1-click execution for routine workflows: Pre-Push Audit & Commit,
  Run Test Suite, Evolve Skills, Sync History, Security Scan, and Health Check.

### Dual-Engine Architecture & Antigravity Subagents

FAIS Brains supports two execution engines via a 1-click toggle in the Jarvis UI header:
1. **Codex Brain Pool (`⚡ Codex`)**: Executes through the long-lived `codex app-server --stdio` process with specialized model threads.
2. **Antigravity IDE Agents (`✨ Antigravity`)**: Executes directly through the Antigravity multi-agent system, where each brain (`Architect`, `Security`, `Senior_Dev`, `Junior_Dev`) has its own dedicated subagent definition file in `.agents/brains/*.agent.md`.

**100% Knowledge Inheritance**:
All Antigravity subagents directly inherit the collective intelligence of the FAIS Brains ecosystem:
- `Global_Context/Consciousness_Protocol.md` (autonomous collaboration and sentience guidelines).
- `Brains/{Brain}/Persona.md` (role personality, voice, and boundaries).
- `Brains/{Brain}/Learnings.md` (historical observations and rules).
- `Mistakes Log.md` (anti-patterns and regression prevention).
- `Docs/Skills/*.md` (evolved skills).
- `agent_state.cjs` (active goal chaining and durable context).
- Bi-directional vault learning: Any `[[VAULT_LEARNING: ...]]` directives emitted by Antigravity subagents persist automatically into the Obsidian Vault.

### Voice Synthesis (TTS) per Brain Persona

The Thought Stream features browser-native Web Speech API voice synthesis with customized voice timbre and modulation per persona:
- **Architect**: Natural British/Mid-Atlantic Male (`Microsoft Ryan/Oliver Natural`, `George`, `Google UK Male`), Pitch `0.96`, Rate `0.98`.
- **Security**: Steady Analytical Calm Male (`Microsoft Christopher/Steffan Natural`, `David Desktop`), Pitch `0.93`, Rate `0.97`.
- **Senior_Dev**: Warm Confident Developer Male (`Microsoft Guy/Eric Natural`, `Google US Male`, `Alex`), Pitch `1.00`, Rate `1.00`.
- **Junior_Dev**: Crisp Friendly Youthful Voice (`Microsoft Jenny/Sonia Natural`, `Google US Female`, `Samantha`), Pitch `1.04`, Rate `1.02`.

**Controls**:
- Header TTS toggle button (`🔊 Voice On` / `🔇 Muted`) persisted in `localStorage`.
- Auto-speaks incoming Thought Stream messages with an intelligent text sanitizer that expands developer abbreviations and strips code blocks/diffs.
- Individual 1-click speaker replay button on each message card in the Thought Stream.




Project paths come from `.env`: `OBSIDIAN_VAULT_PATH` and


`FAIS_PROJECT_ROOT`. The app-server and watcher restart when `composer run dev`
is restarted; runtime IPC and PID files are not source-controlled.

Each turn receives a load-based `.env` execution profile: light work uses
`gpt-5.6-terra` at `low`, ordinary work uses Terra at `medium`, and heavy
multi-domain work uses `gpt-5.6-sol` at `high`. Casual greetings use a
dedicated prompt without repository or execution instructions.

Group greetings are deliberately tool-free and capped at two sentences per
brain. They have a 30-second turn limit; any timeout interrupts the turn and
resets the app server so future requests begin from a healthy process.

At thread creation, each brain loads bounded shared and role-specific context
from `OBSIDIAN_VAULT_PATH`: the consciousness protocol, persona, applicable
rules/checklists, mistakes, and prior learnings. Substantive responses may emit
a private structured learning directive; the watcher strips it from the UI and
writes only deduplicated, evidence-labelled, non-sensitive entries to that
brain's `Learnings.md`. A missing or unwritable vault fails open and never
blocks a brain response.

*Last updated: 2026-08-10T03:39:54.120Z*

This file is automatically generated by the Context Engine to serve as a backup context source for the AI.

## Database Models
- **BrainMessage** (`app/Models/BrainMessage.php`)
- **User** (`app/Models/User.php`)

## Routes
- **api.php** (`routes/api.php`)
- **auth.php** (`routes/auth.php`)
- **channels.php** (`routes/channels.php`)
- **console.php** (`routes/console.php`)
- **web.php** (`routes/web.php`)

## React Components & Pages
- **ConfirmPassword.tsx** (Page) - `resources/js/Pages/Auth/ConfirmPassword.tsx`
- **ForgotPassword.tsx** (Page) - `resources/js/Pages/Auth/ForgotPassword.tsx`
- **Login.tsx** (Page) - `resources/js/Pages/Auth/Login.tsx`
- **Register.tsx** (Page) - `resources/js/Pages/Auth/Register.tsx`
- **ResetPassword.tsx** (Page) - `resources/js/Pages/Auth/ResetPassword.tsx`
- **VerifyEmail.tsx** (Page) - `resources/js/Pages/Auth/VerifyEmail.tsx`
- **JarvisUI.tsx** (Page) - `resources/js/Pages/Brains/JarvisUI.tsx`
- **Dashboard.tsx** (Page) - `resources/js/Pages/Dashboard.tsx`
- **Edit.tsx** (Page) - `resources/js/Pages/Profile/Edit.tsx`
- **DeleteUserForm.tsx** (Page) - `resources/js/Pages/Profile/Partials/DeleteUserForm.tsx`
- **UpdatePasswordForm.tsx** (Page) - `resources/js/Pages/Profile/Partials/UpdatePasswordForm.tsx`
- **UpdateProfileInformationForm.tsx** (Page) - `resources/js/Pages/Profile/Partials/UpdateProfileInformationForm.tsx`
- **Welcome.tsx** (Page) - `resources/js/Pages/Welcome.tsx`
- **ApplicationLogo.tsx** (Component) - `resources/js/Components/ApplicationLogo.tsx`
- **BrainNetwork.tsx** (Component) - `resources/js/Components/BrainNetwork.tsx`
- **BrainNode.tsx** (Component) - `resources/js/Components/BrainNode.tsx`
- **Checkbox.tsx** (Component) - `resources/js/Components/Checkbox.tsx`
- **DangerButton.tsx** (Component) - `resources/js/Components/DangerButton.tsx`
- **Dropdown.tsx** (Component) - `resources/js/Components/Dropdown.tsx`
- **InputError.tsx** (Component) - `resources/js/Components/InputError.tsx`
- **InputLabel.tsx** (Component) - `resources/js/Components/InputLabel.tsx`
- **Modal.tsx** (Component) - `resources/js/Components/Modal.tsx`
- **NavLink.tsx** (Component) - `resources/js/Components/NavLink.tsx`
- **PrimaryButton.tsx** (Component) - `resources/js/Components/PrimaryButton.tsx`
- **ResponsiveNavLink.tsx** (Component) - `resources/js/Components/ResponsiveNavLink.tsx`
- **SecondaryButton.tsx** (Component) - `resources/js/Components/SecondaryButton.tsx`
- **TextInput.tsx** (Component) - `resources/js/Components/TextInput.tsx`


# Project Architecture Map

*Last updated: 2026-08-10T03:44:58.207Z*

This file is automatically generated by the Context Engine to serve as a backup context source for the AI.

## Database Models
- **AccountsFund** (`app/Models/AccountsFund.php`)
- **ActivityLog** (`app/Models/ActivityLog.php`)
- **AdjustmentType** (`app/Models/AdjustmentType.php`)
- **ContractOfService** (`app/Models/ContractOfService.php`)
- **CosEmploymentHistory** (`app/Models/CosEmploymentHistory.php`)
- **CosFinancial** (`app/Models/CosFinancial.php`)
- **CosOrsAllotment** (`app/Models/CosOrsAllotment.php`)
- **CosOrsObligation** (`app/Models/CosOrsObligation.php`)
- **CosPaymentCertSignatory** (`app/Models/CosPaymentCertSignatory.php`)
- **CosPayroll** (`app/Models/CosPayroll.php`)
- **Employee** (`app/Models/Employee.php`)
- **EmployeeAdjustment** (`app/Models/EmployeeAdjustment.php`)
- **EmployeeFinancial** (`app/Models/EmployeeFinancial.php`)
- **EmployeeHistory** (`app/Models/EmployeeHistory.php`)
- **FundSource** (`app/Models/FundSource.php`)
- **Payroll** (`app/Models/Payroll.php`)
- **PayslipTransaction** (`app/Models/PayslipTransaction.php`)
- **Position** (`app/Models/Position.php`)
- **Role** (`app/Models/Role.php`)
- **SalaryGrade** (`app/Models/SalaryGrade.php`)
- **Signatory** (`app/Models/Signatory.php`)
- **SSSContribution** (`app/Models/SSSContribution.php`)
- **TaxBracket** (`app/Models/TaxBracket.php`)
- **User** (`app/Models/User.php`)

## Routes
- **console.php** (`routes/console.php`)
- **settings.php** (`routes/settings.php`)
- **web.php** (`routes/web.php`)

## React Components & Pages
- **Index.tsx** (Page) - `resources/js/Pages/ActivityLogs/Index.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/Admin/Signatories/Index.tsx`
- **confirm-password.tsx** (Page) - `resources/js/Pages/auth/confirm-password.tsx`
- **forgot-password.tsx** (Page) - `resources/js/Pages/auth/forgot-password.tsx`
- **login.tsx** (Page) - `resources/js/Pages/auth/login.tsx`
- **register.tsx** (Page) - `resources/js/Pages/auth/register.tsx`
- **reset-password.tsx** (Page) - `resources/js/Pages/auth/reset-password.tsx`
- **two-factor-challenge.tsx** (Page) - `resources/js/Pages/auth/two-factor-challenge.tsx`
- **verify-email.tsx** (Page) - `resources/js/Pages/auth/verify-email.tsx`
- **AddCOSForm.tsx** (Page) - `resources/js/Pages/ContractOfService/AddCOSForm.tsx`
- **COSEmployeeDetail.tsx** (Page) - `resources/js/Pages/ContractOfService/COSEmployeeDetail.tsx`
- **COSForm.tsx** (Page) - `resources/js/Pages/ContractOfService/COSForm.tsx`
- **EditCOSForm.tsx** (Page) - `resources/js/Pages/ContractOfService/EditCOSForm.tsx`
- **index.tsx** (Page) - `resources/js/Pages/ContractOfService/index.tsx`
- **show.tsx** (Page) - `resources/js/Pages/ContractOfService/show.tsx`
- **upload.tsx** (Page) - `resources/js/Pages/ContractOfService/upload.tsx`
- **AccountEmployeesModal.tsx** (Page) - `resources/js/Pages/CosOrsObligations/AccountEmployeesModal.tsx`
- **AddAccountsFundModal.tsx** (Page) - `resources/js/Pages/CosOrsObligations/AddAccountsFundModal.tsx`
- **AddFundSourceModal.tsx** (Page) - `resources/js/Pages/CosOrsObligations/AddFundSourceModal.tsx`
- **AddObligationModal.tsx** (Page) - `resources/js/Pages/CosOrsObligations/AddObligationModal.tsx`
- **AllotmentsModal.tsx** (Page) - `resources/js/Pages/CosOrsObligations/AllotmentsModal.tsx`
- **AuditTrail.tsx** (Page) - `resources/js/Pages/CosOrsObligations/AuditTrail.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/CosOrsObligations/Index.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/CosPaymentCert/Index.tsx`
- **Show.tsx** (Page) - `resources/js/Pages/CosPaymentCert/Show.tsx`
- **Signatories.tsx** (Page) - `resources/js/Pages/CosPaymentCert/Signatories.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/CosPayroll/Index.tsx`
- **PrintCosPayroll.tsx** (Page) - `resources/js/Pages/CosPayroll/PrintCosPayroll.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/Dashboard/Index.tsx`
- **AddEmployeeDialog.tsx** (Page) - `resources/js/Pages/DashboardComponents/components/AddEmployeeDialog.tsx`
- **AddEmployeeSectionHeader.tsx** (Page) - `resources/js/Pages/DashboardComponents/components/AddEmployeeSectionHeader.tsx`
- **EditEmployeeDialog.tsx** (Page) - `resources/js/Pages/DashboardComponents/components/EditEmployeeDialog.tsx`
- **EmployeeForm.tsx** (Page) - `resources/js/Pages/DashboardComponents/components/EmployeeForm.tsx`
- **EmployeeTable.tsx** (Page) - `resources/js/Pages/DashboardComponents/components/EmployeeTable.tsx`
- **RequiredIndicator.tsx** (Page) - `resources/js/Pages/DashboardComponents/components/RequiredIndicator.tsx`
- **COS.tsx** (Page) - `resources/js/Pages/DeletedRecords/COS.tsx`
- **CosPayrolls.tsx** (Page) - `resources/js/Pages/DeletedRecords/CosPayrolls.tsx`
- **Employees.tsx** (Page) - `resources/js/Pages/DeletedRecords/Employees.tsx`
- **Payrolls.tsx** (Page) - `resources/js/Pages/DeletedRecords/Payrolls.tsx`
- **Payslips.tsx** (Page) - `resources/js/Pages/DeletedRecords/Payslips.tsx`
- **SalaryGrades.tsx** (Page) - `resources/js/Pages/DeletedRecords/SalaryGrades.tsx`
- **Deductions.tsx** (Page) - `resources/js/Pages/Employees/Deductions.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/Employees/Index.tsx`
- **Show.tsx** (Page) - `resources/js/Pages/Employees/Show.tsx`
- **login.tsx** (Page) - `resources/js/Pages/login.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/Payrolls/Index.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/Payslips/Index.tsx`
- **MonthlyPayslip.tsx** (Page) - `resources/js/Pages/Payslips/MonthlyPayslip.tsx`
- **WeeklyPayslip.tsx** (Page) - `resources/js/Pages/Payslips/WeeklyPayslip.tsx`
- **GeneralPayroll.tsx** (Page) - `resources/js/Pages/Reports/GeneralPayroll.tsx`
- **YearEndBenefits.tsx** (Page) - `resources/js/Pages/Reports/YearEndBenefits.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/SalaryGrades/Index.tsx`
- **appearance.tsx** (Page) - `resources/js/Pages/settings/appearance.tsx`
- **password.tsx** (Page) - `resources/js/Pages/settings/password.tsx`
- **profile.tsx** (Page) - `resources/js/Pages/settings/profile.tsx`
- **two-factor.tsx** (Page) - `resources/js/Pages/settings/two-factor.tsx`
- **Index.tsx** (Page) - `resources/js/Pages/TaxBrackets/Index.tsx`
- **welcome.tsx** (Page) - `resources/js/Pages/welcome.tsx`
- **alert-error.tsx** (Component) - `resources/js/Components/alert-error.tsx`
- **app-content.tsx** (Component) - `resources/js/Components/app-content.tsx`
- **app-header.tsx** (Component) - `resources/js/Components/app-header.tsx`
- **app-logo-icon.tsx** (Component) - `resources/js/Components/app-logo-icon.tsx`
- **app-logo.tsx** (Component) - `resources/js/Components/app-logo.tsx`
- **app-shell.tsx** (Component) - `resources/js/Components/app-shell.tsx`
- **app-sidebar-header.tsx** (Component) - `resources/js/Components/app-sidebar-header.tsx`
- **app-sidebar.tsx** (Component) - `resources/js/Components/app-sidebar.tsx`
- **appearance-dropdown.tsx** (Component) - `resources/js/Components/appearance-dropdown.tsx`
- **appearance-tabs.tsx** (Component) - `resources/js/Components/appearance-tabs.tsx`
- **breadcrumbs.tsx** (Component) - `resources/js/Components/breadcrumbs.tsx`
- **delete-user.tsx** (Component) - `resources/js/Components/delete-user.tsx`
- **ViewEmployeeDialog.tsx** (Component) - `resources/js/Components/Employee/ViewEmployeeDialog.tsx`
- **TaxSummaryCard.tsx** (Component) - `resources/js/Components/employees/TaxSummaryCard.tsx`
- **heading-small.tsx** (Component) - `resources/js/Components/heading-small.tsx`
- **heading.tsx** (Component) - `resources/js/Components/heading.tsx`
- **icon.tsx** (Component) - `resources/js/Components/icon.tsx`
- **input-error.tsx** (Component) - `resources/js/Components/input-error.tsx`
- **animated-card.tsx** (Component) - `resources/js/Components/kokonutui/animated-card.tsx`
- **mouse-effect-card.tsx** (Component) - `resources/js/Components/kokonutui/mouse-effect-card.tsx`
- **LightRays.tsx** (Component) - `resources/js/Components/LightRays.tsx`
- **LiquidEther.tsx** (Component) - `resources/js/Components/LiquidEther.tsx`
- **login-form.tsx** (Component) - `resources/js/Components/login-form.tsx`
- **nav-footer.tsx** (Component) - `resources/js/Components/nav-footer.tsx`
- **nav-main.tsx** (Component) - `resources/js/Components/nav-main.tsx`
- **nav-user.tsx** (Component) - `resources/js/Components/nav-user.tsx`
- **page-transition.tsx** (Component) - `resources/js/Components/page-transition.tsx`
- **RoleGuard.tsx** (Component) - `resources/js/Components/RoleGuard.tsx`
- **StepIndicator.tsx** (Component) - `resources/js/Components/StepIndicator.tsx`
- **text-link.tsx** (Component) - `resources/js/Components/text-link.tsx`
- **two-factor-recovery-codes.tsx** (Component) - `resources/js/Components/two-factor-recovery-codes.tsx`
- **two-factor-setup-modal.tsx** (Component) - `resources/js/Components/two-factor-setup-modal.tsx`
- **alert-dialog.tsx** (Component) - `resources/js/Components/ui/alert-dialog.tsx`
- **alert.tsx** (Component) - `resources/js/Components/ui/alert.tsx`
- **avatar.tsx** (Component) - `resources/js/Components/ui/avatar.tsx`
- **badge.tsx** (Component) - `resources/js/Components/ui/badge.tsx`
- **breadcrumb.tsx** (Component) - `resources/js/Components/ui/breadcrumb.tsx`
- **button.tsx** (Component) - `resources/js/Components/ui/button.tsx`
- **card.tsx** (Component) - `resources/js/Components/ui/card.tsx`
- **checkbox.tsx** (Component) - `resources/js/Components/ui/checkbox.tsx`
- **collapsible.tsx** (Component) - `resources/js/Components/ui/collapsible.tsx`
- **dialog.tsx** (Component) - `resources/js/Components/ui/dialog.tsx`
- **dropdown-menu.tsx** (Component) - `resources/js/Components/ui/dropdown-menu.tsx`
- **field.tsx** (Component) - `resources/js/Components/ui/field.tsx`
- **icon.tsx** (Component) - `resources/js/Components/ui/icon.tsx`
- **input-otp.tsx** (Component) - `resources/js/Components/ui/input-otp.tsx`
- **input.tsx** (Component) - `resources/js/Components/ui/input.tsx`
- **label.tsx** (Component) - `resources/js/Components/ui/label.tsx`
- **navigation-menu.tsx** (Component) - `resources/js/Components/ui/navigation-menu.tsx`
- **pagination.tsx** (Component) - `resources/js/Components/ui/pagination.tsx`
- **placeholder-pattern.tsx** (Component) - `resources/js/Components/ui/placeholder-pattern.tsx`
- **scroll-area.tsx** (Component) - `resources/js/Components/ui/scroll-area.tsx`
- **select.tsx** (Component) - `resources/js/Components/ui/select.tsx`
- **separator.tsx** (Component) - `resources/js/Components/ui/separator.tsx`
- **sheet.tsx** (Component) - `resources/js/Components/ui/sheet.tsx`
- **sidebar.tsx** (Component) - `resources/js/Components/ui/sidebar.tsx`
- **skeleton.tsx** (Component) - `resources/js/Components/ui/skeleton.tsx`
- **spinner.tsx** (Component) - `resources/js/Components/ui/spinner.tsx`
- **table.tsx** (Component) - `resources/js/Components/ui/table.tsx`
- **tabs.tsx** (Component) - `resources/js/Components/ui/tabs.tsx`
- **toaster.tsx** (Component) - `resources/js/Components/ui/toaster.tsx`
- **toggle-group.tsx** (Component) - `resources/js/Components/ui/toggle-group.tsx`
- **toggle.tsx** (Component) - `resources/js/Components/ui/toggle.tsx`
- **tooltip.tsx** (Component) - `resources/js/Components/ui/tooltip.tsx`
- **user-info.tsx** (Component) - `resources/js/Components/user-info.tsx`
- **user-menu-content.tsx** (Component) - `resources/js/Components/user-menu-content.tsx`
