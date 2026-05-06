# Gate Lens-GDN-Icon-2 Implementation Plan v1

Date: 2026-05-06
Repo: `admate-capture-pro`
Product: AdMate Lens
Status: planning only

## Guardrails

- Do not change capture engine behavior until an operator-approved GDN golden sample exists.
- Do not change DB schema or API contracts.
- Do not add real golden PNGs in this gate.
- Do not apply AdMate/Openclaw styling to generated placement output.
- Implementation must be limited to the GDN disclosure/icon overlay path when approved.

## Goal

Bring the Google/GDN disclosure icon cluster closer to native/banner placements while keeping the change small, reference-based, and measurable. The target is not a general redesign of GDN capture; it is a preset-driven icon overlay adjustment for placements where Lens injects synthetic display/native creative.

## Current Starting Point

Current GDN capture calls `ensureAdDisclosureBadge()` in `src/lib/capture/channels/gdn-capture.ts` before screenshot capture.

The existing badge behavior:

- Adds or normalizes `[data-injected="admate-badge"]`.
- Uses two 15x15 cells:
  - info icon
  - vertical more icon
- Uses a 2px cluster gap.
- Anchors at `top: 1px`, `right: 4px`.
- Uses a white background row or optional pill treatment.
- Repositions relative to the visible creative when `object-fit: contain`.

Known issue: this is stable but may not match the documented Google display AdChoices collapsed size or actual publisher/native controls across placements.

## Reference Requirements

Before implementation, collect at least one approved reference for each preset class:

- PC display/banner: native Google/GDN badge visible.
- Mobile display/banner: native Google/GDN badge visible.
- Native banner/feed: native/ad attribution + AdChoices overlay visible.

Minimum reference metadata:

- surface
- viewport mode
- creative slot size
- captured PNG dimensions
- icon bounding box
- top/right offset from ad boundary
- background/pill treatment
- whether icon is single collapsed badge or multi-control cluster

## Preset Candidates

### 1. `gdn-display-collapsed-adchoices`

Use when the placement should mimic a standard display/banner collapsed AdChoices badge.

Candidate defaults:

- icon model: single collapsed badge
- target box: 19x15 px
- top offset: 0-1 px, reference-defined
- right offset: 0-2 px, reference-defined
- background: transparent or baked into badge asset
- pill: false
- gap: not applicable

Risk: high. This changes output pixels and may reduce similarity for publisher pages that show a two-control iframe cluster.

### 2. `gdn-display-control-cluster`

Use when the placement reference shows an iframe-like info + more control cluster.

Candidate defaults:

- icon model: two cells
- info cell: 15x15 px
- more cell: 15x15 px
- gap: 0-2 px
- top offset: 1 px
- right offset: 2-4 px
- background: white row
- pill: false by default

Risk: medium-high. This is closest to the current implementation and should be the first candidate for low-regression adjustment.

### 3. `gdn-mobile-display-badge`

Use for mobile GDN display/banner slots.

Candidate defaults:

- icon model: collapsed badge or compact cluster, decided by reference
- top offset: 0-2 px
- right offset: 0-3 px
- background: white or semi-opaque only if reference needs contrast
- pill: false unless reference shows pill
- touch target is not relevant for static screenshots, but visual footprint must match

Risk: high. Mobile DPR/output scale makes small offsets more visible.

### 4. `gdn-native-banner-adchoices`

Use for native/feed/banner surfaces where the ad is rendered as content, not a pure iframe banner.

Candidate defaults:

- icon model: compact overlay in preferred corner
- attribution remains separate from AdChoices if the native placement requires it
- top/right offset: reference-defined
- background: placement-defined
- pill: only when reference shows native overlay pill

Risk: high. Native surfaces vary by publisher and may require host strategy input.

### 5. `gdn-expanded-adchoices-label`

Use only for explicit expanded-state evidence, not default placement capture.

Candidate defaults:

- target box: 76x15 px
- top/right corner
- triggered only by metadata or explicit capture option

Risk: very high. Expanded state should not be shown by default.

## Preset Selection Plan

Add a small internal preset resolver only after approval.

Inputs:

- `gdnViewportMode`
- slot dimensions
- `creativeObjectFit`
- host strategy hint when available
- explicit future metadata option, for example `gdnDisclosurePreset`

Initial resolver order:

1. Explicit metadata option if present.
2. Host strategy hint if present.
3. Mobile viewport defaults to `gdn-mobile-display-badge`.
4. PC rectangular/banner display defaults to `gdn-display-control-cluster`.
5. Native-like detected placement defaults to `gdn-native-banner-adchoices`.

