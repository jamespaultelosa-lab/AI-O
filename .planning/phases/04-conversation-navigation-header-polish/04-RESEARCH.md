# Phase 4 Research â€” Conversation Navigation Header Polish

## Recommendation

Treat the header as two related control groups rather than one crowded toolbar:

1. A tab group for **Thought Stream** and **Memory Vault**, with the memory count and conditional **Clear view** action.
2. A conversation group that always exposes the active conversation title, the conversation disclosure, **New chat**, and a labeled connection state.

Use intrinsic grid/flex sizing (`minmax(0, 1fr)`, `min-w-0`, truncation, and wrapping) instead of viewport-only breakpoints. The sidebar can be resized from 340 px to 800 px while the viewport remains desktop-sized, so Tailwind `sm`/`lg` breakpoints alone cannot describe the actual available header width.

## Scope and traceability

This phase should modify presentation and local interaction wiring only. Preserve the existing conversation endpoints, message loading, new-chat creation, memory count, clear-view behavior, active tab content, and current connection-state meaning.

| UI-01 concern | Recommended treatment | Validation signal |
|---|---|---|
| Clear hierarchy | Separate tab navigation from conversation/session actions; make the active chat title the dominant label in the conversation group | At first glance, a user can name the active tab and active chat without opening anything |
| Keyboard accessibility | Use native buttons, explicit focus-visible styles, semantic tab wiring, and a disclosure that closes on Escape and restores focus | Complete the keyboard script below without a pointer |
| Responsive behavior | Use intrinsic layout based on sidebar width, with safe truncation and no fixed-width dependency | No overlap or clipping at 340, 440, and 800 px sidebar widths and narrow mobile widths |
| Accessible controls | Provide programmatic names, expanded/selected/current states, non-color status text, and practical targets | Browser accessibility tree exposes every control and its state; small controls are at least 36â€“40 px in the compact header |
| Theme parity | Keep paired light/dark classes and visible focus/contrast in both variants | Both themes pass the visual and keyboard matrix |

## Current implementation findings

### Existing patterns to preserve

- `resources/js/Pages/Brains/JarvisUI.tsx` is the page-level integration surface. It uses local React state, Axios, inline Tailwind classes, paired light/dark variants, native buttons, and inline SVG icons.
- The sidebar is resizable on desktop from 340 px to 800 px (`JarvisUI.tsx:722-749`) and becomes a full-width lower panel on smaller layouts.
- Conversation state and actions already exist (`JarvisUI.tsx:177-183`, `420-474`): list conversations, load a selected conversation, create a chat, and close the dropdown after selection.
- The header already retains both tabs, the memory badge, conditional clear-view action, chat dropdown, new-chat action, and green connection indicator (`JarvisUI.tsx:751-827`). No API or persistence change is needed.
- The project has no frontend component/E2E test harness. `package.json` exposes only `build` and `dev`, while `tests/Feature/BrainConversationTest.php` verifies the conversation API contract and isolation.

### Reference image findings

The supplied crop confirms the header is visually compressed into a single shallow row. The active tab is visible, but the right-hand group reduces conversation navigation to a generic **Chats** label, a very small plus button, and an unlabeled green dot. This creates four concrete problems:

1. The active conversation is hidden until the dropdown is opened.
2. The new-chat target is only `w-5 h-5` (20 px), which is too small for a practical pointer target.
3. Connection state is conveyed primarily by color and a hover-only `title`.
4. The header has no resilient strategy when tab labels, the memory badge, clear-view action, conversation title, and session actions compete for 340 px.

### Local correctness issue that blocks the active-title requirement

`fetchConversations()` calls `setConversations(res.data)` and immediately calls `switchConversation(res.data[0].id)`. `createConversation()` follows the same pattern. Because React state updates are asynchronous, `switchConversation()` can read the previous `conversations` array at `JarvisUI.tsx:432`, fail to find the selected object, and leave `activeConversation` unset even though its messages load.

