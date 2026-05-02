# AdMate Homepage IA & Brand Copy v1

작성일: 2026-05-01  
문서 상태: 초안 v1  
작성 목적: AdMate 공식 홈페이지 또는 내부 소개 페이지 제작을 위한 정보 구조(IA), 브랜드 메시지, 섹션별 카피, 제품 카드 문구, CTA, 시각화 방향, 구현 시 주의사항을 정의한다.

---

## 1. Homepage의 역할

AdMate 홈페이지는 단순한 제품 소개 페이지가 아니다.

AdMate가 무엇인지, 어떤 문제를 해결하는지, 어떤 제품군으로 구성되는지, 그리고 왜 나스미디어 데이터분석팀의 AI Agent 기반 광고 운영 자동화 플랫폼인지 설명하는 **브랜드 허브** 역할을 해야 한다.

홈페이지의 핵심 목적은 다음과 같다.

1. AdMate의 정체성을 한눈에 이해시킨다.
2. Compass / Sentinel / Lens / Foresight / Agent Core의 역할을 명확히 보여준다.
3. 광고 운영 업무의 문제와 AdMate의 해결 방식을 연결한다.
4. 임원에게는 회사 경쟁력과 데이터 자산화 가능성을 보여준다.
5. 미디어플래너에게는 실제 업무가 어떻게 편해지는지 보여준다.
6. 향후 각 제품 상세 페이지, 데모, 문서, 관리자 콘솔로 연결될 수 있는 기반을 만든다.

---

## 2. 최상위 브랜드 메시지

AdMate의 최상위 메시지는 다음으로 통일한다.

```text
AdMate
AI Agent 기반 광고 운영 자동화 플랫폼
```

Hero 영역에서 사용할 메인 카피는 다음을 1순위로 추천한다.

```text
기획부터 운영, 검수, 캡처, 학습까지
광고 운영의 전 과정을 AI Agent가 연결합니다.
```

보조 카피는 다음을 사용한다.

```text
AdMate는 광고 캠페인의 정책 확인, 세팅 검수, 실시간 모니터링, 캡처 자동화, 성과 예측을 하나의 Agent 운영 흐름으로 연결해 반복 업무를 줄이고 캠페인 판단을 더 정확하게 만듭니다.
```

짧은 브랜드 카피 후보는 다음과 같다.

```text
Plan. Validate. Monitor. Capture. Learn.
광고 운영의 전 과정을 AI Agent로 연결합니다.
```

---

## 3. 홈페이지 대상 사용자

AdMate 홈페이지는 하나의 대상만을 위한 페이지가 아니다.

| 대상 | 홈페이지에서 알고 싶은 것 | 강조 메시지 |
|---|---|---|
| 임원/의사결정권자 | 회사 경쟁력, 업무 효율, 사고 예방, AI 운영 체계 | AdMate는 회사 고유 광고 운영 지식을 축적하는 플랫폼 |
| 미디어플래너 | 내 업무가 어떻게 줄어드는가 | 반복 확인, 검수, 캡처, 모니터링을 줄여주는 AI 업무 파트너 |
| 데이터분석팀/개발자 | 제품 구조와 Agent Core의 역할 | Compass/Sentinel/Lens/Foresight를 Agent Core가 연결 |
| 신규 협업자/LLM/Agent | 전체 맥락과 제품군 관계 | AdMate는 AI Agent 기반 광고 운영 자동화 생태계 |
| 광고주/외부 이해관계자 | 서비스 품질과 신뢰성 | 더 빠르고 정확한 광고 운영 지원 기반 |

따라서 홈페이지는 너무 기술적이거나 너무 마케팅적으로 치우치지 않아야 한다. 실무형 운영 콘솔의 신뢰감과 AI Agent 플랫폼의 미래감을 함께 전달해야 한다.

---

## 4. 추천 사이트맵

초기 홈페이지는 단일 랜딩 페이지 형태로 시작하고, 이후 제품별 상세 페이지를 확장하는 구조가 좋다.

### 4.1 1차 단일 페이지 구조

```text
/                      AdMate Home
/#problem              광고 운영의 문제
/#ecosystem            AdMate 생태계
/#products             제품군 소개
/#lifecycle            캠페인 운영 사이클
/#agent-core           AdMate Agent Core
/#impact               기대 효과
/#operations           AI 운영 체계
/#roadmap              로드맵
```

### 4.2 향후 확장 구조

