# Gate Lens-Visual-QA-2 Authenticated Visual QA Execution Plan v1

Date: 2026-05-09
Repo: `admate-lens`
Product: AdMate Lens
Scope: visual QA execution planning only

## 1. Goal

Plan how to execute visual QA using the authenticated Lens capture result validated in Auth-11, without creating new product assets or new regression baselines.

This gate does not:

- execute a new capture
- upload a new creative
- create a new golden PNG
- modify code
- clean up DB or storage artifacts

## 2. Auth-11 Output As Visual QA Candidate

Auth-11 produced one authenticated safe capture result with sanitized references only.

Available sanitized references:

- capture id: sanitized
- storage path: sanitized
- authenticated preview/history success confirmation

Decision:

- the Auth-11 result is acceptable as the **primary visual QA candidate**
- it is preferable to review the existing Auth-11 output first before considering any additional capture execution

Reason:

- it already represents a successful authenticated flow
- it already used the approved safe fixture path
- re-running capture would add unnecessary new artifacts and side effects

## 3. Reuse Existing Result vs Re-Execute

### 3.1 Preferred Path

Preferred approach:

- reuse the existing Auth-11 result only
- perform preview/history visual review from that result
- record evidence around that already-created output

### 3.2 Re-Execution Policy

New capture execution should **not** be the default for visual QA.

Only consider re-execution if:

- the Auth-11 result is no longer accessible
- the stored result is clearly incomplete or corrupted
- the visual QA cannot inspect the necessary output state from the existing result
- a new execution is explicitly approved in a separate gate

Current recommendation:

- do **not** re-run capture for Visual-QA-2

## 4. Visual QA Surface Scope

Visual QA should cover both the generated authenticated result and the operator preview surface that displays it.

### 4.1 Preview Workspace Scope

Confirm:

- result-review list can open the Auth-11 capture
- preview modal/detail surface shows the expected output
- output switching behavior remains understandable
- metadata/inspector surface is coherent and readable

### 4.2 Output Surface Scope

Confirm:

- output image is visible in the authenticated preview flow
- no obvious crop, blank state, or broken-image state appears
- authenticated result is not replaced by unrelated stale output

## 5. PC / Mobile Preview Review Range

### 5.1 Desktop Preview Review

Desktop review should confirm:

- preview modal opens correctly
- image framing is legible at default zoom
- output tabs and related actions are visible
- metadata/inspector column does not overlap or collapse badly

### 5.2 Mobile Preview Review

Mobile review should confirm:

- preview modal or equivalent responsive detail flow remains usable
- key controls remain visible without overlap
- zoom/output-tab/inspector interactions remain understandable at smaller viewport sizes
- text remains readable without breaking the operator flow

This gate plans the review only; actual viewport execution belongs to the next gate.

## 6. GDN Disclosure Icon Review Scope

The authenticated result can support targeted GDN output review.

Confirm against the existing accepted implementation intent:

- disclosure icon is present when expected
- icon size appears reasonable relative to the creative
- icon placement is anchored to the intended creative corner
- gap/alignment does not look detached or floating
- no obvious overlap with the ad image edge or crop boundary

This review should be descriptive and comparative, not baseline-asset-driven.

## 7. Preview Workspace Zoom / Inspector / Output Tabs Scope

The visual QA run should explicitly check:

- default preview state
- zoom modes and whether the image remains legible
- output-tab switching behavior
- inspector metadata readability
- action visibility for open/copy/download controls

What matters:

- no broken control states
- no unreadable inspector content
- no layout overlap from zoom or tab switching

## 8. Evidence Storage Candidate

Visual QA evidence should be stored as QA evidence only, not as product assets.

Recommended evidence location candidates:

- local QA evidence folder outside product asset paths
- temporary operator-reviewed evidence bundle
- issue/PR attachment or controlled doc attachment if separately approved

Avoid:

- `public/`
- any product asset directory
- golden baseline directories
- any path that suggests runtime product ownership

## 9. QA Screenshot Handling Rule

Screenshots taken for visual QA should be treated as QA evidence only.

Required rule:

- a QA screenshot is not a product asset
- a QA screenshot is not a golden PNG
- a QA screenshot is not a permanent regression baseline by default

This distinction must stay explicit in the next gate.

## 10. Golden PNG / Asset Rule

Golden PNG creation remains prohibited in this gate.

Do not:

- add golden PNG
- update golden PNG
- reclassify authenticated QA screenshots as baseline assets
- place evidence screenshots into product asset directories

## 11. Image / Asset Retention Rule

Do not delete existing generated images or related assets casually during visual QA.

Policy:

- no image deletion in this gate
- no asset cleanup in this gate
- no storage cleanup in this gate

If cleanup is ever needed later, it should be handled by a separate approved cleanup gate.

## 12. Pass / Fail Criteria

### 12.1 Pass

Visual QA can be considered pass if:

- the Auth-11 result is accessible in authenticated preview/history
- desktop preview is usable
- mobile preview is usable
- GDN disclosure icon placement looks aligned with the tuned expectation
- zoom/output tabs/inspector behave coherently
- no obvious crop/blank/broken-image regression is observed

### 12.2 Fail

Visual QA should be fail if any of the following occurs:

- Auth-11 result cannot be opened in preview/history
- image is blank, broken, or visibly wrong
- GDN disclosure icon is missing or clearly misaligned
- preview controls or inspector are broken or overlapping badly
- output tabs or zoom modes hide the output or make it unusable

## 13. Recommended Execution Order

The next execution gate should follow this order:

1. open authenticated result-review using the existing Auth-11 capture
2. verify desktop preview and inspector
3. verify mobile viewport preview behavior
4. inspect GDN disclosure icon placement on the existing output
5. capture QA-only evidence screenshots
6. record pass/fail findings using sanitized identifiers only

## 14. Recommended Next Gate

Recommended next gate:

```text
Gate Lens-Visual-QA-3 authenticated visual QA execution
```

Recommended scope:

- use only the existing Auth-11 authenticated result
- run desktop/mobile preview checks
- inspect GDN disclosure icon placement
- save QA-only screenshots as evidence
- report pass/fail with sanitized capture references only
