# AdMate Lens Kakao Mobile Product Coverage v1

작성일: 2026-05-03

## 목적

Kakao 모바일 캡처 지면을 `비즈보드`와 `모바일 피드` 수준으로만 묶지 않고, 카카오모먼트 성과형 광고 상품 구조에 맞춰 작업 목록과 metadata surface를 분리한다.

## 공식 문서 기준 상품 분류

참조 문서:

- 카카오모먼트 성과형 광고: `https://kakaobusiness.gitbook.io/main/ad/moment/performance`
- 카카오 비즈보드 (MO): `https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard`
- 디스플레이 광고 (MO/PC): `https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad`
- 상품 카탈로그 (MO/PC): `https://kakaobusiness.gitbook.io/main/ad/moment/performance/catalog`
- 동영상 광고 (MO/PC): `https://kakaobusiness.gitbook.io/main/ad/moment/performance/videoad`

카카오모먼트의 대표 성과형 광고 상품은 카카오 비즈보드, 디스플레이 광고, 상품 카탈로그, 동영상 광고로 정리한다. 디스플레이 광고는 이미지 네이티브, 이미지 카탈로그, 동영상 네이티브 소재 유형을 지원한다.

## 1차 구현 범위

정적 이미지 기반 모바일 증빙이 가능한 지면부터 우선 구현한다.

| Lens surface | 운영 상품명 | 구현 상태 | 비고 |
|---|---|---|---|
| `kakao-bizboard` | 카카오 비즈보드 | 기존+유지 | 카카오톡 채팅 탭 상단형 |
| `kakao-display-native` | 디스플레이 광고 - 이미지 네이티브 | 1차 구현 | 레거시 `kakao-mobile-feed` 호환 |
| `kakao-display-catalog` | 디스플레이 광고 - 이미지 카탈로그 | 1차 구현 | 카탈로그 카드 rail 합성 |
| `kakao-product-catalog` | 상품 카탈로그 | 1차 구현 | 상품 추천 카드 rail 합성 |

## 후속 구현 후보

| 상품군 | 우선순위 | 메모 |
|---|---:|---|
| 디스플레이 광고 - 동영상 네이티브 | 2 | 영상 썸네일/재생 UI와 동영상 소재 입력 설계 필요 |
| 동영상 광고 | 2 | 카카오 프리미엄 콘텐츠 영역/재생 UI 레퍼런스 필요 |
| 카카오톡 채널 메시지 | 3 | 메시지형 증빙 수요와 개인정보/대화 UI 표현 범위 확인 필요 |
| 비즈보드 세부 소재 유형 | 3 | 오브젝트형, 썸네일형, 마스킹형, 텍스트형을 별도 surface로 확장 가능 |

## 작업 원칙

- 캡처 결과물은 Kakao 네이티브 UI 매칭이 목적이므로 AdMate 운영자 테마를 적용하지 않는다.
- 레거시 `kakao-mobile-feed` 요청은 `kakao-display-native`로 정규화한다.
- 상품 카탈로그 계열은 실제 상품명/가격 입력 스키마가 생기기 전까지 소재 이미지 기반 synthetic rail로 제공한다.
- 실제 Kakao/Daum 게재 화면 레퍼런스가 확보되면 지면별 위치, 간격, CTA, 하단 탭 표현을 다시 QA한다.