```text
/
/products/compass
/products/sentinel
/products/lens
/products/foresight
/agent-core
/resources
/docs
/contact 또는 /request-demo
```

초기에는 제품별 상세 페이지보다 홈에서 전체 세계관을 명확히 전달하는 것이 우선이다.

---

## 5. Header / Navigation

### 5.1 Header 구성

권장 Header:

```text
Logo: AdMate
Nav: Platform / Products / Agent Core / Impact / Roadmap
CTA: Request Demo 또는 View Console
```

내부용 페이지라면 CTA는 다음처럼 바꿀 수 있다.

```text
Open Console
View Docs
```

### 5.2 Navigation Label 추천

| 메뉴 | 의미 |
|---|---|
| Platform | AdMate 전체 소개 |
| Products | Compass / Sentinel / Lens / Foresight |
| Agent Core | Openclaw/Hermes 기반 지능·자동화 레이어 |
| Impact | 업무 효율과 회사 경쟁력 |
| Roadmap | Cost Center, Weekly Intelligence, 장기 전략 |

---

## 6. Hero Section

### 6.1 Hero 목적

첫 화면에서 사용자는 다음을 바로 이해해야 한다.

```text
AdMate는 광고 운영을 위한 AI Agent 플랫폼이다.
개별 챗봇이 아니라 기획부터 운영까지 연결한다.
Compass/Sentinel/Lens/Foresight/Agent Core로 구성된다.
```

### 6.2 Hero 메인 카피

```text
AdMate
AI Agent 기반 광고 운영 자동화 플랫폼
```

### 6.3 Hero 서브 카피

```text
기획부터 운영, 검수, 캡처, 학습까지
광고 운영의 전 과정을 AI Agent가 연결합니다.
```

### 6.4 Hero 설명 문단

```text
AdMate는 광고 캠페인의 정책 확인, 세팅 검수, 실시간 모니터링, 캡처 자동화, 성과 예측을 하나의 Agent 운영 흐름으로 연결합니다. 반복 업무는 줄이고, 캠페인 판단과 실행은 더 정확하게 만듭니다.
```

### 6.5 Hero CTA

1순위 CTA:

```text
AdMate 생태계 보기
```

2순위 CTA:

```text
제품 구성 살펴보기
```

내부 운영 콘솔 연결 CTA:

```text
운영 콘솔 열기
```

### 6.6 Hero 시각화 아이디어

중앙에 AdMate Agent Core를 두고 주변에 네 제품을 배치한다.

```text
          Compass
             |
Lens - Agent Core - Sentinel
             |
          Foresight
```

또는 캠페인 생애주기 흐름으로 표현한다.

```text
Plan -> Validate -> Monitor -> Capture -> Learn
```

---

## 7. Problem Section

### 7.1 섹션 제목

```text
광고 운영은 점점 복잡해지고 있습니다
```

### 7.2 섹션 설명

```text
매체는 늘어나고, 정책은 자주 바뀌며, 캠페인 세팅과 운영 확인 업무는 여전히 수작업에 많이 의존합니다. 작은 세팅 오류는 캠페인 사고로 이어질 수 있고, 반복적인 캡처와 보고 업무는 미디어플래너의 시간을 계속 소모합니다.
```

### 7.3 문제 카드

| 카드 제목 | 설명 |
|---|---|
| 분산된 정책 확인 | Meta, Google, Naver, Kakao, X 정책을 각각 찾아야 합니다. |
| 수작업 세팅 검수 | 미디어믹스와 실제 매체 세팅값을 사람이 직접 비교합니다. |
| 운영 중 이상 감지 지연 | 예산 소진, KPI 변화, 캠페인 상태를 계속 확인해야 합니다. |
| 반복 캡처 업무 | 광고 게재 화면과 보고서 증빙 이미지를 매번 수작업으로 준비합니다. |
| 제안 기준 분산 | 과거 성과와 업종별 기준이 체계적으로 연결되지 않습니다. |
| 운영 지식 손실 | 플래너의 판단이 개인 경험으로만 남고 회사 지식으로 축적되지 않습니다. |

### 7.4 전환 문구

```text
AdMate는 이 반복 업무들을 개별 기능으로 흩어놓지 않고, 하나의 캠페인 운영 흐름으로 연결합니다.
```

---

## 8. Ecosystem Section

### 8.1 섹션 제목

```text
하나의 Agent Core, 네 개의 광고 운영 플랫폼
```

### 8.2 섹션 설명

