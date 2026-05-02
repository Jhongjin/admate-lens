# AdMate Repo/Codex Integration Guide v1

작성일: 2026-05-01  
문서 상태: 초안 v1  
작성 목적: AdMate 전략 문서, 디자인 기준, Codex/Paperclip 작업 지침을 각 GitHub repo와 로컬 작업 폴더에 안전하게 반영하기 위한 운영 가이드. 본 문서는 Openclaw Monitor, AdMate Compass/Guide, AdMate Lens/Capture Pro, 향후 Sentinel/Foresight repo를 Codex Desktop 또는 개발 Agent와 연결할 때 기준으로 사용한다.

---

## 1. Executive Summary

AdMate는 단일 repo가 아니라 여러 제품 repo와 하나의 Agent Core로 구성되는 생태계다.

현재 또는 향후 연결 대상은 다음과 같다.

| AdMate 브랜드명 | 기존/개발 repo 성격 | 역할 |
|---|---|---|
| AdMate Agent Core | openclaw-monitor | Openclaw/Hermes 기반 실행, 학습, 알림, 운영 콘솔 |
| AdMate Compass | admate-guide 또는 admate-guide-codex | 광고 정책/가이드 RAG 챗봇 |
| AdMate Lens | admate-capture-pro | 광고 캡처/증빙 자동화 |
| AdMate Sentinel | openclaw-monitor + 향후 pre-launch validation 영역 | 사전 검수 + 실시간 모니터링 |
| AdMate Foresight | 향후 신규 repo 또는 existing planning PoC | 미디어 플래닝 예측/시뮬레이션 |

Codex나 Paperclip 같은 개발 Agent에게 작업을 맡길 때 가장 중요한 것은 다음이다.

```text
1. 각 repo가 AdMate 생태계의 어느 역할인지 먼저 이해시킨다.
2. 공통 브랜드/디자인/보안 원칙을 repo 내부 문서로 제공한다.
3. 기능 변경 범위와 금지 사항을 명확히 한다.
4. secret, API key, .env 파일을 절대 출력하거나 커밋하지 않도록 한다.
5. 작업 전 분석 보고, 작업 후 빌드/테스트/변경 파일/롤백 방법을 요구한다.
```

---

## 2. 이 문서의 사용 대상

이 문서는 다음 상황에서 사용한다.

- Codex Desktop에 AdMate 관련 repo를 추가할 때
- 로컬 PC에 GitHub repo를 clone하고 작업 환경을 구성할 때
- 전략 문서와 디자인 기준을 각 repo에 복사할 때
- Openclaw 테마를 다른 AdMate 제품 UI에 적용할 때
- Codex에게 작업 프롬프트를 줄 때
- 새 채팅/새 LLM/새 Agent에게 repo 맥락을 넘길 때
- 기능 수정 전 안전한 작업 절차를 정할 때

---

## 3. 권장 로컬 폴더 구조

Windows PC 기준 권장 구조:

```text
C:\Users\<USER>\projects\
├─ openclaw-monitor\
├─ admate-guide-codex\
├─ admate-capture-pro\
├─ admate-foresight\              # 향후 생성 가능
├─ admate-docs\                   # 공통 전략 문서 보관용
└─ admate-shared-assets\           # 디자인 기준/브랜드 자료/이미지 자료
```

repo별로 각각 Codex 프로젝트를 만들 수 있다.

권장 Codex 프로젝트명:

```text
Openclaw Sentinel
AdMate Compass
AdMate Lens
AdMate Foresight
AdMate Strategy Docs
```

여러 프로젝트를 동시에 운용해도 된다. 단, 한 Codex 작업창에서 여러 repo를 동시에 크게 수정하는 것은 피한다. repo별 작업 목적을 분리해야 변경 이력과 책임 범위가 명확해진다.

---

## 4. GitHub repo 연결 기본 절차

## 4.1 Git 설치 확인

PowerShell에서 확인:

