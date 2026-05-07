# Gate Lens-Preview-UX-2 Implementation Plan v1

Date: 2026-05-07
Repo: `admate-capture-pro`
Product: AdMate Lens
Gate: Lens-Preview-UX-2
Scope: implementation plan only

## 1. Guardrails

- Code changes are not part of this gate.
- Do not modify capture engine, rendering, synthesis, composite, injection, DB schema, API contract, auth, env, or storage behavior.
- Do not add golden PNGs.
- Do not theme or alter generated capture output, ad preview pixels, platform synthetic UI, or pixel-matched media surfaces.
- The preview workspace may change only the operator UI around an existing output image URL.
- The output bitmap must remain downloadable/openable as the original file.

Reference docs:

- `D:\Projects\Design Director Agent\docs\product-ui-direction\lens-preview-ux-direction-v1.md`
- `docs/tasks/2026-05-06_lens_gdn_icon_and_preview_ux_audit_v1.md`
- `docs/design/openclaw-theme-reference.md`

## 2. Current CaptureDetailModal Structure

Current file:

- `src/app/components/CaptureList.tsx`

Current structure:

- `CaptureList` keeps `selectedCapture` state and opens `CaptureDetailModal` from the result list.
- `CaptureDetailModal` is embedded in the same file.
- Modal shell:
  - centered fixed modal
  - `max-w-2xl`
  - `max-h-[85vh]`
  - vertical `overflow-y-auto`
  - `glass-card-static p-6`
- Header:
  - status badge
  - channel/product label
  - created time
  - absolute close button
- Image sections:
  - placement image first
  - landing image below if available
  - image uses inline classes such as `w-full h-auto`, and YouTube placement uses `object-contain`
- Actions:
  - open placement in a new tab
  - download placement
  - landing final URL link if available
  - delete button if delete feature flag is enabled
- Metadata:
  - rendered as compact text rows below images
  - includes capture ID, source URL, creative URL, landing capture flag, duration, quality/result labels, runtime provider, metadata surface, event time, product type, and capture second where available

Current problems:

1. The image is too small for evidence review.
   - `max-w-2xl` compresses desktop YouTube/GDN captures and makes pixel/detail review difficult.
2. Metadata is below the image, not beside it.
   - Operators must scroll between the visual result and runtime/quality fields.
3. Placement and landing outputs are stacked.
   - There is no selected-output concept, placement tab, landing tab, or thumbnail strip.
4. There are no in-app zoom controls.
   - Operators must open a new tab or download to inspect at native scale.
5. Copy actions are missing.
   - Copy image URL, landing URL, storage path, capture ID, and metadata summary are not first-class review actions.
6. Storage path is not clearly surfaced.
   - `screenshot_storage_path` exists in the API/DB layer, but the current local `CaptureRecord` interface does not expose it to the modal.
7. Diagnostics are compressed into labels.
   - `resultCategory`, quality flags, and runtime provider are shown, but no inspector-style diagnostics summary exists.
8. Mobile behavior relies on long modal scroll.
   - Image and metadata compete in a narrow vertical modal.

## 3. Implementation Candidate Files

Primary implementation candidate:

| File | Purpose | Risk |
| --- | --- | --- |
| `src/app/components/CaptureList.tsx` | Rebuild `CaptureDetailModal` shell, preview workspace, selected output state, inspector rows, actions, mobile accordion, and helper functions | Low to medium, operator UI only |

Secondary candidate only if Tailwind classes become too dense:

| File | Purpose | Risk |
| --- | --- | --- |
| `src/app/globals.css` | Shared preview canvas, checker background, zoom cursor, modal grid, visually hidden labels, or responsive utility classes | Low, but avoid selectors used by capture output |

Do not modify in this gate family unless a later Gate explicitly approves it:

| Area | Reason |
| --- | --- |
| `src/lib/capture/**` | Capture output pixels and renderer behavior are out of scope |
| `src/app/api/**` | API contract must remain unchanged |
| `src/lib/supabase/types.ts` | DB schema/type contract change is not needed for minimal implementation |
| `scripts/check-*` | Harness changes are not required for preview UI |
| `tests/golden/**` | Golden PNGs and manifests are out of scope |

## 4. Safest Minimal Implementation Scope

The safest next implementation is a single-file operator UI update in `CaptureList.tsx`.

Allowed minimal additions:

- Keep `CaptureRecord` contract compatible with current API response.
- Add optional fields only if already present in response data, such as `screenshot_storage_path?: string | null`.
- Add local modal state:
  - selected output: `placement` or `landing`
  - zoom mode: `fit`, `100`, `150`, `200`
  - inspector accordion state on mobile
  - copied action feedback state