```text
AdMate는 정책, 검수, 캡처, 예측을 담당하는 네 개의 전문 플랫폼과 이를 연결하는 Agent Core로 구성됩니다. 각 플랫폼은 독립적으로 업무를 줄이고, Agent Core를 통해 캠페인 단위의 실행·기록·학습 흐름으로 연결됩니다.
```

### 8.3 제품군 요약

| 제품 | 한 줄 설명 |
|---|---|
| Compass | 광고 정책과 가이드의 방향을 잡아주는 Policy Intelligence Agent |
| Sentinel | 캠페인 시작 전 검수와 집행 후 실시간 감지를 모두 담당하는 사고 방지 플랫폼 |
| Lens | 광고 게재 화면과 보고서 증빙을 자동 생성하는 캡처 자동화 솔루션 |
| Foresight | 과거 데이터 기반으로 다음 캠페인의 성과를 예측하는 플래닝 인텔리전스 |
| Agent Core | Openclaw와 Hermes 기반의 지능·자동화·학습 공통 엔진 |

---

## 9. Product Cards Section

### 9.1 AdMate Compass 카드

제목:

```text
AdMate Compass
```

서브타이틀:

```text
Policy Intelligence Agent
```

카피:

```text
정책과 가이드의 방향을 잡다
```

설명:

```text
Meta, Google, Naver, Kakao, X의 광고 정책과 가이드를 기반으로 캠페인 집행 전 필요한 정책 판단을 빠르게 지원합니다.
```

주요 기능:

- 매체별 정책/가이드 검색
- RAG 기반 질의응답
- 정책 근거 제공
- 향후 Multi-LLM 검증

### 9.2 AdMate Sentinel 카드

제목:

```text
AdMate Sentinel
```

서브타이틀:

```text
Campaign Validation & Live Monitoring
```

카피:

```text
캠페인 사고를 사전에 막고 실시간으로 감지하다
```

설명:

```text
캠페인 시작 전에는 미디어믹스와 실제 매체 세팅값을 비교하고, 집행 후에는 예산·성과·상태 이상을 실시간으로 감지합니다.
```

주요 기능:

- 사전 세팅 검수
- 예산/기간/타겟/URL 오류 탐지
- 실시간 KPI 이상 감지
- Slack/Email 알림
- 운영자 대응 기록

### 9.3 AdMate Lens 카드

제목:

```text
AdMate Lens
```

서브타이틀:

```text
Creative & Placement Capture Automation
```

카피:

```text
광고 게재 화면과 증빙을 자동으로 만들다
```

설명:

```text
광고 게재 화면과 지면 노출 이미지를 자동 생성해 캡처·증빙·보고 업무에 투입되는 반복 리소스를 줄입니다.
```

주요 기능:

- 광고 게재 화면 캡처
- 모바일/데스크톱 광고 UI 렌더링
- 보고서용 증빙 이미지 생성
- 캡처 이력 관리

### 9.4 AdMate Foresight 카드

제목:

```text
AdMate Foresight
```

서브타이틀:

```text
Media Planning Intelligence
```

카피:

```text
다음 캠페인의 성과를 미리 예측하다
```

설명:

```text
과거 캠페인 데이터와 시장 트렌드를 기반으로 캠페인 기획 단계에서 예상 성과와 전략 방향을 제안합니다.
```

주요 기능:

- 예상 CPM/CPC/CTR/VTR 제공
- 업종/목표별 벤치마크
- 예산 대비 성과 시뮬레이션
- Meta PoC 후 타 매체 확장

### 9.5 AdMate Agent Core 카드

제목:

```text
AdMate Agent Core
```

서브타이틀:

```text
Intelligence & Automation Engine
```

카피:

```text
지능과 자동화를 연결하다
```

설명:

```text
Openclaw의 실행 자동화와 Hermes의 학습/기억 구조를 기반으로 AdMate 플랫폼 전반의 업무 흐름을 연결하고 고도화합니다.
```

주요 기능:

- workflow 실행
- Slack action 처리
- 운영자 피드백 학습
- 감사 로그 기록
- LLM 비용/사용량 추적

---

## 10. Campaign Lifecycle Section

### 10.1 섹션 제목

```text
캠페인 운영의 전 과정을 하나의 흐름으로
```

### 10.2 흐름

```text
1. 기획
   Foresight로 예상 성과와 전략 방향 확인

2. 정책 확인
   Compass로 매체 정책과 가이드 확인

3. 세팅 검수
   Sentinel로 미디어믹스와 실제 세팅값 비교

4. 집행 후 모니터링
   Sentinel Live Monitoring으로 예산/KPI/상태 이상 감지

5. 캡처/보고
   Lens로 광고 게재 화면과 증빙 이미지 생성

6. 학습/고도화
   Agent Core가 운영자 피드백을 Hermes에 축적
```

