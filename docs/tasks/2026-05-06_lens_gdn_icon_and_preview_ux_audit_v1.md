# Gate Lens-UX-1 Google/GDN Icon Fidelity + Capture Preview UX Audit v1

Date: 2026-05-06
Repo: `admate-capture-pro`
Product: AdMate Lens
Scope: audit and design only

## Guardrails

- No capture engine, rendering, synthesis, injection, DB schema, or API contract changes in this gate.
- No golden PNGs added.
- No generated capture output is themed with AdMate/Openclaw styling.
- Any future icon change must be validated against real Google/GDN references or an operator-approved golden sample.

## Source Basis

Official Google references used for this audit:

- Google Ad Manager Help, AdChoices for Google Ad Manager: display/text ad badge is 19x15 px collapsed and 76x15 px expanded; display ads use the top-right corner.
  - https://support.google.com/admanager/answer/2695279
- Google Ads policy, third-party ad serving requirements: GDN Advertising Option Icon appears at the top-right corner; third-party overlays must not cover or conflict with it.
  - https://support.google.com/adspolicy/answer/94230
- Google AdMob native ad docs: native ads need an AdChoices overlay and ad attribution; apps should reserve space in a preferred corner for the automatically inserted overlay.
  - https://developers.google.com/admob/android/native/advanced
- Google PAL SDK AdChoices docs: video/personalized ads should support the provided AdChoices icon and fallback overlay where applicable.
  - https://developers.google.com/ad-manager/pal/html5/wta

Repo code references reviewed:

- `src/lib/capture/channels/gdn-capture.ts`
- `src/app/components/CaptureList.tsx`
- `src/app/globals.css`

## Part A. Google/GDN Icon Fidelity Audit

### Current Lens Behavior

`gdn-capture.ts` currently calls `ensureAdDisclosureBadge()` before screenshot capture. The badge is injected or normalized on elements marked with:

- `[data-injected="admate"]`
- `[data-injected="admate-wrapper"]`
- `[data-injected="admate-badge"]`

Observed implementation shape:

- Outer badge:
  - absolute positioned
  - `top: 1px`
  - `right: 4px`
  - `height: 15px`
  - high z-index
  - pointer events disabled
- Row:
  - white background
  - inline-flex
  - `gap: 2px`
  - height 15px
- Icon cells:
  - 15x15 px each
  - first cell: turquoise circular information icon
  - second cell: turquoise vertical three-dot menu
- Optional pill branch:
  - `padding: 2px 4px`
  - white background
  - 2px radius
  - subtle outline shadow
- For `object-fit: contain`, badge position is recalculated against the visible creative box, not only the wrapper.

### Native/Fidelity Gaps

1. Collapsed size mismatch risk
   - Google documentation states display/text collapsed AdChoices is 19x15 px.
   - Current Lens cluster is effectively two 15x15 cells plus a 2px gap, about 32x15 px.
   - This may look closer to a Google-rendered iframe control cluster on some publisher pages, but it is not the documented collapsed AdChoices unit.

2. Graphic mismatch risk
   - Current icon is a turquoise circular `i` plus vertical kebab menu.
   - Google/GDN surfaces can show AdChoices / Ads by Google badging, and the exact visual may differ by product, region, publisher, serving stack, and iframe/native implementation.
   - The current synthetic icon may overfit one observed web control style and underfit native/banner variants.

3. Offset and corner anchoring risk
   - Current top offset is 1px and right offset is 4px.
   - Official policy language requires top-right placement, but does not mandate the 4px inset used here.
   - Some real placements are flush or near-flush to the ad frame edge; others sit inside iframe padding. A single offset is unlikely to match all placements.

4. Background/pill risk
   - Current white background and optional pill outline can be useful over busy creatives.
   - However, Google badging can appear as a compact image/label and may not always have a rounded pill with shadow.
   - Pill styling should be preset-based, not globally applied.

5. Cluster spacing risk
   - Current `gap: 2px` between info and menu cells is stable but not necessarily native.
   - Real Google controls may use a single image, a hover-expanded label, or a compact iframe-rendered cluster.