- Add pure UI helpers:
  - output item builder
  - URL hostname formatter
  - duration formatter
  - diagnostics summary formatter
  - storage path display formatter
  - copy-to-clipboard wrapper
- Keep delete behavior and existing conditional delete flag unchanged.

Not included in minimal implementation:

- New route such as `/captures/[id]`
- DB migration
- API response shape change
- Retry/regenerate/approve result actions
- Golden candidate approval
- Pixel diff or visual regression automation

## 5. Desktop Layout Plan

Desktop should become a review workspace instead of a narrow scroll modal.

Recommended shell:

```text
fixed inset-0
modal width: min(96vw, 1440px)
modal height: min(92vh, 960px)
grid rows: toolbar / main / optional thumbnail strip
main grid columns: preview minmax(0, 1fr) + inspector 340-380px
```

### 5.1 Top Toolbar

Purpose:

- Keep workspace controls visible.
- Avoid placing controls on top of the output image.

Contents:

- close button
- channel/product label
- status badge
- capture created time
- zoom segmented control: fit / 100% / 150% / 200%
- open original
- download

Rules:

- Safe review actions only.
- No destructive action in primary toolbar.
- Do not claim pixel match or golden verification.
- Show disabled reason when current selected output has no URL.

### 5.2 Large Preview

Purpose:

- Make the selected output image the primary area.

Implementation direction:

- Use neutral operator UI canvas outside the image.
- Use `object-fit: contain` for fitted view.
- Preserve original image aspect ratio.
- Do not crop.
- Do not draw watermark, overlay, border, badge, or metadata inside the image.
- Do not transform the actual file; CSS zoom is viewer-only.

Suggested behavior:

| Zoom mode | CSS behavior | Notes |
| --- | --- | --- |
| `fit` | `max-width: 100%; max-height: 100%; object-fit: contain` | default |
| `100` | natural display scale if feasible, with scroll/pan container | show original-size intent |
| `150` | scaled viewer image in scroll container | viewer-only |
| `200` | scaled viewer image in scroll container | viewer-only |

The preview should display a small viewer label outside the image, for example:

- `맞춤`
- `100% 보기`
- `원본 파일은 변경되지 않음`

This label must not overlay the capture output.

### 5.3 Right Inspector

Purpose:

- Keep metadata visible beside the image.
- Separate review data from the output bitmap.

Recommended width:

- 340px default
- 380px for wide desktop if room allows

Required fields:

- status
- capturedAt
- durationMs
- resultCategory
- placement/source URL
- landing URL
- storage path
- diagnostics summary

Suggested information architecture:

1. Status block
   - status badge
   - quality/result label
   - failure message if failed
2. Capture metadata
   - capture ID
   - channel/product/surface
   - createdAt
   - metadata capturedAt
   - durationMs
3. URL block
   - placement/source URL
   - creative URL
   - landing final URL
4. Storage block
   - placement image URL
   - landing image URL when selected/available
   - screenshot storage path when available
5. Diagnostics summary
   - resultCategory
   - quality flag count
   - top quality/review reason
   - runtime provider
   - diagnostics detail accordion

Important:

- Diagnostics summary must not be worded as a guarantee of media-screen fidelity.
- `pixel perfect`, `pixel match passed`, and `golden sample verified` must not appear unless a future golden validation result exists.

### 5.4 Placement/Landing Tabs or Thumbnail Strip

Minimal recommendation:

- Use top tabs or a compact thumbnail strip for `placement` and `landing`.
- Default selected output is placement.
- If landing image is unavailable, show disabled landing tab with reason.

Desktop options:

| Option | When to use | Notes |
| --- | --- | --- |
| Top tabs | Minimal Gate implementation | Best first step |
| Bottom thumbnail strip | If future variants/diffs are expected soon | More layout work |
| Left thumbnail rail | Wide review workspace | Useful later, not needed first |

Minimal Gate should use top tabs or a slim bottom strip, not both.

## 6. Mobile Layout Plan

Mobile should be image-first.

Recommended shell:

```text
fixed inset-0
height: 100dvh
grid rows: top bar / image preview / tabs / accordion / bottom actions
```

### 6.1 Image First

- Preview image appears immediately below top bar.
- Use `object-fit: contain`.
- Keep metadata below or in accordion.
- Do not show long URL/path above the image.
- Avoid overlay controls on image except a subtle outside-image zoom label if needed.

### 6.2 Metadata Accordion

Default expanded:

- status
- capturedAt
- resultCategory
- selected output type

Default collapsed:

- placement/source URL
- creative URL
- landing URL
- storage path
- diagnostics detail