### 10.3 섹션 카피

```text
AdMate는 캠페인 운영 단계를 따로 떼어놓지 않습니다. 기획 단계의 예측, 집행 전 정책 확인, 시작 전 세팅 검수, 운영 중 이상 감지, 보고용 캡처, 다음 캠페인 학습까지 하나의 캠페인 흐름으로 연결합니다.
```

---

## 11. Agent Core Section

### 11.1 섹션 제목

```text
AdMate Agent Core: 실행하고, 기록하고, 학습하는 중심 엔진
```

### 11.2 설명

```text
AdMate Agent Core는 네 개의 플랫폼을 하나의 운영 흐름으로 연결합니다. Openclaw는 스케줄과 조건에 따라 업무를 실행하고, Hermes는 AI와 사용자 이벤트를 학습해 운영 지식과 판단 기준을 축적합니다.
```

### 11.3 Openclaw / Hermes 설명

```text
Openclaw
업무를 실행하는 자동화 엔진입니다. 캠페인 모니터링, 알림, Slack action, 외부 Tool 호출을 담당합니다.

Hermes
운영 지식을 축적하는 지능/메모리 엔진입니다. 운영자 피드백과 AI 이벤트를 학습해 더 나은 판단 기준을 만듭니다.
```

### 11.4 짧은 비유

```text
Openclaw는 움직이는 손과 발,
Hermes는 기억하고 판단하는 두뇌입니다.
```

---

## 12. Impact Section

### 12.1 섹션 제목

```text
반복 업무는 줄이고, 광고 운영 지식은 축적합니다
```

### 12.2 Impact 카드

| Impact | 설명 |
|---|---|
| 업무 효율 향상 | 정책 확인, 세팅 검수, 캡처, 운영 확인 시간을 줄입니다. |
| 캠페인 사고 예방 | 시작 전 세팅 오류와 집행 후 이상 신호를 빠르게 감지합니다. |
| 광고주 서비스 품질 향상 | 더 빠르고 근거 있는 대응과 보고가 가능해집니다. |
| 회사 고유 지식 자산화 | 운영자 판단과 예외 기준이 Hermes에 축적됩니다. |
| AI 비용 통제 | LLM Cost Center로 플랫폼별/모델별 비용을 관리합니다. |
| 지속적 기술 고도화 | Weekly Intelligence Loop로 최신 기술을 반영합니다. |

---

## 13. Operations Section

### 13.1 섹션 제목

```text
AI를 도입하는 것에서 끝나지 않는 운영 체계
```

### 13.2 LLM Cost Center 카피

```text
AdMate는 유료 LLM과 AI API 사용량을 플랫폼별, 모델별, 기능별로 추적합니다. 이를 통해 AI 활용을 확대하면서도 비용 구조와 ROI를 관리할 수 있습니다.
```

### 13.3 Weekly Intelligence Loop 카피

```text
AI와 MarTech 기술은 빠르게 변합니다. AdMate는 매주 최신 기술과 광고 플랫폼 변화를 조사하고, 적용 가능한 개선 후보를 선별해 플랫폼을 지속적으로 고도화합니다.
```

### 13.4 장기 비전 카피

```text
장기적으로 AdMate는 내부 업무 데이터와 시장 정보를 기반으로 신규 솔루션 기회를 탐색하고 PoC 개발로 연결하는 전략 엔진으로 확장될 수 있습니다.
```

---

## 14. Roadmap Section

### 14.1 섹션 제목

```text
AdMate Roadmap
```

### 14.2 단계별 로드맵

| 단계 | 목표 |
|---|---|
| Phase 1 | Compass / Sentinel / Lens / Foresight 브랜드와 제품 구조 정리 |
| Phase 2 | Agent Core 기반 Sentinel Live Monitoring 안정화 |
| Phase 3 | Lens와 Compass UI/UX 정렬 및 Tool API화 |
| Phase 4 | Foresight Meta PoC 설계 및 데이터 기준 정리 |
| Phase 5 | LLM Cost Center와 Weekly Intelligence Loop 구축 |
| Phase 6 | Business Opportunity Discovery Loop 장기 확장 |

---

## 15. CTA Section

### 15.1 내부용 CTA