6. Overlay layering risk
   - Current `z-index: 2147483646` guarantees visibility for evidence screenshots.
   - It may be visually unlike the original page stack if publisher CSS or iframe boundaries are expected to clip the badge.

7. Placement variability risk
   - Desktop display, mobile display, responsive display, native in-feed, text-like ads, and video ads do not share one icon contract.
   - A single `ensureAdDisclosureBadge()` style cannot satisfy all native/banner placements with high fidelity.

### Placement-Level Icon Preset Need

Recommended future direction: introduce placement-specific icon presets after golden samples are approved.

Candidate preset dimensions:

| Preset | Intended surface | Badge model | Default position | Risk |
| --- | --- | --- | --- | --- |
| `gdn-display-collapsed-adchoices` | Standard display/banner | 19x15 collapsed image-equivalent | top-right, near-flush | High, output pixels |
| `gdn-display-control-cluster` | iframe-like display controls | info + menu cluster | top-right with small inset | High, output pixels |
| `gdn-native-adchoices-overlay` | Native display/feed | compact overlay, preferred corner | top-right unless reference says otherwise | High, output pixels |
| `gdn-expanded-adchoices-label` | Hover/expanded evidence only | 76x15 equivalent | top-right | High, output pixels |
| `gdn-video-adchoices` | Video/PAL/IMA style | 18x18 or 30x30 depending player | bottom-right for video | Very high, separate reference needed |

Preset selection should be driven by metadata/options, not guessed from creative aspect ratio alone.

### Future Candidate Files

Do not edit these until golden samples or real references are available.

| File | Future reason | Risk |
| --- | --- | --- |
| `src/lib/capture/channels/gdn-capture.ts` | Current disclosure badge injection and positioning lives here | High |
| `src/lib/capture/injection/creative-injector.ts` | If badge needs to be coupled to slot injection lifecycle | High |
| `src/lib/capture/injection/ad-slot-detector.ts` | If preset selection depends on slot type or publisher context | Medium |
| `src/lib/capture/channels/gdn/host-strategies.ts` | If publisher-specific icon offset/preset is needed | Medium |
| `scripts/check-golden-pixels.mjs` | Future golden diff can lock icon region regressions | Low |
| `tests/golden/manifests/gdn-pc-display.json` | Future threshold/region-of-interest fields | Low |

### Suggested QA Before Implementation

- Collect at least one operator-approved GDN PC Display golden PNG with the native Google badge visible.
- Add a cropped icon region reference in the audit notes, but do not commit sensitive production imagery.
- Compare:
  - badge bounding box size
  - top/right offset
  - background/pill treatment
  - whether it is a single 19x15 unit, expanded 76x15 label, or two-control cluster
  - z-index/clip behavior at ad boundary

## Part B. Capture Result Preview UX Audit

### Current Preview Modal

`CaptureList.tsx` currently renders `CaptureDetailModal` as:

- centered modal
- `max-w-2xl`
- `max-h-[85vh]`
- vertical scroll
- placement screenshot shown above metadata
- landing screenshot shown below placement if present
- action buttons:
  - open placement in new tab
  - download placement
- metadata rendered as compact text rows below images
- delete button conditionally shown when delete env flag is enabled

### Current Pain Points

1. Large evidence images are constrained
   - `max-w-2xl` is too narrow for 1920px desktop captures.
   - YouTube/GDN evidence often needs inspection at native or near-native size.

2. Metadata is far from the image
   - Operators must scroll between screenshot and metadata.
   - Quality flags, runtime, surface, dimensions, and storage path are not side-by-side with the preview.

3. No zoom/original controls
   - Current options are browser new tab or download.
   - There is no in-app 50/100/fit/original-size toggle.

4. No fullscreen mode
   - Operators cannot inspect a placement without modal chrome and page background.

5. No thumbnail strip
   - Placement and landing are separate vertical sections.
   - If future outputs include crops/diffs/golden/candidate, the modal will not scale.