```powershell
git --version
```

정상 예시:

```text
git version 2.54.0.windows.1
```

## 4.2 clone 기본 명령

```powershell
cd $HOME\projects
git clone https://github.com/Jhongjin/openclaw-monitor.git
```

repo 접근 권한이 필요한 private repo는 브라우저 인증이 필요할 수 있다.

## 4.3 clone 후 확인

```powershell
cd $HOME\projects\openclaw-monitor
git status --short --branch
git --no-pager log --oneline -5
```

정상 예시:

```text
## main...origin/main
ba386e2 Add Codex handoff document
0153394 Add Codex agent instructions
...
```

## 4.4 nested clone 주의

이미 repo 안에 들어가 있는 상태에서 같은 repo를 다시 clone하면 다음처럼 중첩 폴더가 생길 수 있다.

```text
/root/openclaw-monitor/openclaw-monitor
```

중첩 clone은 혼란을 만들기 때문에 제거한다.

```bash
rm -rf /root/openclaw-monitor/openclaw-monitor
```

Windows PowerShell에서는:

```powershell
Remove-Item -Recurse -Force .\openclaw-monitor\openclaw-monitor
```

---

## 5. Git 사용자 정보 설정

처음 commit할 때 다음 오류가 날 수 있다.

```text
Please tell me who you are.
Run
  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"
```

전역 설정:

```powershell
git config --global user.email "woolela@nasmedia.co.kr"
git config --global user.name "전홍진"
```

repo별로만 설정하려면 `--global`을 빼고 해당 repo 안에서 실행한다.

```powershell
git config user.email "woolela@nasmedia.co.kr"
git config user.name "전홍진"
```

---

## 6. 공통 문서 배치 원칙

AdMate 공통 전략 문서는 각 repo에 그대로 모두 복사할 필요는 없다.

권장 방식은 다음과 같다.

```text
공통 전략 문서 전체
→ admate-docs 또는 별도 docs package repo에 보관

각 제품 repo
→ 해당 repo에 꼭 필요한 요약 문서와 디자인/작업 지침만 배치
```

## 6.1 repo별 권장 문서 배치

### openclaw-monitor

```text
docs/strategy/
├─ AdMate_Unified_Agent_Architecture_v1_1.md
├─ AdMate_Product_Map_v1.md
├─ AdMate_Agent_Core_Operating_Model_v1.md
├─ AdMate_Unified_Data_Learning_Governance_v1.md
└─ AdMate_AI_Operations_Manual_v1.md

AGENTS.md
```

### admate-guide-codex / Compass

```text
docs/strategy/
├─ AdMate_Unified_Agent_Architecture_v1_1.md
├─ AdMate_Product_Map_v1.md
└─ AdMate_External_LLM_Handoff_Master_Document_v1.md

docs/design/
└─ openclaw-theme-reference.md

AGENTS.md 또는 CODEX.md
```

### admate-capture-pro / Lens

```text
docs/strategy/
├─ AdMate_Unified_Agent_Architecture_v1_1.md
├─ AdMate_Product_Map_v1.md
└─ AdMate_Media_Planner_Brief_v1.md

docs/design/
├─ openclaw-theme-reference.md
└─ 2026-04-27_admate-sentinel-design-guidelines.md  # 이미 존재할 경우 유지

AGENTS.md 또는 CODEX.md
```

### Foresight 향후 repo

```text
docs/strategy/
├─ AdMate_Unified_Agent_Architecture_v1_1.md
├─ AdMate_Product_Map_v1.md
├─ AdMate_Unified_Data_Learning_Governance_v1.md
└─ AdMate_Future_Strategy_Loop_v1.md

docs/design/
└─ openclaw-theme-reference.md
```

---

## 7. Openclaw Theme Reference 배치

AdMate 제품군의 UI/UX 톤을 맞추기 위해 각 repo에 다음 문서를 둔다.