Do not solve this with another effect or API change. Pass the selected conversation object into the switch function (or explicitly set that object after a successful message fetch). This preserves semantics and makes the header title deterministic for initial load, dropdown selection, and newly created chats.

## Recommended interaction and markup pattern

### Tabs

- Use a labeled `role="tablist"` with each tab exposing `role="tab"`, `aria-selected`, `aria-controls`, and a stable `id`.
- Give each content container the matching `role="tabpanel"` and `aria-labelledby`.
- If ARIA tab roles are used, implement Left/Right Arrow plus Home/End movement between the two tabs; Tab should leave the tab list. Alternatively, retain ordinary buttons without ARIA tab roles. Do not add tab roles without their keyboard contract.
- Keep the memory count inside the Memory Vault tab name so it is announced with the tab. Mark purely visual badge decoration appropriately.
- Keep **Clear view** separate from the tab itself, visible only under the existing condition, with an explicit accessible name such as â€œClear memory vault view.â€

### Active conversation and disclosure

- Replace generic **Chats** as the only visible label with a disclosure button containing a quiet eyebrow such as â€œCurrent chatâ€ and a truncated active title.
- Use `aria-expanded` and `aria-controls` on the disclosure. The title must remain available via accessible text or the button's `title` when visually truncated.
- Keep the dropdown as a simple disclosure region containing native conversation buttons rather than claiming `menu` or `listbox` semantics without implementing those composite-widget keyboard models.
- Mark the active conversation button with `aria-current="true"` and a visual check/active treatment that does not rely on color alone.
- On open, focus the active conversation (or first item); Escape closes and returns focus to the disclosure; clicking outside closes. Selection continues to call the existing message-loading path.
- Provide stable fallback text for loading, empty, and temporarily unresolved active state. Long titles and unbroken strings must truncate rather than expand the header.

### New chat and connection state

- Keep **New chat** as a separate native button with `type="button"`, an `aria-label`, a visible focus ring, and a practical 36â€“40 px minimum target. Preserve the existing disabled state and expose busy state with `aria-busy` or visually hidden text while creation is in progress.
- Render connection as text plus an `aria-hidden` indicator, for example â€œConnectedâ€ beside the green dot. Apply `motion-reduce:animate-none` if the pulse remains.
- Do not derive a new online/offline state from Echo in this phase. The current dot is hard-coded as connected; wiring transport lifecycle would change behavior and needs separate reconnect/error requirements and tests.

## Tracer-first implementation approach

### Tracer 1 â€” deterministic active identity

Introduce a narrow `Conversation` TypeScript interface for the fields this page reads, remove `any` from conversation state/handlers, and change switching to receive the selected conversation object. Render its title in the closed disclosure button with a safe fallback.

**Stop condition:** initial load, existing-chat selection, and new-chat creation all leave a visible, correct active title; message loading behavior is unchanged.

### Tracer 2 â€” semantic controls before visual polish

Add button types, accessible names/states, focus-visible styles, tab/panel associations, Escape/focus-return behavior, and labeled connection status. Keep the current colors and broad layout until keyboard behavior is verified.

**Stop condition:** the entire header is operable and understandable using keyboard plus accessibility tree alone.

### Tracer 3 â€” intrinsic responsive hierarchy

Split the header into tab and conversation groups. Use grid/flex with `min-w-0`, `minmax(0, 1fr)`, truncation, and wrapping so resizing the sidebarâ€”not only the viewportâ€”drives behavior. Anchor the dropdown to the conversation control and constrain it to the available panel width.

**Stop condition:** no control overlaps, clips, or becomes unreachable at every target width; the stream retains a reasonable visible area.

### Tracer 4 â€” theme and state polish

Tune light/dark borders, contrast, active/current indicators, hover/focus/disabled states, reduced motion, and clear-view placement. Avoid adding a new icon dependency; existing inline SVG and Tailwind conventions are sufficient.

