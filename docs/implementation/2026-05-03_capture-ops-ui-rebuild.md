# Capture Operations UI Rebuild

Date: 2026-05-03

## Scope

Rebuild the capture operation surfaces around the Openclaw/Sentinel console guidelines.

This change focuses on UI/UX, operator guardrails, and documentation. It does not intentionally change DB schema, auth/permission logic, billing, external API contracts, or capture rendering contracts.

## Backup

Before editing, the working tree and main capture UI files were backed up locally.

Backup path:

```text
C:\tmp\admate-capture-pro-backup-20260503_002031
```

Contents:

- `working-tree-before-ui-rebuild.patch`
- `CaptureForm.before.tsx`
- `CaptureList.before.tsx`
- `page.before.tsx`

## Changes

- Reframed the main screen as a calm operational console instead of a marketing-style studio page.
- Added a top-level KPI strip for capture coverage, newly public surfaces, legacy exclusions, and delete policy.
- Replaced the bottom sample-screen section with a capture surface coverage matrix.
- Expanded the product coverage panel to include:
  - YouTube In-stream / Bumper
  - YouTube Feed Surfaces
  - Demand Gen
  - GDN Display
- Added Demand Gen and legacy exclusion status styling.
- Tightened Openclaw visual treatment:
  - flatter background
  - smaller title scale
  - 8px panels
  - lower animation duration
  - table-like coverage rows
- Hid destructive capture delete controls from the operator UI unless explicitly enabled by environment variable.

## Delete Guardrail

The existing DELETE API contract was not changed in this UI pass.

The operator UI now hides delete actions by default. To temporarily expose them in a non-production environment, set:

```text
NEXT_PUBLIC_ENABLE_CAPTURE_DELETE=true
```

Default behavior:

- individual delete hidden
- delete all hidden
- detail modal delete hidden
- "삭제 비활성" badge displayed in the result queue

## Verification

Executed:

```text
npm run build
```

Result:

- Passed.
- Remaining warning: edge runtime disables static generation for that route. This is pre-existing runtime behavior and not caused by the UI rebuild.

Executed:

```text
npm run lint
```

Result:

- Passed.
- The lint script now uses `tsc --noEmit` because `next lint` is not supported by the current Next.js CLI behavior in this project.

Executed:

```text
git diff --check
```

Result:

- Passed.
- Git reported Windows CRLF conversion warnings only.

## Visual QA

Local dev server responded on:

```text
http://localhost:3002
```

Notes:

- HTTP HEAD returned 200 OK.
- Headless Chrome/Edge screenshot capture could not launch a browser process in this Windows desktop environment.
- Because the build and type checks passed, the next visual pass should be done in the running browser tab or Vercel preview before production merge.

## Rollback

Rollback options:

1. Apply the backup patch from `C:\tmp\admate-capture-pro-backup-20260503_002031`.
2. Restore individual backed-up UI files from that folder.
3. Use git to revert the UI rebuild commit after it is committed.