Rules:

- Missing metadata should show `없음` or `확인 불가`, not an empty string.
- URL/path rows should wrap or be copyable.
- Long strings should not force horizontal scroll except inside monospace path blocks.

### 6.3 Bottom Actions

Recommended visible actions:

1. download
2. copy URL
3. more

More menu or expanded action row:

- copy storage path
- open original
- copy capture ID
- zoom options

Mobile button labels must remain short and avoid overflow. Use accessible labels when an icon-only button is introduced.

## 7. Image Preview Boundary

The preview component must show existing image URLs only.

Allowed:

- `object-fit: contain`
- scroll/pan container
- CSS scale for viewer zoom
- neutral canvas background
- open original in a new tab
- download the original URL

Forbidden:

- crop
- filter
- recolor
- compression
- converting the image file
- drawing annotations inside the image
- adding AdMate/Openclaw overlay, badge, frame, watermark, or logo to the output image
- changing capture renderer output, storage upload, or image generation

The implementation should make the distinction explicit:

- displayed size is only a viewer state
- original image file remains unchanged
- download/open original uses the stored output URL directly

## 8. Inspector Field Mapping

Use current data first. Do not require API/DB contract changes.

| Inspector field | Current source | Minimal handling |
| --- | --- | --- |
| status | `capture.status` | existing status badge mapping |
| capturedAt | `metadata.capturedAt` or `capture.created_at` | show local formatted time, raw in title/detail if needed |
| durationMs | `metadata.durationMs` or `metadata.runtime.durationMs` | reuse `getDurationMs` |
| resultCategory | `metadata.resultCategory` | reuse `getResultCategoryLabel` |
| placement/source URL | `capture.source_url` | show hostname + copy full URL |
| landing URL | `capture.landing_final_url` | show when available |
| storage path | `capture.screenshot_storage_path` if response includes it | optional field; show unavailable otherwise |
| diagnostics summary | `metadata.diagnostics` | summarize flags/count/runtime without raw JSON default |
| runtime provider | `metadata.runtime.provider` or `metadata.runtimeProvider` | reuse `getRuntimeProviderLabel` |
| surface | `metadata.productFamily/productSurface/youtubeAdType/gdnViewportMode` | reuse `getMetadataSurfaceCode` |

If `screenshot_storage_path` is not returned by the current API list response, minimal implementation should not change API yet. It should show `storage path: unavailable` and include API exposure as a later Gate only if operators need it.

## 9. Action Buttons

Primary actions:

| Action | Desktop placement | Mobile placement | Behavior |
| --- | --- | --- | --- |
| download | toolbar and inspector | bottom bar | download selected output URL |
| copy URL | inspector | bottom bar | copy selected output URL |
| copy storage path | inspector storage row | more menu | copy path if present |
| open original | toolbar | more menu | open selected output URL in new tab |
| zoom | toolbar | more menu or top compact control | viewer-only zoom |

Secondary actions for later Gates:

- retry failed capture
- regenerate
- mark for review
- approve result
- compare with golden
- mark golden candidate

Do not implement secondary actions in Lens-Preview-UX-3 minimal implementation unless separately approved.

Action feedback:

- Copy success/failure should use a short inline state or toast.
- Download unavailable should be disabled with reason.
- Open original unavailable should be disabled with reason.
- Copy storage path should never silently fail.

## 10. API and DB Contract Preservation

Implementation should work with the existing `CaptureRecord` shape and API result.

Safe approach:

- Keep existing fields unchanged.
- Treat any extra data as optional.
- Do not add required response fields.
- Do not alter `vision_da_captures` schema.
- Do not change Supabase storage bucket behavior.
- Do not expose signed private URLs, credentials, tokens, or env values.

If storage path display becomes required and `screenshot_storage_path` is not available in the list API response, create a separate later Gate:

```text
Gate Lens-Preview-UX-4 storage path exposure review
```

That Gate should inspect API response fields, security implications, and whether showing storage path is safe for operators.

## 11. Accessibility, Keyboard, and Mobile Considerations

Accessibility:

- Modal must have `role="dialog"` and an accessible label/title in implementation.
- Close button needs an accessible label.
- Icon-only actions need `aria-label`.
- Disabled actions need visible or programmatic reason.
- Image alt should include selected output type, for example `게재면 캡처 이미지`.

Keyboard:

- `Escape` closes modal.
- Tab order:
  1. close
  2. selected output tabs
  3. zoom controls
  4. open/download/copy actions
  5. inspector fields/actions
- Arrow keys may switch tabs only if a proper tablist pattern is implemented.
- Focus should return to the originating list item after close if feasible.

Mobile:

