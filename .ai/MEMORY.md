# MEMORY.md

작성일: 2026-05-03
repo: admate-lens
AdMate 역할: AdMate Lens / capture and evidence automation

---

## 1. Project Identity

이 repo는 AdMate Lens다.

```text
광고 게재 화면과 보고서 증빙 이미지를 자동 생성하는 캡처/렌더링 솔루션
```

AdMate Lens의 최우선 품질 기준은 실제 매체 화면과 거의 차이가 없는 고품질 캡처 결과물이다.

---

## 2. Source of Truth

먼저 읽을 문서:

```text
AGENTS.md
README.md
.ai/MEMORY.md
.ai/RULES.md
.ai/PLAN.md
docs/strategy/05_AdMate_Product_Map_v1.md
docs/strategy/AdMate_Lens_YouTube_Product_Coverage_Backlog_v1.md
docs/strategy/AdMate_Lens_Naver_Mobile_Product_Coverage_v1.md
docs/strategy/AdMate_Lens_Kakao_Mobile_Product_Coverage_v1.md
docs/design/openclaw-theme-reference.md
```

중앙 원본:

```text
D:\Projects\AdMate\admate-docs
```

---

## 3. Current Structure

주요 UI:

```text
src/app/page.tsx
src/app/components/CaptureForm.tsx
src/app/components/CaptureList.tsx
```

주요 API:

```text
src/app/api/captures/route.ts
src/app/api/captures/execute/route.ts
src/app/api/upload/route.ts
src/app/api/yt-storyboard/route.ts
```

캡처 엔진:

```text
src/lib/capture/channels/youtube-capture.ts
src/lib/capture/channels/youtube-infeed-inpage.ts
src/lib/capture/channels/youtube-preroll-inpage.ts
src/lib/capture/channels/youtube-shorts-synthetic.ts
src/lib/capture/channels/youtube-masthead-synthetic.ts
src/lib/capture/channels/gdn-capture.ts
src/lib/capture/channels/mobile-native-capture.ts
src/lib/capture/channels/mobile-synthetic-infeed.ts
src/lib/capture/engine/puppeteer-engine.ts
src/lib/capture/engine/browser-engine.ts
src/lib/capture/utils/frame-composite.ts
```

자산:

```text
public/frames/iphone15-frame.png
public/frames/pixel8-frame.png
```

---

## 4. Non-negotiable Facts

- 캡처 결과물/광고 미리보기/매체 네이티브 UI에는 AdMate/Openclaw 테마를 적용하지 않는다.
- 운영자 화면, 입력 폼, 작업 목록, 상태 라벨, 설정 화면은 AdMate/Openclaw 테마 적용 가능 영역이다.
- 캡처 결과물 품질은 기능보다 낮은 우선순위가 아니다. Lens의 핵심 제품 가치다.
- 실제 매체 화면 reference 없이 spacing, typography, CTA, frame, progress bar, status bar를 임의 조정하지 않는다.
- legacy surface를 단순 재노출하지 않는다.
- DB schema 변경은 먼저 보고하고 가능하면 metadata 확장을 우선 검토한다.
- secret, API key, token, credential 값은 출력하지 않는다.
- `.env.local`은 커밋하지 않는다.
- commit/push/PR은 사용자 승인 후 진행한다.

---

## 5. Build/Test

확인 명령:

```text
npm run build
npm run lint
```

로컬 확인:

```text
npm run dev
http://127.0.0.1:3000/
```

캡처 품질 작업은 build만으로 완료가 아니다. 가능한 경우 실제 생성 이미지 또는 screenshot을 확인하고, 매체 reference와 차이를 설명해야 한다.

---

## 6. Canonical Naming And Branch Note

Canonical local repo:

```text
D:\Projects\AdMate\admate-lens
```

Canonical GitHub remote:

```text
https://github.com/Jhongjin/admate-lens.git
```

Historical/internal names:

```text
기존 Capture Pro
기존 repo slug admate-capture-pro
현재 public/product name AdMate Lens
현재 technical repo slug admate-lens
```

As of Gate Lens-Safety-1, local `HEAD` matches `origin/main`, but the current local branch still tracks the older feature branch `origin/codex/youtube-instream-skip-timing`. A later branch cleanup gate should realign local work to `main` or reset the upstream after documentation cleanup is reviewed.
