# Gate Lens-Visual-QA-1 Production Visual QA Plan v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: production visual QA planning only

## 1. Goal

Define a production-safe visual QA plan for:

- Lens-GDN-Icon-3
- Lens-Preview-UX-3

This gate does not run captures, generate images, modify code, add golden PNGs, or change capture engine behavior.

## 2. Guardrails

- Do not execute capture jobs in this gate.
- Do not generate new output images in this gate.
- Do not modify capture engine, rendering, composite, injection, API, DB, env, storage, or output file behavior.
- Do not add or update golden PNGs in this gate.
- Do not annotate, crop, recolor, watermark, or otherwise mutate the original output image during QA.
- Use only operator-approved production-safe records or approved safe fixtures.

## 3. QA Targets

### 3.1 GDN Disclosure Icon QA

Target checks:

- GDN disclosure icon size
- GDN disclosure icon top/right position
- Gap and spacing between icon elements where a two-control cluster is shown
- PC display preset
- mobile display preset
- native banner preset

Reference basis:

- existing production capture record with approved safe visibility
- approved representative GDN placement PNG
- approved metadata sample linked to the same surface

### 3.2 Preview Workspace QA

Target checks:

- desktop preview workspace layout
- mobile preview workspace layout
- image `object-contain` display
- right inspector metadata visibility
- selected output switching behavior
- download action
- copy URL action
- copy storage path action when available
- open original action
- disabled state when storage path is unavailable

## 4. Required Fixture Set

The QA run should not start until the following are available.

### 4.1 Required Safe Fixtures

1. Approved representative GDN placement PNG
2. Safe capture record
3. Metadata sample

### 4.2 Fixture Requirements

Approved representative GDN placement PNG:

- Must show the final stored capture image that operators already consider safe to inspect.
- Must clearly include the disclosure icon area.
- Must map to one of:
  - PC display
  - mobile display
  - native banner

Safe capture record:

- Must be safe for operator review in a local or staging-like UI context.
- Must include the same output URL shape and metadata shape used by the current CaptureList review flow.
- Must avoid sensitive advertiser or campaign details unless already approved for QA handling.

Metadata sample:

- Must include enough fields to populate the current preview inspector.
- Should include:
  - `status`
  - `productFamily`
  - `productSurface`
  - `resultCategory`
  - `diagnostics`
  - `runtime`
  - `gdnViewportMode` when relevant
  - `screenshot_storage_path` when available in the record

## 5. Test Matrix

### 5.1 GDN Disclosure Icon Matrix

| Surface | Required record count | Required comparison |
| --- | --- | --- |
| PC display | 1 or more | icon size, top-right position, gap, background treatment |
| mobile display | 1 or more | icon size, top-right position, mobile spacing |
| native banner | 1 or more | icon size, corner placement, native overlay feel |

### 5.2 Preview Workspace Matrix

| Viewport | Required cases | Required checks |
| --- | --- | --- |
| desktop | placement-only, placement+landing, missing storage path | layout, tabs/actions, inspector, no crop |
| mobile | placement-only, placement+landing, missing storage path | image-first layout, accordion, bottom actions, no crop |

## 6. Verification Method

### 6.1 Before/After Visual Comparison

Use a comparison set based on:

- pre-Lens-GDN-Icon-3 reference if available
- pre-Lens-Preview-UX-3 reference if available
- current production-safe output or approved fixture

Comparison method:

1. Identify the exact surface preset.
2. Compare the current output against the approved reference basis.
3. Capture evidence screenshots of the review UI and, separately, the raw output image when needed.
4. Record whether differences are expected viewer-only differences or output-level differences.

### 6.2 Desktop Viewport QA

Recommended desktop viewport:

- width around `1440px`
- secondary spot check around `1280px`

Check:

- preview image remains fully contained
- no crop in fit mode
- no overlay drawn inside the output image
- right inspector remains visible without overlapping the image
- actions are reachable without long scrolling
- placement/landing selection is understandable

### 6.3 Mobile Viewport QA

Recommended mobile viewport:

- width around `390px`
- optional secondary spot check around `430px`

Check:

- image appears before long metadata blocks
- metadata accordion does not push the preview out of the first screen more than necessary
- bottom actions do not cover the image
- output remains fully contained
- no crop in fit mode
- disabled states remain legible and tappable

### 6.4 No Mutation Confirmation

For every checked record, confirm:

- no crop
- no overlay added into the output bitmap
- no recolor
- no filter
- no output mutation between displayed preview and original download/open-original target

Expected behavior:

- viewer zoom may change CSS display size only
- `open original` must use the original stored output URL
- `download` must use the original stored output URL