```text
docs/design/openclaw-theme-reference.md
```

이 문서의 목적:

```text
AdMate 계열 프로젝트의 UI/UX를 Openclaw Monitor / Sentinel 운영 콘솔 테마와 맞추기 위한 디자인 기준
```

적용 대상:

- 관리자 화면
- 운영 콘솔
- 입력 폼
- 목록
- 카드
- 테이블
- 설정 화면
- 리포트 관리 화면

주의:

```text
기능 변경 금지
API/데이터 구조 변경 금지
라우팅 변경 금지
이벤트 핸들러 변경 최소화
기존 기능 제거 금지
캡처 결과물/광고 미리보기/외부 플랫폼 픽셀 매칭 UI 임의 변경 금지
```

특히 Lens/Capture Pro에서는 캡처 결과물 자체를 AdMate 테마로 바꾸면 안 된다. 실제 플랫폼 화면과의 일치가 중요하기 때문이다.

---

## 8. AGENTS.md / CODEX.md 작성 기준

각 repo에는 Codex가 먼저 읽을 작업 지침 문서가 있어야 한다.

권장 파일명:

```text
AGENTS.md
```

또는 Codex 전용으로:

```text
CODEX.md
```

## 8.1 AGENTS.md 기본 구조

```text
# AGENTS.md

## 1. Project Identity

이 repo는 AdMate 생태계의 일부다.
제품 역할:
- Compass / Sentinel / Lens / Foresight / Agent Core 중 어디에 해당하는지 명시

## 2. Required Reading

작업 전 반드시 읽을 문서:
- README.md
- docs/strategy/...
- docs/design/openclaw-theme-reference.md

## 3. Non-negotiable Rules

- .env/API key/token 출력 금지
- 기능 변경 범위 준수
- API/DB schema 임의 변경 금지
- commit/push는 승인 전 금지
- build/test 결과 보고

## 4. Design Rules

- Openclaw theme reference 준수
- 캡처 결과물 UI는 임의 변경 금지
- 한국어 운영 문구 우선

## 5. Workflow

1. 구조 분석
2. 수정 후보 파일 보고
3. 위험 요소 보고
4. 작업 계획 보고
5. 승인 후 수정
6. build/test
7. 변경 요약 및 rollback 안내
```

---

## 9. Codex 프로젝트 설정 권장값

Codex Desktop 프로젝트를 만들 때 권장 설정:

| 항목 | 권장값 |
|---|---|
| Project Name | 제품명 기준. 예: AdMate Lens |
| Folder | 해당 repo root |
| Model | 고성능 reasoning 모델 우선 |
| Sandbox | 기본 권한 또는 repo 파일 수정 가능 권한 |
| Internet | 필요 시 제한적으로 사용 |
| Auto-run commands | 신뢰 전까지 비활성 또는 확인 후 실행 |
| Context docs | AGENTS.md, README.md, docs/strategy, docs/design 우선 |

Codex가 처음 repo를 열면 다음을 시킨다.

```text
먼저 AGENTS.md, README.md, docs/strategy, docs/design/openclaw-theme-reference.md를 읽고,
이 repo의 역할과 현재 구조를 요약해줘.
아직 파일 수정은 하지 마.
```

---

## 10. Codex 기본 프롬프트 템플릿

## 10.1 repo 분석 전용 프롬프트

```text
너는 AdMate 생태계 개발 Agent다.

이 repo는 AdMate 제품군 중 [Compass/Sentinel/Lens/Foresight/Agent Core]에 해당한다.
먼저 다음 문서를 읽어라.

1. AGENTS.md
2. README.md
3. docs/strategy/*
4. docs/design/openclaw-theme-reference.md

아직 코드를 수정하지 말고 다음만 보고해라.

1. 이 repo의 목적
2. 현재 기술 스택
3. 주요 디렉토리 구조
4. AdMate 생태계에서의 역할
5. 수정 시 주의해야 할 파일
6. build/test 방법
7. 잠재 위험 요소
```

