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

// 태그별 프로필 설정
export const CONFIG_PROFILES = {
  fastdns: {
    mode: "fastest",
    lists: ["example.com"],
    upstreams: [
      "https://1.1.1.1/dns-query",
      "https://1.0.0.1/dns-query",
      "https://168.126.63.1/dns-query",
      "https://8.8.8.8/dns-query",
      "https://210.220.163.82/dns-query"
    ]
  },
  all: {
    mode: "priority",
    lists: [
      "youtube.com",
      "applovin.com",
      "applvn.com",
      "googleads.g.doubleclick.net",
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
      "googleapis.com",
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
    mode: "priority", // nonyt 프로필은 우선순위 순차 시도 예시
    lists: [
      "applovin.com",
      "applvn.com",
      "googleads.g.doubleclick.net",
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
      "googleapis.com",
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
      "googleads.g.doubleclick.net",
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
      "googleapis.com",
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
    mode: "fastset",
    upstreams:[
      "https://8.8.8.8/dns-query",
      "https://8.8.4.4/dns-query"
    ]
  }
};

