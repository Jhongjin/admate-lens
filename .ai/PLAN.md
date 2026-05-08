# PLAN.md

작성일: 2026-05-03
repo: admate-lens

---

## 1. Current Goal

```text
AdMate Lens repo를 Codex/Agent가 안정적으로 작업할 수 있도록 capture-fidelity 중심 harness와 skills를 정리한다.
```

---

## 2. Product Goal

```text
각 매체의 실제 화면과 퀄리티 차이가 거의 없는 광고 캡처/증빙 이미지를 생성한다.
```

---

## 3. Skill Strategy

Lens는 하나의 범용 skill만으로 부족하다.

repo-local skills를 다음처럼 나눈다.

```text
admate-lens-capture = Lens 전체 작업 지도
lens-capture-fidelity-qa = 결과물 품질/픽셀 매칭 검증
lens-youtube-capture-builder = YouTube/Instream/In-feed/Shorts/Masthead/Demand Gen
lens-gdn-capture-builder = GDN publisher slot detection/injection
lens-mobile-native-capture-builder = Naver/Kakao mobile native surfaces
```

협업/경계 인지를 위해 다음 cross-repo skills도 둔다.

```text
openclaw-agent-core
admate-homepage-command-center
admate-compass-rag
admate-foresight-planning
admate-docs-director
```

---

## 4. Candidate Files by Work Type

운영자 UI:

```text
src/app/components/CaptureForm.tsx
src/app/components/CaptureList.tsx
src/app/page.tsx
src/app/globals.css
```

YouTube:

```text
src/lib/capture/youtube-ad-types.ts
src/lib/capture/channels/youtube-capture.ts
src/lib/capture/channels/youtube-infeed-inpage.ts
src/lib/capture/channels/youtube-preroll-inpage.ts
src/lib/capture/channels/youtube-shorts-synthetic.ts
src/lib/capture/channels/youtube-masthead-synthetic.ts
```

GDN:

```text
src/lib/capture/channels/gdn-capture.ts
src/lib/capture/injection/ad-slot-detector.ts
src/lib/capture/injection/creative-injector.ts
```

Naver/Kakao mobile:

```text
src/lib/capture/channels/mobile-native-capture.ts
src/lib/capture/channels/mobile-synthetic-infeed.ts
```

Capture execution/storage:

```text
src/app/api/captures/route.ts
src/app/api/captures/execute/route.ts
src/lib/storage/capture-storage.ts
src/lib/supabase/types.ts
```

---

## 5. Risks

```text
캡처 결과물 UI를 운영자 테마처럼 바꾸는 것
실제 매체 reference 없이 synthetic UI를 감으로 조정하는 것
YouTube 레거시 display/overlay를 최신 QA 없이 재노출하는 것
Naver/Kakao 상품 surface를 하나의 모바일 피드로 뭉개는 것
DB schema 변경으로 기존 작업 이력을 깨는 것
Puppeteer/Vercel 서버리스 제약을 무시하는 것
```

---

## 6. Test Plan

기본:

```text
npm run build
npm run lint
```

캡처 품질 작업:

```text
1. 대상 surface와 reference 기준을 명시한다.
2. 생성 이미지 또는 screenshot을 확인한다.
3. viewport, DPR, frame, typography, spacing, CTA, progress bar, status bar 차이를 기록한다.
4. 변경 전후 차이를 설명한다.
5. 실패/폴백 경로를 확인한다.
```

---

## 7. Open Questions

- media별 golden reference screenshot을 어디에 보관할 것인가?
- pixel diff 자동화 스크립트를 도입할 것인가?
- Command Center에 Lens 캡처 품질 QA 상태를 표시할 것인가?

---

## 8. Completed Recent Gates

- Lens-GDN-Icon-3: completed in code at `65d4c66 feat: tune GDN disclosure icon placement`.
- Lens-Preview-UX-3: completed in code at `b0bb299 feat: improve Lens capture preview workspace`.

These gates should be treated as fixed unless a future approved capture-fidelity QA gate supplies reference evidence and explicitly authorizes additional tuning.