6. Limited copy/download actions
   - No copy image URL, copy final landing URL, copy capture ID, copy storage path, or download all.

7. Mobile modal is serviceable but not optimized
   - The centered modal works, but inspector metadata competes with image space.
   - A bottom sheet metadata drawer would be easier than long scrolling.

### Proposed Desktop Layout

Large preview with right inspector:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: status, channel, surface, actions                    │
├───────────────────────────────────────────┬──────────────────┤
│ Preview viewport                          │ Inspector        │
│ - fit / 100% / 200% / original            │ - quality state  │
│ - pan when zoomed                         │ - metadata       │
│ - fullscreen toggle                       │ - dimensions     │
│                                           │ - runtime        │
├───────────────────────────────────────────┴──────────────────┤
│ Thumbnail strip: placement / landing / future diff / golden  │
└──────────────────────────────────────────────────────────────┘
```

Recommended desktop sizing:

- Modal width: `min(96vw, 1440px)`
- Modal height: `min(92vh, 960px)`
- Preview column: flexible, 65-75%
- Inspector: 320-380px
- Thumbnail strip: 72-96px height

### Proposed Mobile Layout

```text
┌────────────────────────┐
│ Header + primary menu  │
├────────────────────────┤
│ Image preview          │
│ fit/original toggle    │
├────────────────────────┤
│ Thumbnail strip        │
├────────────────────────┤
│ Metadata drawer button │
└────────────────────────┘
```

Recommended mobile behavior:

- Fullscreen route-like modal, not small centered card.
- Inspector becomes bottom drawer.
- Thumbnail strip stays above bottom actions.
- Original-size mode should allow pinch/pan or scroll-panned image.

### Preview Actions

Primary:

- Download placement PNG
- Open original in new tab
- Copy image URL
- Fullscreen preview

Secondary:

- Download landing PNG
- Copy landing final URL
- Copy capture ID
- Copy metadata summary
- Copy storage path when available

Future golden QA actions:

- Mark as golden candidate
- Compare with golden
- Open diff report
- Copy surface manifest key

### Future Candidate Files

| File | Future reason | Risk |
| --- | --- | --- |
| `src/app/components/CaptureList.tsx` | Detail modal layout and actions live here | Low to medium, operator UI only |
| `src/app/globals.css` | Modal, preview, inspector, thumbnail strip styles | Low to medium, avoid capture output selectors |
| `src/app/page.tsx` | If result review route/section needs entry points | Low |
| `docs/quality/golden-sample-policy.md` | Future golden candidate workflow policy | Low |

### UX Implementation Risk

- Operator preview UI can be changed without altering generated PNGs.
- The biggest risk is accidentally changing the displayed image CSS in a way that operators mistake for the original capture dimensions.
- Preview must clearly distinguish:
  - fitted display size
  - original image pixel size
  - downloaded/original PNG
- Do not crop, recolor, compress, or transform the actual `placement_image_url`.

## Recommended Sequence

1. Wait for approved golden placement PNG and metadata samples.
2. Add golden manifest dimensions and metadata for GDN PC Display first.
3. Audit icon region with a crop-based manual comparison.
4. Only then design a GDN icon preset patch.
5. Separately implement operator preview UX, since it does not change generated capture output.
6. Add visual QA checklist for preview mode to ensure image display transforms are transparent to operators.

## Open Questions

- Which real GDN placement should be the first approved icon reference: desktop banner, mobile banner, or native feed?
- Should Lens preserve a two-control cluster when the publisher iframe normally shows both info and menu controls, or normalize to the documented 19x15 collapsed AdChoices unit?
- Should preview fullscreen be a modal state or a route like `/captures/{id}`?
- Should golden candidate approval be available in Lens UI or handled offline from reports?

## Gate Result

Lens-UX-1 status: audit complete, implementation not started.

Next required input:

- Operator-approved GDN placement PNG with native Google badge visible.
- Connected metadata JSON.
- Decision on repo-safe vs external-sensitive storage.
