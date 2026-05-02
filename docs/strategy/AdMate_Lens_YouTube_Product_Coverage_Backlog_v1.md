# AdMate Lens YouTube Product Coverage Backlog v1

작성일: 2026-05-02

목적: AdMate Lens의 YouTube 및 Demand Gen 캡처 상품 범위를 현재 구현 상태와 향후 작업 순서 기준으로 정리한다.

---

## 1. 기본 원칙

AdMate Lens의 캡처 결과물은 실제 매체 화면과의 픽셀 매칭이 중요하므로, 상품 추가 또는 공개화 작업은 다음 원칙을 따른다.

- 기존 캡처 결과물 UI를 임의로 브랜드 테마화하지 않는다.
- 운영자 입력 폼, 상품 선택, 작업 목록, 상태 라벨은 AdMate Lens 운영 문구 기준으로 정리할 수 있다.
- 상품 공개 여부는 `공개 구현`, `내부 구현`, `레거시`, `신규 구현`, `제외`로 구분한다.
- 코드에 구현 흔적이 있어도 공개 폼/API에서 막혀 있으면 운영 상품으로 보지 않는다.
- 신규 상품은 먼저 지원 지면과 캡처 결과물 형태를 고정한 뒤 구현한다.

---

## 2. 현재 공개 구현 상품

| 상품군 | 상세 상품 | 상태 | 비고 |
|---|---|---|---|
| In-stream / Bumper | PC 인스트림 Skip | 공개 구현 | Skip 버튼은 5초 이후 노출 기준 |
| In-stream / Bumper | PC 인스트림 Non-skip | 공개 구현 | Skip 버튼 미노출 |
| In-stream / Bumper | PC 범퍼 6초 | 공개 구현 | Non-skippable |
| In-stream / Bumper | AOS 인스트림 Skip | 공개 구현 | 모바일 Android 뷰포트 |
| In-stream / Bumper | AOS 인스트림 Non-skip | 공개 구현 | 모바일 Android 뷰포트 |
| In-stream / Bumper | AOS 범퍼 6초 | 공개 구현 | 모바일 Android 뷰포트 |
| In-stream / Bumper | iOS 인스트림 Skip | 공개 구현 | iPhone 뷰포트 |
| In-stream / Bumper | iOS 인스트림 Non-skip | 공개 구현 | iPhone 뷰포트 |
| In-stream / Bumper | iOS 범퍼 6초 | 공개 구현 | iPhone 뷰포트 |
| Shorts | Shorts 피드 | 공개 구현 | 모바일 9:16 합성 렌더링 |
| Masthead | Masthead 홈 | 공개 구현 | YouTube 홈 상단 예약형 지면 |
| In-feed | 모바일 홈 | 공개 구현 | 모바일 홈 피드 합성 렌더링 |
| In-feed | 검색 결과 | 공개 구현 | 검색 결과 목록 내 광고 카드 |
| In-feed | 관련동영상 | 공개 구현 | Watch page 우측 추천 영역 |

---

## 3. PC 홈 In-feed 정의와 처리 방향

PC 홈 In-feed는 YouTube 데스크톱 홈 화면의 추천 영상 그리드 사이에 일반 영상 카드처럼 섞여 노출되는 네이티브 광고 카드다.

현재 상태:

- `infeed-home` 타입과 데스크톱 홈 피드 렌더링 흐름은 코드에 존재한다.
- 2026-05-03 기준 공개 폼/API/작업 목록에서 PC 홈 In-feed를 공개 상품으로 사용할 수 있다.
- 실제 프로덕션 캡처 QA에서 YouTube PC 홈 그리드 내 네이티브 광고 카드 형태로 정상 생성됨을 확인했다.

작업 방향:

1. 실제 YouTube PC 홈 네이티브 카드 기준의 추가 레퍼런스가 확보되면 spacing/thumbnail/card copy를 미세 조정한다.
2. 현재 공개 상태와 README/작업 목록 문구가 어긋나지 않도록 유지한다.

---

## 4. YouTube Display / Overlay 처리 방향

YouTube Display와 Overlay는 현재 레거시 타입으로 분리한다.

처리 방향:

- 당장 공개 상품으로 복구하지 않는다.
- 기존 레거시 함수를 그대로 노출하지 않는다.
- 운영 필요성이 생기면 최신 YouTube 화면 기준으로 별도 재구현 작업을 만든다.

상태:

