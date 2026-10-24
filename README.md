# Yuhadns (Cloudflare Workers DoH Proxy)

Cloudflare Workers 위에서 동작하는 고성능 **DNS-over-HTTPS (DoH)** 필터링 프록시입니다.  
프로필별 광고/트래킹 도메인 차단, 다중 업스트림 병렬 경합(`fastest`) 및 우선순위 Fallback(`priority`) 모드, Cloudflare Edge 캐싱을 지원합니다.

---

## 🚀 주요 기능

- **경로 및 쿼리 기반 태그 프로필 라우팅**
  - `/dns-query/:tag` (예: `/dns-query/all`, `/dns-query/nonyt`) 경로로 직관적인 분기 지원
  - 기존 `?tag=xxx` 쿼리 파라미터 하위 호환
  - 태그를 지정하지 않은 `/dns-query` 접속 시 기본값 `all` 자동 적용
- **2가지 업스트림 조회 모드**
  - **`fastest` (병렬 경합 - Race)**: 등록된 모든 업스트림 서버로 동시에 요청을 전송하여 가장 빠른 응답을 반환 (지연 시간 최소화)
  - **`priority` (순차 Fallback)**: 등록된 업스트림 순서대로 시도하며, 장애 발생 시에만 다음 업스트림으로 순차 전환
- **RFC 1035 규격 준수 차단 패킷 생성**
  - 차단 목록 매칭 시 RFC 표준 형식의 `NXDOMAIN` (RCODE 3) 즉시 반환
  - EDNS0 전치 에러 및 포맷 오류 패킷(FORMERR) 표준 처리
- **Cloudflare Edge Cache API 연동**
  - 도메인/질의타입/태그를 조합한 고유 캐시 키 생성
  - `ctx.waitUntil`을 통한 비동기 엣지 캐싱으로 응답 지연 방지
- **설정 파일 분리**
  - [`config.js`](./config.js)를 통해 프로필, 차단 도메인 목록, 업스트림 서버, 조회 모드를 손쉽게 관리

---

## 📁 프로젝트 구조

```text
.
├── worker.js       # Cloudflare Workers DoH 프록시 코어 로직
├── config.js       # 태그 프로필, 차단 도메인 및 업스트림 설정
└── README.md       # 프로젝트 문서
```

---

## ⚙️ 설정 가이드 (`config.js`)

[`config.js`](./config.js) 파일에서 전역 기본값 및 태그별 프로필을 자유롭게 커스텀할 수 있습니다.

```javascript
// 기본 업스트림 서버 (프로필에 upstreams가 없을 때 사용)
export const DEFAULT_UPSTREAMS = [
  "https://1.1.1.1/dns-query",
  "https://8.8.8.8/dns-query"
];

// 기본 모드: "fastest" (병렬 경합) 또는 "priority" (우선순위 순차)
export const DEFAULT_MODE = "fastest";

export const CONFIG_PROFILES = {
  // 1) all: 기본 프로필 (유튜브, 광고, 트래커 전면 차단)
  all: {
    mode: "fastest",
    lists: [
      "youtube.com",
      "googleads.g.doubleclick.net",
      // ... 추가 차단 도메인
    ],
    upstreams: [
      "https://1.1.1.3/dns-query", // Cloudflare Family
      "https://1.0.0.3/dns-query",
      "https://1.1.1.2/dns-query", // Cloudflare Security
      "https://1.0.0.2/dns-query"
    ]
  },

  // 2) nonyt: 유튜브 제외 광고/트래킹 차단 + 우선순위 모드
  nonyt: {
    mode: "priority",
    lists: [
      "googleads.g.doubleclick.net",
      // ...
    ],
    upstreams: [
      "https://1.1.1.2/dns-query",
      "https://1.0.0.2/dns-query",
      "https://9.9.9.9/dns-query" // Quad9
    ]
  },

  // 3) noad: AdGuard 업스트림 사용
  noad: {
    mode: "fastest",
    lists: [ ... ],
    upstreams: [
      "https://94.140.15.15/dns-query",
      "https://94.140.14.14/dns-query"
    ]
  },

  // 4) lists가 없거나 빈 배열인 경우: 차단 없이 순수 DoH 프록시로 동작
  df: {
    mode: "fastest",
    lists: [],
    upstreams: [
      "https://1.1.1.1/dns-query",
      "https://8.8.8.8/dns-query"
    ]
  }
};
```

> **참고**: `lists` 속성을 비워두거나(`[]`) 생략하면 도메인 차단 없이 모든 쿼리가 업스트림으로 정상 통과되는 순수 DoH 프록시로 동작합니다.

---

## 🌐 사용 방법

배포된 워커 도메인이 `https://your-worker.workers.dev`인 경우:

| 접근 URL | 적용 프로필 | 설명 |
| :--- | :--- | :--- |
| `https://your-worker.workers.dev/dns-query` | `all` (기본값) | 태그 미지정 시 기본 프로필 동작 |
| `https://your-worker.workers.dev/dns-query/all` | `all` | 경로 기반 프로필 지정 |
| `https://your-worker.workers.dev/dns-query/nonyt` | `nonyt` | 유튜브 허용 및 광고 차단 |
| `https://your-worker.workers.dev/dns-query/noad` | `noad` | AdGuard 업스트림 프로필 |
| `https://your-worker.workers.dev/dns-query?tag=all` | `all` | 쿼리 스트링 호환 |

### 클라이언트 설정 예시

- **웹 브라우저 (Chrome / Firefox / Edge)**:
  - 설정 -> 개인정보 보호 및 보안 -> 보안 -> "보안 DNS 사용(DoH)" 설정에서 커스텀 공급자로 `https://your-worker.workers.dev/dns-query` 입력
- **AdGuard Home / dnsmasq**:
  - 업스트림 DNS 주소로 `https://your-worker.workers.dev/dns-query/all` 등록
- **애플 기기 (.mobileconfig)** 또는 **Android 프라이빗 DNS (DoH 호환 앱 사용 시)**

---

## 🛠️ 배포 방법

Wrangler CLI를 사용하여 Cloudflare Workers에 쉽게 배포할 수 있습니다.

```bash
# 1. Wrangler 로그인
npx wrangler login

# 2. 로컬 테스트
npx wrangler dev

# 3. Cloudflare 배포
npx wrangler deploy
```

