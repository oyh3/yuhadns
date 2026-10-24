# Yuhadns (Cloudflare Workers DoH Proxy)
![Static Badge](https://img.shields.io/badge/Antigravity-google?style=for-the-badge&logo=data%3Aimage%2Fjpeg%3Bbase64%2C%2F9j%2F4AAQSkZJRgABAQAAAQABAAD%2F2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys%2FRD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N%2F%2FAABEIAEAAQAMBEQACEQEDEQH%2FxAAbAAEAAgMBAQAAAAAAAAAAAAAABQcCBAYDAf%2FEADEQAAEEAgADBQQLAAAAAAAAAAEAAgMEBREGITESQVFxoRMUYbEHIiMzUmJygZHB4f%2FEABoBAQADAQEBAAAAAAAAAAAAAAACAwUEAQb%2FxAAqEQACAgIBAgQFBQAAAAAAAAAAAQIDBBESBUETITFRFCOBsfEyYXGR0f%2FaAAwDAQACEQMRAD8AvFAEAQBAEAQBAEAQBAEBo5HK1McB7w89o9GtGyue7Kqp8pvzLaqZ2vUTDF5ujlC5tWXcjesbhp2vHXgp1XQtW4snfi20a5ryJFWnOEAQBAEB52ZWwQSTPOmxtLj5BeN6R42ktsq7J5F9qeSWR23POys%2BOFK6TnL1ZCnN4sj6l6WhehuQH7SJ29eI7x%2B4V3wsqZKSPo6ciGTU659y4K0zLFeOeM7ZI0PafEEbC6zBacXpnqh4EAQBAc5xxd91w3sw7Tp3hg8hzPy9VbVV4stHHm2cKte5WcspcVv0YiSMfxHsxbzXt2GmjTxcxwZZ%2FAtv3jAxxk%2FWrvMZ8uo9CsHIq8KejTlYrHyR0SoIhAEAQFa%2FSJkPb5ZlSM7bWZzA%2FE7n8tLe6XR8vm%2B5idRs5WqK7E%2Fw3wjUq1GS5OtHYsyDbmyt7TY%2Fho8t%2FFcmV1Gyc%2BNT1Fe3c7MfChGO7FtnziXhOpPUfPjK7ILMY2GRN02QeGum17h9QsjPja9xfv2JX4kXHcFpoiPo8viLIS1HHQsM7Tf1N%2Fzf8Lq6rR8tWLsVYV25cWWGsE0ggCAjOIMvDhse%2BzLpz%2BkUe%2Bb3eC6MbHlkWKEfr%2FBRkXxphyf0OO4Nws%2BTyBzWRBMYkMjO0PvX9d%2BQPqtfqGTGmv4ev1%2ByM3Cx3ZPxp%2Bn3LDHRYBsg9EBXfFmJnwuTbmMeNQmQSHQ5Rv33%2FlP9lfQYGRHIq%2BHs9df2v9MjKqlTPxYeh2mCy1fMUG2YDo9JGE82O7wsbJx5Y9nCX5NGm6N0eSJFUFwQGpexlLIBgvVo5xGdtEg3pWVXWVb4S1shOqFn61s2WtDGhrQAANADuVf7k9aMkAQGL2Ne0teA5rhogjYIRPT2jxrZrUcdTx7XtpV44A93acGDWyrLLrLWnOWyMK4V%2BUFo21WTCAIAgCAIAgCAID%2F%2F2Q%3D%3D&logoColor=%238E75B2&color=%234285F4&link=https%3A%2F%2Fantigravity.google%2F)

Cloudflare Workers 위에서 동작하는 고성능 **DNS-over-HTTPS (DoH)** 필터링 프록시 및 서비스 소개 포털입니다.  
프로필별 광고/트래킹 도메인 차단, 다중 업스트림 병렬 경합(`fastest`) 및 우선순위 Fallback(`priority`) 모드, Cloudflare Edge 캐싱, 그리고 **`config.js`와 실시간 동기화되는 서비스 소개 웹페이지**를 내장하고 있습니다.

---

## 🚀 주요 기능

- **웹 기반 서비스 소개 포털 내장 (`GET /`)**
  - 워커 루트 주소(`https://<your-worker>.workers.dev/`) 접속 시 반응형 소개 웹페이지 자동 서빙
  - **`config.js` 실시간 자동 동기화**: `config.js`에 프로필을 추가/수정하면 HTML 수정 없이 웹페이지에 자동으로 반영
  - 접속 도메인 자동 감지(Smart Origin Replacement) 및 원클릭 DoH 주소 복사 기능
  - `/api/profiles` JSON API를 통한 메타데이터 제공
- **경로 및 쿼리 기반 태그 프로필 라우팅**
  - `/dns-query/:tag` (예: `/dns-query/all`, `/dns-query/fastdns`, `/dns-query/google`) 경로 지원
  - 기존 `?tag=xxx` 쿼리 파라미터 하위 호환
  - 태그를 지정하지 않은 `/dns-query` 접속 시 기본값 `all` 자동 적용
- **2가지 업스트림 조회 모드**
  - **`fastest` (병렬 경합 - Race)**: 등록된 모든 업스트림 서버로 동시에 질의하여 가장 빠른 응답을 반환 (지연 시간 최소화)
  - **`priority` (순차 Fallback)**: 등록된 업스트림 순서대로 시도하며, 장애 발생 시에만 다음 업스트림으로 순차 전환
- **RFC 1035 규격 준수 차단 패킷 생성**
  - 차단 목록 매칭 시 RFC 표준 형식의 `NXDOMAIN` (RCODE 3) 즉시 반환
  - EDNS0 전치 에러 및 포맷 오류 패킷(FORMERR) 표준 처리
- **Cloudflare Edge Cache API 연동**
  - 도메인/질의타입/태그를 조합한 고유 캐시 키 생성
  - `ctx.waitUntil`을 통한 비동기 엣지 캐싱으로 응답 지연 방지

---

## 📁 프로젝트 구조

```text
.
├── worker.js       # Cloudflare Workers DoH 프록시 코어 및 라우팅 로직
├── config.js       # 태그 프로필, 차단 도메인, 업스트림 및 메타데이터 설정
├── landing.js      # 서비스 소개 웹페이지 템플릿 및 SSR 렌더러
├── index.html      # 독립형 서비스 소개 웹페이지 (정적 호스팅/오프라인 겸용)
└── README.md       # 프로젝트 문서
```

---

## ⚙️ 설정 가이드 (`config.js`)

[`config.js`](./config.js) 파일에서 태그별 프로필을 자유롭게 추가하거나 변경할 수 있습니다.  
새로운 프로필을 등록하면 **소개 웹페이지와 DoH 엔드포인트에 즉시 자동 반영**됩니다.

```javascript
// 기본 업스트림 서버 (프로필에 upstreams가 없을 때 사용)
export const DEFAULT_UPSTREAMS = [
  "https://1.1.1.1/dns-query",
  "https://1.0.0.1/dns-query",
  "https://8.8.8.8/dns-query"
];

// 기본 모드: "fastest" (병렬 경합) 또는 "priority" (우선순위 순차)
export const DEFAULT_MODE = "fastest";

export const CONFIG_PROFILES = {
  // 1) all: 기본 종합 차단 (유튜브, 광고, 트래커 전면 차단)
  all: {
    name: "기본 종합 차단 (All)",
    description: "유튜브 광고 및 주요 인앱 광고/트래커를 차단합니다.",
    badge: "추천 (기본값)",
    mode: "priority", // "fastest" 또는 "priority"
    lists: [
      "youtube.com",
      "googleads.g.doubleclick.net",
      // ... 추가 차단 도메인
    ],
    upstreams: [
      "https://1.1.1.3/dns-query", // Cloudflare Family
      "https://1.0.0.3/dns-query",
      "https://1.1.1.2/dns-query", // Cloudflare Security
      "https://1.0.0.2/dns-query",
      "https://8.8.8.8/dns-query"
    ]
  },

  // 2) fastdns: 통신사 및 글로벌 DNS 초고속 병렬 레이스
  fastdns: {
    name: "Fast DNS (초고속 통신사 DNS)",
    description: "국내 통신사(KT, SKB) 및 글로벌 DNS를 초고속 병렬 경합합니다.",
    badge: "초고속",
    mode: "fastest",
    lists: [], // 차단 목록 없음 (순수 프록시)
    upstreams: [
      "https://1.1.1.1/dns-query",
      "https://1.0.0.1/dns-query",
      "https://168.126.63.1/dns-query",
      "https://8.8.8.8/dns-query",
      "https://210.220.163.82/dns-query"
    ]
  },

  // 3) nonyt: 유튜브 허용 + 광고 차단
  nonyt: {
    mode: "priority",
    lists: [ ... ],
    upstreams: [
      "https://1.1.1.2/dns-query",
      "https://9.9.9.9/dns-query"
    ]
  },

  // 4) google: 구글 공식 DoH 연동
  google: {
    name: "Google Public DNS",
    description: "구글 공식 DoH 업스트림을 통한 순수 암호화 프록시",
    badge: "공식",
    mode: "fastest",
    upstreams: [
      "https://8.8.8.8/dns-query",
      "https://8.8.4.4/dns-query"
    ]
  }
};
```

### 💡 프로필 옵션 필드
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `mode` | `string` | `"fastest"` (병렬 경합) 또는 `"priority"` (순차 시도) |
| `lists` | `string[]` | 차단할 도메인 목록. 생략하거나 `[]`인 경우 차단 없이 순수 DoH 프록시로 동작 |
| `upstreams` | `string[]` | 질의를 전달할 상위 DoH 서버 URL 배열 |
| `name` *(선택)* | `string` | 소개 웹페이지에 표시할 프로필 이름 (미지정 시 `TAG 프로필` 자동 생성) |
| `description` *(선택)* | `string` | 소개 웹페이지에 표시할 상세 설명 (미지정 시 규칙 수 기반 자동 생성) |
| `badge` *(선택)* | `string` | 프로필 카드에 표시할 강조 뱃지 텍스트 |

---

## 🌐 엔드포인트 및 사용 방법

배포된 워커 도메인이 `https://your-worker.workers.dev`인 경우:

| 접근 URL | 유형 | 설명 |
| :--- | :--- | :--- |
| `https://your-worker.workers.dev/` | 웹페이지 | **서비스 소개 및 설정 가이드 포털** |
| `https://your-worker.workers.dev/api/profiles` | REST API | 등록된 프로필 메타데이터 JSON 응답 |
| `https://your-worker.workers.dev/dns-query` | DoH | 기본 프로필(`all`) DNS 질의 |
| `https://your-worker.workers.dev/dns-query/:tag` | DoH | 태그 지정 프로필 DNS 질의 (예: `/fastdns`, `/google`) |
| `https://your-worker.workers.dev/dns-query?tag=xxx`| DoH | 쿼리 스트링 호환 |

### 클라이언트 설정 예시

- **웹 브라우저 (Chrome / Firefox / Edge / Whale)**:
  - 설정 -> 개인정보 보호 및 보안 -> 보안 -> "보안 DNS 사용(DoH)" 설정에서 맞춤설정 공급자로 `https://your-worker.workers.dev/dns-query` 입력
- **AdGuard Home / dnsmasq**:
  - 업스트림 DNS 주소로 `https://your-worker.workers.dev/dns-query/all` 등록
- **Android**:
  - Intra 등의 DoH 호환 앱을 설치하여 서버 URL에 주소 등록

---

## ⚡ 빌드 및 배포 성능

Wrangler(Cloudflare Workers)는 Go 기반의 `esbuild` 번들러를 사용하며, 외부 무거운 종속성이 없어 전체 번들 크기가 약 **25KB(압축 시 6~7KB)** 에 불과합니다.

- **로컬 빌드 시간**: 약 **0.05초 ~ 0.15초 (50~150ms)**
- **Cloudflare 글로벌 배포**: 약 **1초 ~ 3초**
- **총 소요 시간**: 약 **2~3초 내외**로 전 세계 300여 개 엣지 데이터센터에 즉각 배포됩니다.

```bash
# 1. Wrangler 로그인
npx wrangler login

# 2. 로컬 테스트
npx wrangler dev

# 3. 배포
npx wrangler deploy
```