## 10.2 디자인 테마 적용 프롬프트

```text
이 repo의 기능은 변경하지 말고, 관리자/운영자 화면의 UI/UX 톤만 AdMate/Openclaw 테마에 맞춰 정리해줘.

반드시 지킬 것:
- 비즈니스 로직 변경 금지
- API 호출 변경 금지
- DB schema 변경 금지
- 라우팅 변경 금지
- 기존 기능 제거 금지
- 이벤트 핸들러 변경 최소화
- 캡처 결과물/광고 미리보기 UI는 임의 변경 금지
- docs/design/openclaw-theme-reference.md 준수

먼저 수정 후보 파일과 작업 계획을 보고하고, 승인 후 수정해줘.
```

## 10.3 기능 개발 프롬프트

```text
작업 목표:
[구체적 기능]

배경:
이 작업은 AdMate [제품명]의 [목적]을 위한 것이다.

제약 조건:
- .env/API key/token 출력 금지
- 기존 API/DB schema 변경이 필요하면 먼저 보고
- UI 문구는 한국어 운영 문구 우선
- 모든 변경 후 build/test 실행
- commit/push는 승인 전 금지

먼저 다음을 보고해줘.
1. 현재 관련 코드 구조
2. 수정할 파일 목록
3. 예상 위험 요소
4. 구현 계획
5. 테스트 계획
```

## 10.4 작업 마무리 프롬프트

```text
작업 결과를 정리해줘.

포함할 것:
1. 변경 파일 목록
2. 변경 내용 요약
3. build/test 결과
4. UI 확인 필요 사항
5. 남은 이슈
6. rollback 방법
7. 추천 commit message

아직 commit/push는 하지 마.
```

---

## 11. repo별 작업 지침

## 11.1 openclaw-monitor / Agent Core & Sentinel

역할:

```text
AdMate Agent Core의 중심 repo.
Openclaw/Hermes 기반 실행, 학습, 알림, 운영 콘솔, Sentinel Live Monitoring 기능을 담당한다.
```

주의:

- Supabase service role key 노출 금지
- .env.local 커밋 금지
- Slack token 노출 금지
- n8n credential 값 노출 금지
- operator_actions / audit_logs / alert_events / alert_deliveries 구조 임의 변경 주의
- Hermes 학습 권한 로직 변경 시 매우 신중해야 함
- 사용자 권한 변경은 Super Admin 기준 유지

Codex에게 먼저 시킬 것:

```text
AGENTS.md와 docs/tasks, docs/strategy 문서를 읽고 현재 Openclaw/Hermes/Sentinel 구조를 요약해줘.
특히 operator_actions, alert_events, Hermes learning authority, /users, /settings, /logs, /insights 구조를 파악해줘.
아직 수정하지 마.
```

## 11.2 admate-guide-codex / Compass

역할:

```text
AdMate Compass의 repo.
광고 플랫폼 정책/가이드 RAG, 크롤링, 검색, 답변 UI를 담당한다.
```

주의:

- 원본 repo를 훼손하지 않기 위해 codex용 복사 repo 사용 가능
- RAG 로직, embedding dimension, vector storage 로직 변경 시 build/runtime 영향 확인
- 정책 답변 정확도와 근거 제공률이 중요
- UI 테마 적용 시 RAG 기능을 건드리지 말 것
- Vercel build 시 Supabase env 없으면 API route에서 build 실패 가능성 있음

Codex에게 먼저 시킬 것:

```text
이 repo는 AdMate Compass, 즉 정책/가이드 RAG 챗봇이다.
README와 docs/design/openclaw-theme-reference.md를 읽고,
기능은 건드리지 않고 UI/UX를 AdMate/Openclaw 테마에 맞출 수 있는 범위를 분석해줘.
```

## 11.3 admate-capture-pro / Lens

역할:

