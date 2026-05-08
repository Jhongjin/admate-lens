# RULES.md

작성일: 2026-05-03
repo: admate-lens

---

## 1. Work Rules

- 먼저 `AGENTS.md`, `README.md`, `.ai/MEMORY.md`, `.ai/RULES.md`, `.ai/PLAN.md`를 읽는다.
- 아직 파일을 수정하지 않는다.
- 수정 후보 파일, 위험 요소, 작업 계획을 먼저 보고한다.
- 사용자 승인 후 수정한다.
- build/test 결과를 보고한다.
- 변경 파일 목록과 rollback 방법을 보고한다.

---

## 2. Capture Fidelity Rules

- 캡처 결과물은 실제 매체 화면과의 매칭이 최우선이다.
- 광고 미리보기/캡처 결과물/매체 synthetic UI에는 AdMate/Openclaw 테마를 적용하지 않는다.
- spacing, typography, CTA, icon, device frame, progress bar, status bar는 실제 reference 기준으로 조정한다.
- reference 없이 감으로 UI를 바꾸지 않는다.
- 출력 이미지 품질 저하, 해상도 저하, DPR 저하, Sharp 합성 품질 저하는 regression으로 본다.
- 품질 작업 후 가능한 경우 생성 결과 또는 screenshot 확인 내용을 보고한다.

---

## 3. Operator UI Rules

- 운영자 화면, 입력 폼, 작업 목록, 상태 라벨, 설정 화면은 AdMate/Openclaw 테마 적용 가능 영역이다.
- 운영자 UI를 개선하더라도 기존 캡처 옵션, form field, product type, metadata를 임의 제거하지 않는다.
- raw JSON/debug는 기본 노출하지 않는다.

---

## 4. Product Surface Rules

- YouTube Display/Overlay 레거시는 최신 QA 없이 공개 상품으로 재노출하지 않는다.
- Demand Gen은 Google Ads 상품 흐름이지만 1차 결과물은 YouTube Feed/Shorts 중심으로 구분한다.
- Naver/Kakao 모바일 surface는 실제 상품 단위로 분리한다.
- legacy request는 깨뜨리지 않고 정규 surface로 호환 처리한다.

---

## 5. Security Rules

- secret, API key, token, credential 값을 출력하지 않는다.
- `.env`, `.env.local`, `.env.production`을 커밋하지 않는다.
- Supabase service role key를 브라우저에 노출하지 않는다.
- real advertiser/campaign/sensitive operational data를 넣지 않는다.

---

## 6. Git Rules

- main에 직접 push하지 않는다.
- commit/push/PR은 사용자 승인 후 진행한다.
- 사용자 변경사항을 임의로 revert하지 않는다.