```text
AdMate 운영 콘솔 보기
전략 문서 보기
제품별 데모 준비하기
```

### 15.2 외부/광고주용 CTA 후보

```text
AdMate 소개 요청하기
데모 문의하기
캠페인 운영 자동화 상담하기
```

초기에는 내부 프로젝트이므로 외부 CTA보다 내부 문서/콘솔 연결이 우선이다.

---

## 16. Visual Design Direction

AdMate 홈페이지는 화려한 마케팅 사이트보다 신뢰감 있는 운영 플랫폼 톤을 가져야 한다.

### 16.1 톤

```text
실무형
정돈된
차분한
신뢰감 있는
AI스럽지만 과장되지 않은
```

### 16.2 디자인 기준

- Openclaw/Sentinel 운영 콘솔의 차분한 톤을 기반으로 한다.
- 배경은 밝은 회색 또는 아주 어두운 네이비 중 하나를 선택한다.
- 카드 기반 레이아웃을 사용한다.
- 제품별 컬러는 과하지 않게 포인트로만 사용한다.
- 데이터/Agent 흐름은 다이어그램 중심으로 표현한다.
- 미디어플래너가 이해할 수 있는 업무 흐름 시각화를 우선한다.

### 16.3 제품별 컬러 후보

| 제품 | 컬러 방향 |
|---|---|
| Compass | Blue / Indigo |
| Sentinel | Green / Emerald |
| Lens | Purple / Violet |
| Foresight | Amber / Orange |
| Agent Core | Neutral / Deep Navy / Purple accent |

---

## 17. SEO / Metadata 초안

### 17.1 Page Title

```text
AdMate - AI Agent 기반 광고 운영 자동화 플랫폼
```

### 17.2 Meta Description

```text
AdMate는 광고 캠페인의 정책 확인, 세팅 검수, 실시간 모니터링, 캡처 자동화, 성과 예측을 하나의 AI Agent 운영 흐름으로 연결하는 광고 운영 자동화 플랫폼입니다.
```

### 17.3 Keywords

```text
AdMate, 광고 운영 자동화, AI Agent, 미디어플래닝, 캠페인 모니터링, 광고 정책 RAG, 광고 캡처 자동화, 성과 예측, 나스미디어
```

---

## 18. 구현 시 주의사항

1. Openclaw/Hermes를 외부 제품처럼 과도하게 강조하지 않는다.
2. Sentinel beta라는 표현은 줄이고 AdMate Sentinel로 통일한다.
3. Guide/Capture Pro/Planner 기존명은 내부 참조로만 사용한다.
4. 제품 기능과 현재 구현 상태를 과장하지 않는다.
5. 외부 공개 가능 여부를 확인하기 전까지 광고주/캠페인 실데이터는 사용하지 않는다.
6. 캡처 결과물 UI는 임의로 AdMate 테마화하지 않는다.
7. 홈페이지가 너무 추상적이지 않도록 실제 캠페인 운영 사이클을 중심으로 설명한다.
8. 임원과 미디어플래너 모두 이해할 수 있는 문장으로 작성한다.

---

## 19. 첫 화면 최종 추천안

```text
AdMate
AI Agent 기반 광고 운영 자동화 플랫폼

기획부터 운영, 검수, 캡처, 학습까지
광고 운영의 전 과정을 AI Agent가 연결합니다.

AdMate는 광고 캠페인의 정책 확인, 세팅 검수, 실시간 모니터링,
캡처 자동화, 성과 예측을 하나의 Agent 운영 흐름으로 연결해
반복 업무를 줄이고 캠페인 판단을 더 정확하게 만듭니다.

[AdMate 생태계 보기] [제품 구성 살펴보기]
```

---

## 20. 최종 요약

AdMate 홈페이지는 다음 한 문장을 중심으로 설계한다.

```text
기획부터 운영, 검수, 캡처, 학습까지
광고 운영의 전 과정을 AI Agent가 연결합니다.
```

제품 구조는 다음처럼 보여준다.

```text
Compass는 정책을 답한다.
Sentinel은 캠페인 사고를 막고 감지한다.
Lens는 캡처와 증빙을 만든다.
Foresight는 다음 성과를 예측한다.
Agent Core는 이 모든 흐름을 연결하고 학습한다.
```

이 홈페이지는 AdMate를 단순한 내부 도구가 아니라, 데이터분석팀이 구축하는 AI Agent 기반 광고 운영 자동화 플랫폼으로 인식시키는 첫 관문이 되어야 한다.
