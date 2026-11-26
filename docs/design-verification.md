# SPDA design migration verification

Verified on 27 November 2026 against the supplied Figma **Prototype** (`1:4`) and **Core flow** (`1:3`) pages in file `wOA77BTqTYFuxUBTr292qq`.

The old workspace presentation and supplier photography have been replaced. The implementation covers the shared navigation/header, dashboard, role-specific queues, selection and bulk actions, assignment/evidence/decision dialogs, invoice details and timeline, supplier upload, preferences, and the assistant drawer. The implementation stages and preserved contracts are in [design-migration.md](design-migration.md).

## Automated checks

| Check | Result |
| --- | --- |
| `bun run build` | Passed for web and server |
| `bun run check-types` | Passed all 6 configured package tasks |
| `bun test` | 25 passed, 0 failed; 192 assertions |
| `git diff --check` | Passed |
| Local assets | No empty files, missing literal asset references, invalid SVGs, or temporary Figma asset URLs in runtime code |

The tests cover owner scope/availability, all three approval bands, required reasons, stale decisions, rejection, documented coverage, supplier scoping, supported file validation, independent bank verification, bulk previews, assistant review/apply safeguards, and entity-specific month-end cutoffs.

## Browser workflows

Tests used an isolated QA origin and retained browser storage. Existing user-origin case data was not reset.

| Journey | Observed result |
| --- | --- |
| AP assigns CPE to an available Bangladesh backup | Assignment and note recorded; role-specific review enabled |
| Budget Owner requests supplier evidence | Request created; real upload link available |
| Supplier submits a TXT supporting document | File attached, receipt shown, basic text checks recorded, proof available to the reviewer |
| CPE approval | Budget Owner then Department Head approved; final outcome recorded; Finance correctly marked not required for this band |
| Supplier visibility | Internal notes, confidence and assignee/reviewer controls hidden |
| Vantage bank change | AP phone verification followed by separate Finance Controller confirmation |
| Assistant routing | Suggestions remained a review until Apply; three actual assignments recorded |
| Vantage approval | Budget Owner, Department Head and Finance Controller all approved before final outcome |
| Smith rejection | Required reason and selected “Ask for more evidence” follow-up recorded in the workflow and timeline |
| Evidence confirmation | Dialog closed into the Figma-style link toast; copy and dismiss worked; no external delivery was claimed |
| Header search | `q` updated in the queue URL; matching result opened the correct invoice; compact search fit at 320px |
| Bulk selection | Desktop first-card Y stayed at 137px before/after selection; preview opened; Escape restored trigger focus |
| Navigation | Collapse and expand worked; compact navigation opened/closed; closed sidebar excluded from keyboard focus |
| Preferences and notifications | Display name/reduced motion saved and survived reload; notifications reflected actual audit events |

Rejection follow-ups are suggestions recorded with the reason. Selecting “Blacklist the supplier” does not automatically blacklist anyone.

## Visual and responsive verification

Compared representative stable screenshots to Figma at **1440 × 1024**, including typography, exported artwork, shell geometry, tabs/cards, metadata, dialogs, and assistant states. Entry animations were allowed to finish before captures.

The desktop shell uses the 280px sidebar and 56px header. The queue's first card starts at `(297, 137)`, measures `1118 × 117px`, and uses 16px gaps. The assistant is 440px wide and aligned to the right edge. Exact exported artwork and a local variable Inter font are included.

Dashboard, queue, detail and assistant were inspected at **1440 × 1024**, **1024 × 768**, **768 × 1024**, **390 × 844**, and **320 × 700**. Final narrow layouts have no horizontal page/content overflow or broken images. Supplier upload also passed at 1440px and 320px. Status tabs scroll within their own row. On phones, long headings wrap, amounts/actions have room, the bulk toolbar occupies its own row, and content can scroll clear of the assistant launcher.

Representative captures:

- [Dashboard, 1440px](verification/dashboard-1440.png)
- [Queue, 1440px](verification/queue-1440.png)
- [Invoice detail, 1440px](verification/detail-1440.png)
- [Populated assistant, 1440px](verification/assistant-populated-1440.png)
- [Queue, 768px](verification/queue-768.png)
- [Invoice detail, 390px](verification/detail-390.png)
- [Populated assistant, 320px](verification/assistant-populated-320.png)
- [Supplier upload, 1440px](verification/upload-1440.png)
- [Supplier upload, 320px](verification/upload-320.png)
- [Selected bulk actions, 320px](verification/bulk-320.png)

## Scope and intentional differences

Counts, chart values, accounting periods, assignees and approval stages come from actual saved state. Figma's illustrative totals and repeated timeline entries are not fabricated. “Moved to” appears only when the accounting period differs from its original period. Seven sample invoices retain their different confidence scores.

The supplied desktop design is the visual baseline; smaller layouts adapt its components for use on tablets and phones. Visual comparison supports close alignment, rather than a claim of mathematically proven pixel identity across every state and platform.

The AP workspace remains the existing browser-persisted prototype. Uploads require the same browser profile and web origin. The assistant and document text checks run locally. The API provides authentication; shared invoice storage, remote AI, external messaging and payment execution were not part of this UI migration.