Do not infer from advertiser creative content.

## Icon Geometry Fields

Each preset should define:

- `mode`
- `width`
- `height`
- `top`
- `right`
- `gap`
- `background`
- `borderRadius`
- `boxShadow`
- `cellWidth`
- `cellHeight`
- `color`
- `zIndex`
- `syncToContainedCreative`

Example shape:

```ts
type GdnDisclosurePreset = {
  id: string;
  mode: "single-badge" | "control-cluster" | "native-overlay" | "expanded-label";
  width: number;
  height: number;
  top: number;
  right: number;
  gap: number;
  background: "transparent" | "white" | "reference";
  pill: boolean;
  syncToContainedCreative: boolean;
};
```

This type is an implementation sketch, not part of this gate.

## Proposed Minimal File Scope

Future implementation should prefer a small extraction from `gdn-capture.ts`.

Candidate files:

| File | Change | Risk |
| --- | --- | --- |
| `src/lib/capture/channels/gdn-capture.ts` | Use preset resolver inside `ensureAdDisclosureBadge()` or call extracted helper | High |
| `src/lib/capture/channels/gdn-disclosure-presets.ts` | New preset definitions and resolver | Medium |
| `src/lib/capture/channels/gdn/host-strategies.ts` | Optional host-level preset hint only if needed | Medium |
| `scripts/check-golden-pixels.mjs` | Optional region-focused report after golden samples | Low |
| `tests/golden/manifests/gdn-pc-display.json` | Add ROI/threshold for icon region after sample approval | Low |

Avoid changing:

- `src/lib/capture/engine/*`
- `src/lib/capture/injection/*` unless the preset must follow slot detection metadata
- API routes
- DB schema/types

## PC Display vs Mobile Display vs Native Banner

### PC Display

- Most likely to use top-right AdChoices/control cluster.
- Large creative sizes make a 1-4 px offset visible but not dominant.
- First implementation target because current GDN PC Display golden manifest already exists as placeholder.

### Mobile Display

- Same visual unit may be scaled by DPR and screenshot viewport.
- Smaller banners make a two-cell cluster more intrusive.
- Requires separate golden sample before changing defaults.

### Native Banner

- AdChoices overlay and ad attribution are distinct concepts.
- Native layout may already include an `AD`, `Sponsored`, or publisher-styled label.
- Do not reuse PC display cluster without native reference.

## Verification Plan

Manual reference comparison:

1. Capture native reference with Google/GDN badge visible.
2. Record bounding box:
   - badge width/height
   - top/right offset
   - visible background
   - cluster gap
3. Capture Lens candidate using the same surface class.
4. Compare full screenshot and cropped icon area.

Automated checks after golden approval:

- `npm run verify:golden`
- Region-specific pixel diff for icon area, if implemented.
- Full-image diff threshold remains surface-specific.
- Dimension mismatch fails immediately.

Suggested future report fields:

- `surface`
- `disclosurePreset`
- `badgeBox`
- `referenceBox`
- `offsetDelta`
- `changedPixelRatio`
- `iconRegionChangedPixelRatio`

## Implementation Steps After Approval

1. Approve at least one repo-safe or external-sensitive GDN PC Display golden sample.
2. Add icon ROI metadata to the GDN golden manifest.
3. Extract preset constants without changing behavior.
4. Wire `gdn-display-control-cluster` as behavior-equivalent default.
5. Add one preset adjustment behind explicit metadata or host strategy hint.
6. Generate candidate output.
7. Compare full screenshot and icon crop.
8. Promote preset only after operator sign-off.

## Rollback Plan

- Revert preset resolver usage to the current hardcoded `ensureAdDisclosureBadge()` style.
- Remove explicit preset metadata if added.
- Keep golden manifests and audit docs, because they document the comparison basis.

## Open Decisions

- First reference should be PC display or mobile display?
- Should default PC behavior keep two-cell cluster or normalize to 19x15 collapsed badge?
- Should expanded 76x15 label ever be used in report evidence, or only in a separate interactive/hover capture mode?
- Should icon ROI live in golden manifest or a separate visual QA manifest?

## Gate Result

Lens-GDN-Icon-2 status: implementation plan complete, code not started.

Required next input:

- Approved GDN placement PNG with visible native Google/GDN badge.
- Connected metadata JSON.
- Decision on first preset target.
