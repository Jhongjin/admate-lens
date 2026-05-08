# TASKS.md

작성일: 2026-05-03
repo: admate-lens

---

## In Progress

- Lens capture-fidelity 중심 repo harness / skills 정리
- Naver/Kakao mobile native surface 품질 및 상품 구분 안정화
- Branch cleanup note: local `HEAD` matches `origin/main`, but current branch tracking still points to `origin/codex/youtube-instream-skip-timing`; clean this in a later non-output gate.

---

## Next

- media별 golden reference screenshot 저장 위치 결정
- capture quality smoke/report 스크립트 설계
- YouTube PC home In-feed 정기 QA 루틴 추가
- Demand Gen metadata 구분 QA

---

## Backlog

- `npm run harness:smoke` 후보 설계
- `npm run harness:report` 후보 설계
- generated capture output visual QA checklist
- pixel-diff or image-diff script 검토
- mobile frame composite regression test
- Naver/Kakao follow-up surfaces: video, shopping, catalog variants

---

## Done

- YouTube 인스트림/인피드/Shorts/Masthead 주요 상품 구현
- Demand Gen 1차 YouTube Feed/Shorts 범위 정리
- Naver/Kakao 모바일 1차 surface 문서화
- Lens-GDN-Icon-3: GDN disclosure icon placement tuning completed and present in HEAD.
- Lens-Preview-UX-3: capture preview workspace UX completed and present in HEAD.
