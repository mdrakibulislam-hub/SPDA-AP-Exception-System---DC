# SPDA design migration

Software: replace the old AP workspace presentation with the supplied Figma design while preserving the existing domain engine.

Status: all seven implementation stages completed on 27 November 2026. See the [verification report and screenshots](design-verification.md) for the automated checks, browser journeys and responsive results.

## Reference and scope

- Figma file: `wOA77BTqTYFuxUBTr292qq`.
- Prototype page `1:4`: dashboard, AP queue, selection, assignment, evidence requests, case details, assistant.
- Core flow page `1:3`: Budget Owner, Department Head, Finance Controller decisions, supplier invoice portal and evidence upload.
- Primary visual baseline: 1440 × 1024; responsive layouts retain content and actions at narrower sizes.
- Exact reference exports live in `docs/figma/*.reference.txt`; local static assets live in `apps/web/public/design` and the Inter font in `apps/web/public/fonts`.

## Implementation stages

1. **Inventory and reference extraction.** Map routes, workflow contracts, typography, dimensions, color tokens, assets, and representative states.
2. **Shared foundation.** Replace old workspace CSS, add the actual Inter font, build the 280px role-aware sidebar, 56px breadcrumb/search header, white 16px-radius workspace, profile/role menu, Preference and Logout controls.
3. **Dashboard.** Match the time filter, four metrics, line/area chart, queue signals, business targets and exact mascot artwork. Drive statistics and filtering from live workspace state.
4. **Queue and dialogs.** Match the tab row, 117px supplier cards, initials/selection states, metadata, conditional period note, issue pill, amounts, split actions, owner search, decision reasons, evidence requests, bulk previews, processing and success feedback.
5. **Case and supplier screens.** Match invoice header, metadata grid, approval workflow, role-specific actions, notes and actual audit timeline. Implement the supplier portal and standalone request upload states using existing evidence contracts.
6. **Assistant.** Match empty and populated drawer states, local mascot assets, prompt chips, conversation summaries, composer, action preview and reviewed commits.
7. **Integration and finish.** Remove old styling/photography from product flows, run build/type/domain checks, exercise the complete role and evidence journeys, inspect desktop and mobile rendering, compare representative screenshots to Figma, and document unresolved limits.

## Ownership

- Root: shell, tokens, font/assets, dashboard, search routing, preferences, integration and visual verification.
- Queue worker: queue, selection, action dialogs and their dedicated CSS.
- Detail worker: case details, supplier upload and their dedicated CSS.
- Assistant worker: assistant drawer and its dedicated CSS.

## Preserved contracts

Keep `model.ts`, `month-end.ts`, `assistant-model.ts`, `WorkspaceProvider.commit`, `useWorkspace`, route IDs, localStorage records, stale-state checks, owner availability/scope rules, approval bands, bank verification and role visibility. User-facing role labels may be aligned with Figma without changing role keys.

Use real state for counts, periods, reviewer availability and approval progress. Do not fabricate Figma's illustrative totals, override permission rules, discard existing saved cases, or represent a local rule as a remote AI service.

## Validation matrix

- AP: dashboard → queue/search → select → assign → request evidence → detail/timeline.
- Budget Owner → Department Head → Finance Controller: available reviewer, required decision reason, approval progression, rejection, evidence request.
- Supplier: scoped invoice list/detail → evidence link → choose/upload/submit → reviewer sees proof.
- Additional domain safeguards: absent owner/coverage, bank phone verification and finance confirmation, accounting-period rollover, stale bulk/assistant review, persisted state across reload.
- UI: keyboard navigation, focus restoration/Escape, accessible form errors, functional notification/profile/preference controls, scroll containment, long supplier names and amounts, 1440/1024/768/390 widths.

## Existing implementation limits

The AP workspace persists cases and proof files in browser storage. The API currently provides authentication only; production invoice APIs, cross-device evidence persistence, remote AI, external notifications and payment execution are outside the existing app. This migration preserves that scope and does not silently claim those services were added.