**Stop condition:** both themes communicate tab selection, active chat, focus, disabled creation, and connection state without color alone.

## Risks and trade-offs

1. **Viewport breakpoints are misleading.** A desktop viewport can still contain a 340 px sidebar. Prefer intrinsic layout; otherwise the header will regress when the drag handle narrows it.
2. **Two rows consume stream height.** This is the appropriate trade-off for legibility and target size, but keep both rows compact and avoid a third line under normal titles.
3. **ARIA can reduce accessibility when incomplete.** Native buttons plus a disclosure are safer than an incomplete custom combobox/menu. Only use the tab pattern if its keyboard behavior and panel relationships are implemented together.
4. **Dropdown focus can become stale.** Conversations can be empty or updated after creation. Resolve the focus target from current rendered data and always retain Escape/focus-return behavior.
5. **Light/dark utility branches can drift.** Define the structural classes once and branch only color/elevation classes where possible.
6. **Build success is not behavioral proof.** TypeScript/Vite cannot verify focus order, truncation, contrast, or sidebar-resize behavior. Manual browser validation is required unless a frontend test harness is deliberately added.
7. **Installing a test framework is disproportionate for this phase.** Do not add Vitest/Testing Library/Playwright solely for this header unless continued UI work justifies the dependency and configuration cost. Record the gap and use a repeatable UAT script now.

## Concrete validation guidance

### Automated regression checks

Run the existing checks after confirming the relevant executables/files are available:

```powershell
npm.cmd run build
php artisan test --filter=BrainConversationTest
```

The build is the type/bundle gate. The focused Laravel suite demonstrates that list/create/history behavior remains intact; it does not validate the React interaction.

### Keyboard and accessibility script

Perform this in both light and dark themes:

1. Reload with at least three conversations, including one title long enough to truncate.
2. Tab into the header. Every interactive element must show a visible focus indicator.
3. Operate Thought Stream and Memory Vault using the chosen keyboard contract; verify selection and matching panel exposure are announced.
4. Open the conversation disclosure with Enter and Space. Verify expanded state changes and focus moves to a useful conversation choice.
5. Move through conversation buttons with normal Tab navigation, select one, and confirm the closed control immediately shows its title.
6. Reopen the disclosure, press Escape, and verify it closes and focus returns to the disclosure.
7. Activate **New chat** once. Verify the button exposes its disabled/busy state, duplicate activation is prevented, the new title becomes active, and messages switch to that conversation.
8. On Memory Vault with entries, activate **Clear view** and verify only the current client view clears, matching existing behavior.
9. Inspect the accessibility tree: tabs/buttons have names; expanded, selected, current, and disabled states are present; â€œConnectedâ€ is announced without relying on the dot or tooltip.
10. Enable reduced-motion preference and confirm the status indicator does not pulse.

### Responsive and visual matrix

Validate with short, long, and unbroken conversation titles at:

- Desktop sidebar widths: 340 px, 440 px, and 800 px using the existing drag handle.
- Mobile viewport widths: 320 px, 375 px, and 768 px.
- Both light and dark themes.
- Empty conversations, active History, normal chat, new-chat busy, memory count present, and Clear view present.

At every point, assert: no horizontal overflow; no control overlap; active tab and active chat remain visible; all pointer targets remain practical; the dropdown stays within the sidebar; truncated titles retain an accessible full name; and content below the header remains scrollable.

### Visual evidence

Capture before/after crops matching `storage/app/public/brain_attachments/attach_6a7ebc2299ba9_1786690594.png` at the default 440 px sidebar width, plus one 340 px and one mobile crop in each theme. Review the images for hierarchy and state clarity rather than pixel matching.

## Primary accessibility references

- WAI-ARIA Authoring Practices, Tabs Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- WAI-ARIA Authoring Practices, Disclosure Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- WCAG 2.2 Understanding SC 2.5.8, Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG 2.2 Understanding SC 2.4.7, Focus Visible: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