```text
AdMate Lens의 repo.
광고 게재 화면과 보고서 증빙 캡처/렌더링 자동화를 담당한다.
```

주의:

- 캡처 결과물 자체는 실제 매체 UI와 픽셀 매칭이 중요하므로 임의 변경 금지
- 관리자/입력/목록/작업 이력 UI만 AdMate 테마 적용 대상
- YouTube/GDN/모바일 인피드 등 광고 미리보기 컴포넌트는 매우 조심
- 기존 기능, 폼 필드, 렌더링 결과, SVG asset 변경 주의

Codex에게 먼저 시킬 것:

```text
이 repo는 AdMate Lens, 즉 광고 캡처/증빙 자동화 제품이다.
기능과 캡처 결과물은 변경하지 말고,
관리자/운영자 화면의 UI/UX만 AdMate/Openclaw 테마에 맞출 수 있는 범위를 분석해줘.
수정 전 후보 파일과 위험 요소를 먼저 보고해줘.
```

## 11.4 Foresight 향후 repo

역할:

```text
AdMate Foresight.
Meta 중심 과거 광고 데이터 기반 성과 예측과 미디어 플래닝 시뮬레이션을 담당한다.
```

주의:

- 최근 최대 6개월 데이터 우선 원칙
- 마크업/Net/Gross 기준 명확화 전 benchmark importer 적용 보류
- raw campaign-level 데이터 LLM 직접 전달 금지
- 업종/목표 태깅 기준 필요
- 예측값과 실제값 비교 구조 필요

---

## 12. build/test 확인 기준

repo마다 build 명령이 다를 수 있으므로 README와 package.json을 확인한다.

일반 Next.js repo:

```powershell
npm install
npm run build
```

npm이 없으면 Node.js 설치가 필요하다.

확인 명령:

```powershell
node --version
npm --version
```

빌드 후 Codex에게 요구할 보고:

```text
- build 성공/실패 여부
- 실패 시 에러 로그 핵심 부분
- 타입 에러 여부
- lint 에러 여부
- 변경과 관련된 페이지/API route 영향
```

---

## 13. commit/push 운영 원칙

## 13.1 작업 전

```powershell
git status --short --branch
git --no-pager log --oneline -5
```

작업 전 working tree가 clean인지 확인한다.

## 13.2 작업 후

```powershell
git status --short
git diff --stat
git diff -- <file>
```

## 13.3 commit 전 체크

- 변경 파일이 의도한 범위인지 확인
- .env, token, credential이 포함되지 않았는지 확인
- build/test 결과 확인
- 불필요한 nested clone, 임시 파일 제거
- docs만 수정한 경우에도 파일명/경로 확인

## 13.4 commit 메시지

권장 스타일:

```text
Add AdMate strategy docs
Polish AdMate Lens admin theme
Add Codex handoff guide
Document AdMate Agent Core model
Fix Sentinel user management sidebar link
```

## 13.5 push

```powershell
git push origin main
```

단, Codex가 자동으로 push하지 않도록 한다. 사용자가 명시 승인한 뒤 push한다.

---

## 14. secret / .env 관리 원칙

절대 커밋 금지:

```text
.env
.env.local
.env.production
.env*.local
```

절대 출력 금지:

```text
SUPABASE_SERVICE_ROLE_KEY
OPENCLAW_INGEST_KEY
Slack bot token
Meta access token
Google API key
SMTP password
LLM provider API key
n8n credentials
```

Codex에게 반드시 전달할 문구:

```text
.env, API key, token, credential 값은 절대 출력하지 말고,
필요하면 변수명만 언급해라.
```

---

## 15. 디자인 통합 우선순위

AdMate 제품군 UI/UX 통합은 한 번에 전체를 바꾸지 않는다.

권장 순서:

