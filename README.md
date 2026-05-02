# AdMate Lens

**광고 게재 화면과 보고서 증빙을 자동 생성하는 캡처 자동화 솔루션**

AdMate Lens는 다양한 매체(YouTube, Google Ads/GDN, Naver, Kakao 등)에서 광고가 게재된 화면을 **서버리스(Vercel) 환경**에서 초고해상도로 캡처, 합성, 렌더링해주는 자동화 시스템입니다. 퍼페티어(Puppeteer) 엔진을 기반으로, 봇 탐지 우회 및 극사실주의적인 네이티브 앱/웹 UI 합성을 통해 고객사에게 제출하는 **고품질 게재 보고서용 이미지**를 생성합니다.

---

## 🎯 주요 기능 및 지원 매체

### 1. YouTube (유튜브)
- **인스트림(Instream / Preroll)**:
  - 데스크톱 및 모바일 UI 대응
  - YouTube 봇 탐지 우회 (Oembed 및 HTML Player 덮어쓰기 기법 적용)
  - 광고 건너뛰기, 진행바, 영상 타이틀, CTA 오버레이 자동 합성
- **인피드 홈 (In-feed Home)**:
  - **[Desktop]** 4열 롱폼 네이티브 그리드 합성: 유튜브 홈 피드의 썸네일, 제목, 채널명, 모서리 라운딩, 아이콘 (가로 3점 메뉴 `...`) 등을 픽셀 퍼펙트로 렌더링
  - 빈 화면 방지 알고리즘 (백그라운드 스크래핑 및 트렌딩 풀 랜덤 셔플 적용)
  - **[Mobile]** 모바일 네이티브 앱 UI 인피드 광고 영역 정밀 렌더링 (합성 컴포넌트 기반)
- **Demand Gen 1차**:
  - Google Ads 상품 흐름에서 YouTube Feed와 YouTube Shorts 증빙 화면 우선 지원
  - Gmail/Discover 및 TV/CTV 확장은 현재 범위에서 제외

### 2. Google Display Network (GDN)
- **반응형 디스플레이 광고**:
  - 지정 파블리셔(뉴스 사이트, 커뮤니티 등) URL에서의 광고 슬롯 자동 탐지
  - 지면 내 광고 삽입(Inject) 및 동적 리사이징 (PC 해상도 2배수 상향 지원)
  - 데스크톱 및 모바일 프레임 지원

### 3. Naver / Kakao 모바일 지면
- **Naver 모바일 피드**:
  - 모바일 네이티브 피드형 광고 증빙 화면 합성
  - 소재, 광고주명, CTA, 설명 문구, 모바일 상태바/피드 컨텍스트 렌더링
- **Kakao 모바일 광고**:
  - Kakao Bizboard 1차 지면 지원
  - Kakao/Daum 모바일 네이티브 피드형 광고 지원

### 4. 고품질 렌더링 파이프라인
- **해상도 상향 (DPR)**: 기본 2배수(Retina 4K급) 초고화질 스크린샷 추출
- **이미지 병합 (Frame Composite)**: 모바일 뷰 캡처 시, Sharp의 `Lanczos3` 알고리즘을 사용한 계단현상 방지 고품질 단말기 프레임 병합 기능 포함
- **썸네일 퀄리티 업**: `maxresdefault.jpg` 1080p 해상도 최우선 확보 및 실패 시 `hq720.webp` 지능적 폴백

---

## 🛠 아키텍처 및 기술 스택

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router 기반 풀스택 구조)
- **Backend/Database**: [Supabase](https://supabase.com/) (사용자 인증, 프로젝트 DB, Storage 객체 저장소)
- **Headless Browser**: [Puppeteer Core](https://pptr.dev/) + [@sparticuz/chromium](https://github.com/Sparticuz/chromium) (Vercel 서버리스 호환)
- **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/) (Node.js 고성능 이미지 프로세싱)
- **Deployment**: [Vercel](https://vercel.com/) (Serverless Functions)

### 시스템 구조 철학
- **독립적 브랜치 구조**: `youtube-capture.ts`, `gdn-capture.ts`, `mobile-native-capture.ts` 등 매체별로 독립된 Orchestrator가 존재합니다. 매체 내에서도 광고 상품별(Preroll, Infeed, Mobile Native), 디바이스별(Mobile, Desktop) 분기 처리가 명확하여 신규 플랫폼이나 레이아웃 추가 시 기존 코드에 부작용(Side-effect)이 미치지 않습니다.
- **안티-봇 렌더링 (Stealth/Fallback)**: 퍼페티어가 차단되는 플랫폼(예: YouTube)의 경우, HTML DOM 스크래핑을 통한 자체 UI 렌더링(Synthetic View)으로 실패 없는 시스템 구축.

---

## 🚀 빠른 시작 가이드 (Getting Started)

### 1. 사전 요구사항 (Prerequisites)
- [Node.js](https://nodejs.org/) v18.17 이상
- [Supabase](https://supabase.com/) 프로젝트 주소 및 API Key 설정
- (선택) YouTube Data API v3 Key (유기적 콘텐츠 데이터 확보용)

### 2. 패키지 설치 (Installation)
```bash
# 레포지토리 클론 후 이동
npm install
```

### 3. 환경 변수 설정 (Environment Setup)
루트 디렉토리에 `.env.local` 파일을 생성하고 아래 변수를 구성합니다.
```ini
# Supabase 연결
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Vercel 환경 체크 (로컬에선 true)
IS_LOCAL="true"

# 화질 및 렌더링 설정
YOUTUBE_CAPTURE_DEVICE_SCALE_FACTOR="2" # DPR (해상도) 설정
YOUTUBE_INFEED_SYNTHETIC_SHUFFLE="true"

# (선택 사항) YouTube API 및 프록시
YOUTUBE_DATA_API_KEY="your-youtube-api-key"
PROXY_HOST=""
PROXY_PORT=""
```

### 4. 실행 (Running)
```bash
# 로컬 개발 서버 시작 (http://localhost:3000)
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

---

## 📝 주요 히스토리 (Changelog)

- **2024.x**: 기본 GDN 및 유튜브 인스트림/브라우즈 캡처 기능 초기 세팅
- **2026.04.09**: 유튜브 봇 차단(Sign-in wall) 우회용 Oembed 기반 Synthetic 영상 교체기 도입
- **2026.04.22**: 유튜브 데스크톱 인피드 홈 4열 롱폼 네이티브 그리드 구현 완료 및 썸네일 랜덤 셔플 패치
- **2026.04.22**: 렌더링 화질 극대화 (DPR 2배수 상향, `maxresdefault` 최고화질 우선순위, `Lanczos3` 합성)
- **2026.04.24**: 유튜브 모바일 앱 네이티브 인피드 홈 렌더링(Synthetic) 파이프라인 구현 완료 및 UI 픽셀 매칭 최적화
- **2026.05.03**: YouTube 인스트림 Skip 버튼/노란 진행바 노출 타이밍 보정, YouTube 선택 시 GDN 파블리셔 혼입 방지
- **2026.05.03**: Demand Gen 1차 범위(YouTube Feed, YouTube Shorts, Google Ads 상품 흐름) 정리 및 Naver/Kakao 모바일 캡처 지면 1차 구현
- **2026.05.03**: Vercel 서버리스 Chromium 추출 경합 안정화 및 Naver/Kakao 모바일 합성 지면 한글/아이콘 렌더링 보강

---

*본 프로젝트는 Vercel 환경의 Serverless Function Limit (Max Execution Time, Memory) 내에서 최적의 속도와 극상의 품질을 갖는 캡처 엔진 구축을 목표로 합니다.*
