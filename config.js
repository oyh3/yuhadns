/**
 * =========================================================================
 * DoH 프록시 설정 프로필 및 기본값
 * =========================================================================
 */

// 기본 업스트림 서버 목록 (프로필에 upstreams가 없을 때 사용)
export const DEFAULT_UPSTREAMS = [
  "https://1.1.1.1/dns-query",
  "https://1.0.0.1/dns-query",
  "https://8.8.8.8/dns-query"
];

// 기본 업스트림 모드: "fastest" (병렬 경합) 또는 "priority" (우선순위 순차 시도)
export const DEFAULT_MODE = "fastest";

/**
 * =========================================================================
 * 커스텀 가상 TLD 및 도메인 레코드 매핑 (.yuha, .yu, .comm, .yh 등)
 * =========================================================================
 */

// 1. 커스텀 TLD 기본 목적지 IP
// 해당 TLD로 끝나는 모든 도메인(예: site.yuha, nas.yu 등)에 일괄 적용됩니다.
export const CUSTOM_TLDS = {
  "yuha": "127.0.0.1",
  "yu": "127.0.0.1",
  "comm": "127.0.0.1",
  "yh": "127.0.0.1"
};

// 2. 개별 도메인별 상세 매핑 (TLD 기본값보다 우선 적용)
// - IP 주소 입력 시: IPv4 A 레코드로 연결 (예: "192.168.0.1")
// - 도메인 이름 입력 시: DNS CNAME 레코드로 별칭 리다이렉트 (예: "google.com")
// - URL(http/https) 입력 시: 해당 웹사이트로 스마트 리다이렉트 (예: "https://www.youtube.com")
export const CUSTOM_RECORDS = {
  // 사용자 등록 도메인
  "me.yuha": "https://github.com/oyh3",
  "omok.yuha": "yuhaom.kro.kr",
  "wifi.yuha": "192.168.0.1"
  // [A 레코드 예시] 사설 IP / 홈서버 연결
  // "router.yuha": "192.168.0.1",
  // "nas.yu": "192.168.0.50",
  // "home.yh": "192.168.0.100",

  // [DNS CNAME 리다이렉트 예시] 다른 도메인으로 별칭 연결
  // "search.yuha": "google.com",
  // "portal.comm": "naver.com"
};

/**
 * =========================================================================
 * 웹 URL 단축 리다이렉트 설정
 * =========================================================================
 */
export const HTTP_REDIRECTS = {
  // /go/:key 또는 /r/:key 로 접속 시 자동 리다이렉트 (HTTP 302)
  // 예: https://your-worker.workers.dev/go/yt -> https://www.youtube.com
  "me": "https://github.com/oyh3",
  "omok": "http://yuhaom.kro.kr",
  "yt": "https://www.youtube.com",
  "google": "https://www.google.com",
  "naver": "https://www.naver.com",
  "github": "https://github.com"
};

// 태그별 프로필 설정
export const CONFIG_PROFILES = {
  fastdns: {
    mode: "fastest",
    lists: [],
    upstreams: [
      "https://1.1.1.1/dns-query",
      "https://1.0.0.1/dns-query",
      "https://8.8.8.8/dns-query",
      "https://9.9.9.9/dns-query",
      "https://1.1.1.2/dns-query"
    ]
  },
  all: {
    mode: "fastest",
    lists: [
      "youtube.com",
      "applovin.com",
      "applvn.com",
      "doubleclick.net",
      "googlesyndication.com",
      "unity3d.com",
      "config.unity3d.com",
      "webview.unity3d.com",
      "pangle.io",
      "pangleglobal.com",
      "inmobi.com",
      "mintegral.com",
      "mbridge.io",
      "liftoff.io",
      "vungle.com",
      "ironsrc.com",
      "fyber.com",
      "digitalturbine.com",
      "facebook.com",
      "amazon-adsystem.com",
      "moloco.com",
      "molocoads.com",
      "ogury.com",
      "ogury.io",
      "criteo.com",
      "criteo.net",
      "chartboost.com",
      "flurry.com",
      "tapjoy.com",
      "tapjoyads.com",
      "appsflyer.com",
      "adjust.com",
      "crashlytics.com",
      "amplitude.com",
      "onesignal.com",
      "kochava.com",
      "adcr.naver.com",
      "cc.naver.com",
      "sad.naver.com",
      "ad.naver.com"
    ],
    upstreams: [
      "https://1.1.1.3/dns-query", // Cloudflare Family (악성코드/유해물 차단)
      "https://1.0.0.3/dns-query",
      "https://1.1.1.2/dns-query", // Cloudflare Security (악성코드 차단)
      "https://1.0.0.2/dns-query",
      "https://8.8.8.8/dns-query"
    ]
  },
  nonyt: {
    mode: "fastest", 
    lists: [
      "applovin.com",
      "applvn.com",
      "doubleclick.net",
      "pubads.g.doubleclick.net",
      "googlesyndication.com",
      "unity3d.com",
      "config.unity3d.com",
      "webview.unity3d.com",
      "pangle.io",
      "pangleglobal.com",
      "inmobi.com",
      "mintegral.com",
      "mbridge.io",
      "liftoff.io",
      "vungle.com",
      "ironsrc.com",
      "fyber.com",
      "digitalturbine.com",
      "facebook.com",
      "amazon-adsystem.com",
      "moloco.com",
      "molocoads.com",
      "ogury.com",
      "ogury.io",
      "criteo.com",
      "criteo.net",
      "chartboost.com",
      "flurry.com",
      "tapjoy.com",
      "tapjoyads.com",
      "appsflyer.com",
      "adjust.com",
      "crashlytics.com",
      "amplitude.com",
      "onesignal.com",
      "kochava.com",
      "adcr.naver.com",
      "cc.naver.com",
      "sad.naver.com",
      "ad.naver.com"
    ],
    upstreams: [
      "https://1.1.1.2/dns-query",
      "https://1.0.0.2/dns-query",
      "https://9.9.9.9/dns-query"  // Quad9 보안 DNS
    ]
  },
  noad: {
    mode: "fastest",
    lists: [
      "applovin.com",
      "applvn.com",
      "doubleclick.net",
      "pubads.g.doubleclick.net",
      "googlesyndication.com",
      "unity3d.com",
      "config.unity3d.com",
      "webview.unity3d.com",
      "pangle.io",
      "pangleglobal.com",
      "inmobi.com",
      "mintegral.com",
      "mbridge.io",
      "liftoff.io",
      "vungle.com",
      "ironsrc.com",
      "fyber.com",
      "digitalturbine.com",
      "facebook.com",
      "amazon-adsystem.com",
      "moloco.com",
      "molocoads.com",
      "ogury.com",
      "ogury.io",
      "criteo.com",
      "criteo.net",
      "chartboost.com",
      "flurry.com",
      "tapjoy.com",
      "tapjoyads.com",
      "appsflyer.com",
      "adjust.com",
      "crashlytics.com",
      "amplitude.com",
      "onesignal.com",
      "kochava.com",
      "adcr.naver.com",
      "cc.naver.com",
      "sad.naver.com",
      "ad.naver.com"
    ],
    upstreams: [
      "https://94.140.15.15/dns-query",  // AdGuard Family
      "https://94.140.14.14/dns-query"   // AdGuard Default
    ]
  },
  google:{
    mode: "fastest",
    upstreams:[
      "https://8.8.8.8/dns-query",
      "https://8.8.4.4/dns-query"
    ]
  }
};