| 타입 | 상태 | 처리 |
|---|---|---|
| display | 레거시 | 공개 생성 금지 유지 |
| overlay | 레거시 | 공개 생성 금지 유지 |

---

## 5. Demand Gen 1차 범위

Demand Gen 1차 구현은 YouTube 지면과 Google Ads 상품 흐름을 함께 포함한다.

1차 포함 범위:

| 범위 | 상세 | 상태 |
|---|---|---|
| Google Ads 상품 선택 | 운영자 폼에서 Demand Gen을 선택 가능한 상품으로 정리 | 공개 구현 |
| YouTube Feed | Demand Gen의 YouTube Feed 노출 증빙 | 공개 구현, QA 완료 |
| YouTube Shorts | Demand Gen의 YouTube Shorts 노출 증빙 | 공개 구현, QA 완료 |
| 작업 목록/메타데이터 | Demand Gen 결과임을 작업 이력에서 식별 | 공개 구현, QA 완료 |

1차 제외 범위:

| 범위 | 이유 |
|---|---|
| Gmail | 지면 UI와 증빙 기준 별도 정의 필요 |
| Discover | 지면 UI와 증빙 기준 별도 정의 필요 |
| Display/Overlay 레거시 | 최신 YouTube UI 기준 재검증 필요 |
| TV/CTV/Masthead 확장 | 현재 운영상 필요 없음 |

구현 원칙:

- Demand Gen은 Google Ads 상품 흐름에 포함하되, 1차 캡처 결과물은 YouTube Feed와 YouTube Shorts 중심으로 만든다.
- 기존 YouTube Feed/Shorts 렌더러를 재사용할 수 있는지 먼저 확인한다.
- 결과 메타데이터에는 일반 YouTube 상품과 Demand Gen 경유 상품을 구분할 수 있는 필드를 둔다.
- DB schema 변경 없이 metadata 내부 확장으로 처리하는 것을 우선 검토한다.

---

## 6. Masthead 확장 처리 방향

현재는 `masthead-home`만 유지한다.

제외:

- TV Masthead
- CTV Masthead
- 기타 TV/거실형 캡처

사유: 현재 운영상 TV/CTV 캡처 필요성이 없다.

---

## 7. 권장 진행 순서

1. 인스트림 Skip UI 미세조정과 노란 진행바 100% 동기화는 완료 상태를 유지한다.
2. PC 홈 In-feed 공개 상품 상태와 실제 캡처 결과를 주기적으로 QA한다.
3. Demand Gen 1차는 Google Ads 상품 흐름에서 YouTube Feed/Shorts 결과를 생성하는 범위로 유지한다.
4. 작업 이력과 결과 메타데이터에서 일반 YouTube 상품과 Demand Gen 상품 구분을 유지한다.
5. Display/Overlay는 레거시 상태를 유지하고, 필요 시 별도 최신 재구현 작업으로 분리한다.

---

## 8. 주요 수정 후보 파일

| 목적 | 후보 파일 |
|---|---|
| 상품 타입 정의 | `src/lib/capture/youtube-ad-types.ts` |
| 입력 폼 상품/상세 옵션 | `src/app/components/CaptureForm.tsx` |
| 작업 목록 라벨 | `src/app/components/CaptureList.tsx` |
| 캡처 생성 API 검증 | `src/app/api/captures/route.ts` |
| 캡처 실행 분기 | `src/app/api/captures/execute/route.ts` |
| YouTube 캡처 오케스트레이터 | `src/lib/capture/channels/youtube-capture.ts` |
| YouTube 인피드 렌더러 | `src/lib/capture/channels/youtube-infeed-inpage.ts` |
| YouTube Shorts 합성 렌더러 | `src/lib/capture/channels/youtube-shorts-synthetic.ts` |
| README 지원 상품 설명 | `README.md` |

---

## 9. 위험 요소

- PC 홈 In-feed는 코드 구현과 공개 운영 상태가 다르므로 QA 없이 공개하면 실제 YouTube 홈 화면과 차이가 날 수 있다.
- Demand Gen은 Google Ads 상품이지만 1차 결과물은 YouTube 지면 중심이므로, 일반 YouTube 상품과 운영 문구를 명확히 구분해야 한다.
- Display/Overlay는 레거시 함수를 단순 재노출하면 최신 YouTube 화면과 맞지 않을 수 있다.
- DB schema 변경은 피하고 metadata 확장으로 우선 처리해야 한다.
- 캡처 결과물 UI 변경은 반드시 실제 매체 화면 기준 비교 후 진행해야 한다.