- Use `100dvh` or equivalent to avoid browser chrome issues.
- Bottom actions must not cover the preview image.
- Long button labels should be avoided.
- Metadata accordions should not push image preview out of the first screen.

## 12. Validation Plan

Required validation for Lens-Preview-UX-3:

```bash
npm run build
npm run verify:harness
npm run check:surface-registry
npm run check:capture-metadata
```

Recommended additional validation:

- Type/lint:

```bash
npm run lint
```

- Modal smoke:
  - completed capture with placement only
  - completed capture with placement + landing
  - failed capture with error message
  - processing/pending capture
  - missing image URL
  - missing metadata

- Browser/visual check:
  - desktop width around 1440px
  - tablet around 1024px
  - mobile around 390px
  - image remains contained and not cropped
  - right inspector does not overlap image
  - mobile bottom actions do not overlap content
  - tabs or thumbnails do not crop output preview

Screenshot/visual check availability:

- Since this is operator UI, screenshots can be taken against local dev server or in-app browser if sample captures are visible.
- If there are no real capture records in local data, use existing non-sensitive fixture/mock only if already present.
- Do not add real advertiser or sensitive sample images.
- Do not add golden PNGs in this Gate.

## 13. Implementation Gate Split

### Gate Lens-Preview-UX-3 Minimal Implementation

Scope:

- `src/app/components/CaptureList.tsx`
- optional `src/app/globals.css` only if necessary

Deliver:

- large preview workspace
- right inspector on desktop
- top toolbar
- placement/landing tabs
- mobile image-first layout
- metadata accordion
- bottom actions
- download/copy URL/open original/zoom controls

Constraints:

- no capture output changes
- no capture engine changes
- no API/DB/env/storage changes
- no golden PNGs
- no secondary workflow actions

### Gate Lens-Preview-UX-4 Storage Path Exposure Review

Only if needed:

- verify whether `screenshot_storage_path` is returned to the UI
- decide whether operators should see/copy it
- assess security and signed URL implications
- update API/types only after approval

### Gate Lens-Preview-UX-5 Visual Smoke and QA

After implementation:

- run local browser visual check
- capture desktop/mobile screenshots of the modal
- verify no output image crop/filter/overlay
- verify actions and keyboard behavior

### Gate Lens-Preview-UX-6 Golden Candidate Workflow

Future only:

- mark representative output as golden candidate
- compare with golden
- diff report links
- approval/audit trail

## 14. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Preview CSS makes image look cropped | Operators may misjudge capture quality | Use `object-fit: contain`, no crop, show selected zoom mode |
| Zoom state is mistaken for original file size | Review confusion | Label zoom mode and keep open-original action |
| Inspector exposes sensitive URL/path | Security risk | Show only existing public/operator-safe fields; no tokens/signed URLs |
| `screenshot_storage_path` is absent from UI record | Copy storage path unavailable | Treat as optional; separate API review Gate |
| Mobile bottom bar overlaps image | Poor review UX | Reserve layout space and test mobile viewport |
| Diagnostics are interpreted as pixel fidelity pass | False assurance | Avoid forbidden wording and show diagnostics as operational summary only |
| Single-file implementation becomes too large | Maintainability risk | Extract small local helper components inside `CaptureList.tsx`; split files only in later Gate if needed |

## 15. Lens-Preview-UX-3 Approval Prompt

Use this prompt to approve the next implementation Gate:

```text
Gate Lens-Preview-UX-3 minimal implementation을 승인한다.

범위:
- src/app/components/CaptureList.tsx 중심
- 필요 시 src/app/globals.css 최소 스타일만 허용
- CaptureDetailModal을 large preview + right inspector 구조로 개선
- desktop: top toolbar, large preview, right inspector, placement/landing tabs
- mobile: image first, metadata accordion, bottom actions
- actions: download, copy URL, copy storage path if available, open original, zoom controls

금지:
- 캡처 엔진/렌더링/합성/주입 로직 변경 금지
- DB schema/API contract/env/storage 변경 금지
- capture output image 변형 금지
- crop/filter/recolor/watermark/overlay 금지
- golden PNG 추가 금지
- unrelated dirty 파일 포함 금지

검증:
- npm run build
- npm run verify:harness
- npm run check:surface-registry
- npm run check:capture-metadata
- 가능하면 modal smoke 및 desktop/mobile screenshot check

보고:
- 변경 파일
- output image boundary 유지 여부
- desktop/mobile preview 동작
- action 버튼 동작
- 검증 결과
- 남은 리스크
- rollback 방법
```

## 16. Gate Result

Lens-Preview-UX-2 status: implementation plan prepared, implementation not started.