### 6.5 Missing Storage Path Disabled State

At least one QA sample should cover a record with no storage path exposed to the UI.

Confirm:

- copy storage path control is disabled or unavailable in a clear way
- no misleading success state appears
- the rest of the inspector remains usable

## 7. Pass/Fail Criteria

### 7.1 GDN Disclosure Icon Pass Criteria

Pass when:

- the icon appears in the expected top-right area for the approved preset
- icon size and spacing are consistent with the approved reference basis
- the icon does not visibly drift away from the creative edge in contain-style layouts
- the icon does not cover core ad content in a way the approved reference does not

Fail when:

- icon size is visibly too large or too small versus the approved reference
- icon position is not plausibly top-right for the preset
- gap/cluster spacing looks broken or inconsistent
- contain-layout alignment causes obvious corner drift
- icon treatment suggests a new output mutation not justified by the approved reference

### 7.2 Preview Workspace Pass Criteria

Pass when:

- desktop preview shows a large readable image and separate right inspector
- mobile preview is image-first and does not hide the image behind metadata/actions
- `object-contain` behavior preserves the full image in fit mode
- `download`, `copy URL`, and `open original` work for an available output
- missing storage path shows a clear disabled or unavailable state
- the preview UI does not visually imply that the output bitmap itself was changed

Fail when:

- the image is cropped in fit mode
- metadata overlaps the image
- actions are wired to the wrong output or unavailable without reason
- disabled state is misleading
- the viewer introduces an overlay or styling that can be mistaken for part of the capture output

## 8. Evidence Capture Plan

### 8.1 Screenshot Evidence Types

Collect evidence as separate artifacts:

1. Output image reference screenshot
2. Desktop preview workspace screenshot
3. Mobile preview workspace screenshot
4. Inspector screenshot showing metadata state
5. Disabled-state screenshot for missing storage path

### 8.2 Candidate Evidence Storage Locations

Because golden PNGs are blocked in this gate, evidence should be stored outside the committed golden sample path.

Candidate locations:

- local operator-only QA folder outside the repo
- restricted team review folder in approved shared storage
- non-committed local `tmp` or QA workspace path
- ticket attachment or internal review document with access control

Recommended repo policy for this gate:

- do not commit evidence screenshots
- do not place them under `tests/golden`
- do not place them in public repo asset directories

## 9. Relationship To Golden PNG Policy

Golden PNG policy in this gate:

- no new golden PNGs
- no golden manifest changes
- no committed reference image additions

This plan only prepares the validation procedure.

If the team later decides to promote a safe approved record into a golden workflow, that should happen in a separate gate after explicit approval.

## 10. Suggested QA Run Order

1. Confirm approved safe fixture availability.
2. Review one PC display sample for GDN icon behavior.
3. Review one mobile display sample for GDN icon behavior.
4. Review one native banner sample for GDN icon behavior.
5. Open the same safe record in the desktop preview workspace.
6. Verify image containment, inspector, actions, and no-mutation rules.
7. Open the same or equivalent safe record in the mobile preview workspace.
8. Verify mobile image-first layout and disabled states.
9. Save operator-only screenshot evidence outside the committed repo paths.
10. Write a short pass/fail summary with remaining risks.

## 11. Reporting Template

Use the following structure after the QA run:

### 11.1 Fixture Summary

- fixture source
- surface type
- whether it is production record or approved safe fixture

### 11.2 GDN Icon Result

- preset under review
- pass/fail
- notes on size
- notes on position
- notes on gap/cluster treatment

### 11.3 Preview Workspace Result

- desktop pass/fail
- mobile pass/fail
- `object-contain` pass/fail
- inspector pass/fail
- actions pass/fail
- missing storage path disabled-state pass/fail

### 11.4 Boundary Confirmation

- no crop confirmed
- no overlay confirmed
- no output mutation confirmed

### 11.5 Remaining Risks

- unresolved icon fidelity questions
- fixture quality limitations
- missing metadata/path edge cases

## 12. Next Gate Recommendation

Recommended next gate:

```text
Gate Lens-Visual-QA-2 safe fixture review run
```

Scope:

- execute the plan using approved safe capture records or operator-approved safe fixtures
- collect screenshot evidence outside committed repo asset paths
- produce a pass/fail report
- keep golden PNG additions blocked unless separately approved

If visual QA finds a real fidelity issue, follow with a separate gated task:

```text
Gate Lens-GDN-Icon-4 targeted fidelity patch
```

or

```text
Gate Lens-Preview-UX-4 targeted review-surface adjustment
```

Only after explicit approval and with a documented reference basis.
