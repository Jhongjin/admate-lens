# AdMate Sentinel Design Guidelines

작성일: 2026-04-27  
대상: AdMate Sentinel / Openclaw Monitor  
상태: v1

---

## 1. 제품 포지션

AdMate는 Guide, Sentinel, Planner, Vision을 포함하는 통합 플랫폼이다.

Sentinel은 AdMate 안의 캠페인 사고 방지 및 실시간 운영 모니터링 모듈이다.

Openclaw는 Sentinel의 내부 엔진/프로젝트 코드명으로 유지한다.

사용자 노출명은 다음을 우선한다.

- AdMate Sentinel
- 캠페인 사고 방지 및 실시간 운영 모니터링
- Powered by Openclaw Engine

---

## 2. UI 방향

Sentinel은 운영자가 매일 보는 실무형 대시보드다.  
따라서 과도하게 화려한 마케팅 페이지 스타일은 지양한다.

기본 방향:

- Linear 기반의 미니멀한 운영툴 UI
- Cohere식 데이터 요약 카드 감성 일부 반영
- Google Stitch / DESIGN.md 방식은 UI 일관성을 위한 참고 프레임으로 활용
- 정보 밀도는 유지하되, 핵심 상태는 한눈에 보여야 한다
- 기존 Openclaw UI의 깔끔하고 낮은 노이즈 구조를 유지한다

---

## 3. Visual Theme

키워드:

- precise
- calm
- operational
- data-dense
- trustworthy
- low-noise

피해야 할 것:

- 과한 그라데이션
- 두꺼운 그림자
- 불필요한 애니메이션
- 대형 마케팅 히어로
- 카드 남발
- 강한 컬러 포인트 과다 사용

---

## 4. Color Roles

기존 Openclaw 색상 체계를 우선 유지한다.

| Role | Color | 용도 |
|---|---|---|
| App Background | #F7F7F7 | 전체 배경 |
| Surface | #FFFFFF | 카드/패널 |
| Border | #E5E5E5 | 구분선 |
| Text Primary | #0D0D0D | 핵심 텍스트 |
| Text Secondary | #5E5E5E | 보조 텍스트 |
| Text Muted | #9A9A9A | 메타 정보 |
| Purple | #5E6AD2 | 브랜드/링크/주요 액션 |
| Red | #D93025 | 이상/위험 |
| Green | #177D4E | 정상/성공 |
| Amber | #9E5700 | 주의/검토 |

컬러 원칙:

- Red, Amber, Green은 상태 의미에만 사용한다.
- Purple은 브랜드 포인트와 주요 링크/CTA에만 사용한다.
- 대시보드 배경은 흰색/회색 기반을 유지한다.

---

## 5. Typography

기본 폰트:

Inter, -apple-system, BlinkMacSystemFont, sans-serif

사용 규칙:

- 페이지 타이틀: 18~20px / 800
- 섹션 타이틀: 13px / 800
- 카드 라벨: 11px / 600
- KPI 숫자: 24~26px / 800
- 테이블 본문: 12~13px / 500~700
- 메타 정보: 11px / 400~500

---

## 6. Components

### KPI Card

- 흰색 배경
- 1px border
- 8px radius
- 숫자는 크게
- 라벨과 보조 설명은 작게
- 상태색은 숫자/보조 badge에 제한적으로 사용한다

### Section Card

- 섹션 헤더는 #FAFAFA 배경
- 본문은 흰색
- 행 구분은 #F4F4F4 또는 #E5E5E5
- 모서리는 8px radius

### Recent Alerts Table

- 카드형 리스트보다 테이블형 유지
- 캠페인명, 유형, 상태, 심각도, 시간 순서
- summary_text는 한 줄 ellipsis
- 전체 상세는 /logs에서 확인

### Badges

- ALERT: red
- NORMAL: green
- warn: amber
- info/default: gray

---

## 7. Layout

기본 레이아웃:

1. Topbar
2. Sentinel hero / page header
3. KPI cards
4. Team / Platform / Daily Review summary
5. Recent alerts table

그리드:

- 상단 KPI: 6 columns
- 중단 카드: 3 columns
- 하단 최근 알림: full width
- 최대 폭: 1240px

---

## 8. Do / Don't

### Do

- 운영자가 5초 안에 오늘 위험 상태를 파악할 수 있게 한다.
- 숫자와 상태를 우선 보여준다.
- 자세한 분석은 /logs 또는 Drawer로 넘긴다.
- 기존 Openclaw UI의 단정한 느낌을 유지한다.
- 화면 수정 전 기존 파일을 백업한다.

### Don't

- 화려한 랜딩페이지처럼 만들지 않는다.
- Sentinel 화면에 Guide, Planner, Vision 기능을 섞지 않는다.
- 모든 정보를 한 화면에 몰아넣지 않는다.
- 상태색을 장식용으로 쓰지 않는다.
- raw campaign-level 데이터나 민감 정보가 화면에 불필요하게 노출되지 않게 한다.

---

## 9. Backup Rule

UI 수정 전 반드시 백업한다.

예:

cp src/app/page.tsx /tmp/page_before_sentinel_dashboard_$(date +%Y%m%d_%H%M%S).tsx

중요 변경 시에는 별도 docs 또는 git commit으로 남긴다.

---

## 10. Agent Prompt Guide

Sentinel UI를 수정할 때 사용할 기준 문장:

Build this as an operational AdMate Sentinel dashboard.  
Use a Linear-like minimal enterprise UI with Cohere-style data summary cards.  
Keep the interface calm, precise, and data-dense.  
Do not make it look like a marketing landing page.  
Use red, amber, and green only for operational status.  
Preserve the existing Openclaw layout discipline and back up files before editing.