```text
1. 공통 디자인 기준 문서 배치
2. Header/Sidebar/레이아웃 톤 정리
3. 카드/버튼/입력폼/테이블 스타일 정리
4. 한국어 운영 문구 정리
5. Dashboard/관리자 페이지 정리
6. 제품별 고유 기능 화면 정리
7. 실제 결과물/렌더링 영역은 기능 검증 후 매우 신중히 조정
```

Lens/Capture Pro에서는 특히 다음을 구분한다.

```text
운영자 UI
= AdMate 테마 적용 가능

광고 캡처 결과물 UI
= 실제 매체 화면과 일치해야 하므로 임의 변경 금지
```

---

## 16. 문서 sync 운영 방식

전략 문서가 업데이트되면 모든 repo에 수동 복사하면 버전 불일치가 생길 수 있다.

권장 방식:

```text
1. admate-docs 또는 중앙 문서 패키지에 원본 보관
2. 각 repo에는 필요한 요약본만 복사
3. 문서 상단에 버전과 작성일 명시
4. 주요 변경 시 changelog 기록
5. Codex에게 어떤 문서가 source of truth인지 알려주기
```

source of truth 우선순위:

```text
1. AdMate Unified Agent Architecture
2. AdMate Product Map
3. AdMate Agent Core Operating Model
4. 각 repo의 AGENTS.md
5. 각 repo README
```

repo 내부 문서와 상위 전략 문서가 충돌하면 상위 전략 문서를 우선하고, 실제 코드/운영 상태는 repo README와 최신 commit을 확인한다.

---

## 17. Codex 컨텍스트 소모 대응

Codex 작업창의 컨텍스트가 80~85% 이상 사용되면 새 작업창으로 넘길 준비를 한다.

Codex에게 요청할 요약:

```text
현재 작업을 새 Codex 작업창에서 이어갈 수 있도록 handoff를 작성해줘.

포함할 것:
1. 현재 repo와 branch
2. 최근 commit
3. 작업 목표
4. 읽은 문서
5. 수정한 파일
6. 아직 수정하지 않은 파일
7. build/test 결과
8. 남은 이슈
9. 다음 작업 순서
10. 주의해야 할 제약 조건
```

새 Codex 작업창 첫 프롬프트:

```text
아래 handoff를 읽고 현재 상태를 요약해줘.
아직 파일 수정은 하지 말고, 이어서 해야 할 작업 계획만 제안해줘.
```

---

## 18. Repo/Codex 통합 체크리스트

각 repo를 Codex와 연결하기 전에 다음을 확인한다.

```text
[ ] Git clone 완료
[ ] git status clean
[ ] README 확인
[ ] package.json 확인
[ ] build 명령 확인
[ ] docs/strategy 폴더 생성
[ ] docs/design/openclaw-theme-reference.md 배치
[ ] AGENTS.md 또는 CODEX.md 작성
[ ] .gitignore 확인
[ ] .env 파일 미추적 확인
[ ] Codex 프로젝트 폴더 연결
[ ] Codex에게 분석 전용 프롬프트 실행
[ ] 수정 전 작업 계획 보고 받기
```

---

## 19. 최종 요약

AdMate repo/Codex 통합의 핵심은 다음이다.

```text
각 repo가 AdMate 생태계에서 어떤 역할인지 명확히 한다.
공통 전략 문서와 디자인 기준을 repo 안에 제공한다.
Codex에게 먼저 읽고 분석하게 한 뒤 수정하게 한다.
기능 변경, 데이터 구조 변경, secret 노출을 엄격히 통제한다.
작업 후 build/test/변경 파일/rollback을 반드시 보고하게 한다.
```

AdMate는 여러 repo와 Agent가 함께 움직이는 생태계다.

따라서 repo별 자율 작업보다 중요한 것은 공통 방향성, 문서 기준, 보안 원칙, 작업 이력 관리다.

이 가이드를 기준으로 Codex/Paperclip 작업을 운영하면, 여러 제품 repo를 동시에 발전시키면서도 AdMate 전체 세계관과 품질을 유지할 수 있다.
