/**
 * =========================================================================
 * Cloudflare Workers 기반 고성능 DNS-over-HTTPS (DoH) 필터링 프록시
 * =========================================================================
 */

import { CONFIG_PROFILES, DEFAULT_UPSTREAMS, DEFAULT_MODE, CUSTOM_TLDS, CUSTOM_RECORDS } from "./config.js";
import { renderLandingHtml } from "./landing.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) 루트 및 소개 웹페이지 서빙 (GET / 또는 GET /index.html)
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const profilesMeta = getProfilesMetadata();
      const html = renderLandingHtml(profilesMeta, url.origin);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60"
        }
      });
    }

    // 2) 프로필 메타데이터 JSON API (GET /api/profiles)
    if (request.method === "GET" && url.pathname === "/api/profiles") {
      const profilesMeta = getProfilesMetadata();
      return new Response(JSON.stringify(profilesMeta), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60"
        }
      });
    }

    // 3) DoH 엔드포인트: /dns-query 또는 /dns-query/:tag 경로 매칭 (오타 /dns-qury 및 끝의 슬래시 허용)
    const pathMatch = url.pathname.match(/^\/dns-qu(?:e)?ry(?:\/([^\/]+))?\/?$/i);
    if (!pathMatch) {
      return new Response("Not Found", { status: 404 });
    }

    // 경로 파라미터 우선 (/dns-query/all), 없으면 쿼리 파라미터(?tag=all), 기본값 "all"
    const pathTag = pathMatch[1];
    const queryTag = url.searchParams.get("tag");
    const currentTag = pathTag || queryTag || "all";
    const profile = CONFIG_PROFILES[currentTag] || CONFIG_PROFILES.all || { lists: [], upstreams: DEFAULT_UPSTREAMS };

    let dnsMessage;
    try {
      if (request.method === "GET") {
        const dnsParam = url.searchParams.get("dns");
        if (!dnsParam) return new Response("Missing dns param", { status: 400 });

        const base64 = dnsParam.replace(/-/g, "+").replace(/_/g, "/");
        const padLen = (4 - (base64.length % 4)) % 4;
        const binaryString = atob(base64 + "=".repeat(padLen));
        dnsMessage = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          dnsMessage[i] = binaryString.charCodeAt(i);
        }
      } else if (request.method === "POST") {
        dnsMessage = new Uint8Array(await request.arrayBuffer());
      } else {
        return new Response("Method Not Allowed", { status: 405 });
      }
    } catch {
      return new Response("Invalid DNS Request", { status: 400 });
    }

    // RFC 준수 파싱 수행
    const parsedQuestion = parseDnsQuestionStrict(dnsMessage);

    // 형식 오류 패킷은 RFC 1035 표준에 따라 FORMERR(RCODE 1) 회신
    if (!parsedQuestion) {
      const errResponse = createRcodeResponse(dnsMessage, 1);
      return new Response(errResponse, {
        status: 200,
        headers: { "Content-Type": "application/dns-message" }
      });
    }

    const { domain, qtype, questionBuffer } = parsedQuestion;

    // 차단 검사: 등록 도메인일 경우 즉시 표준 NXDOMAIN 응답 반환
    if (isBlacklisted(domain, profile.lists)) {
      const blockedResponse = createNxdomainResponse(dnsMessage, questionBuffer);
      return new Response(blockedResponse, {
        status: 200,
        headers: {
          "Content-Type": "application/dns-message",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300"
        }
      });
    }

    // 커스텀 가상 TLD 및 도메인 검사 (.yuha, .yu, .comm, .yh 등)
    const customTargetIp = getCustomDomainTarget(domain, CUSTOM_RECORDS, CUSTOM_TLDS);
    if (customTargetIp) {
      let customResponseBuf;
      if (qtype === 1) {
        // A 레코드 (IPv4) 질의 -> 지정된 목적지 IP 응답
        customResponseBuf = createAResponse(dnsMessage, questionBuffer, customTargetIp, 300);
      } else {
        // AAAA(IPv6), HTTPS 등 기타 질의 -> NODATA(NOERROR) 응답으로 IPv6 대기/타임아웃 방지
        customResponseBuf = createNoDataResponse(dnsMessage, questionBuffer);
      }

      return new Response(customResponseBuf, {
        status: 200,
        headers: {
          "Content-Type": "application/dns-message",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300"
        }
      });
    }

    // Cloudflare Cache API 조회 (오류 시 무시하고 업스트림 패스)
    let cache = null;
    let cacheKey = null;
    try {
      if (typeof caches !== "undefined" && caches && caches.default) {
        cache = caches.default;
        cacheKey = new Request(
          `https://${url.host}/dns-cache?tag=${encodeURIComponent(currentTag)}&q=${encodeURIComponent(domain)}&t=${qtype}`,
          { method: "GET" }
        );

        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          const cachedBuf = new Uint8Array(await cachedResponse.arrayBuffer());
          // [핵심 해결] RFC 1035: 클라이언트의 Transaction ID로 첫 2바이트 반드시 교체
          if (cachedBuf.length >= 2 && dnsMessage.length >= 2) {
            cachedBuf[0] = dnsMessage[0];
            cachedBuf[1] = dnsMessage[1];
          }
          return new Response(cachedBuf.buffer, {
            status: 200,
            headers: {
              "Content-Type": "application/dns-message",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=60"
            }
          });
        }
      }
    } catch {
      // 캐시 읽기 실패 시 업스트림 직접 질의로 안전하게 폴백
    }

    // 업스트림 조회 (fastest: 병렬 경합 또는 priority: 우선순위 순차 시도)
    const targetUpstreams = profile.upstreams && profile.upstreams.length > 0 ? profile.upstreams : DEFAULT_UPSTREAMS;
    let mode = (profile.mode || DEFAULT_MODE || "fastest").toLowerCase();
    if (mode !== "priority") mode = "fastest";

    const upstreamResponse = await fetchUpstream(targetUpstreams, dnsMessage, mode);

    if (!upstreamResponse) {
      const servFail = createRcodeResponse(dnsMessage, 2); // SERVFAIL
      return new Response(servFail, {
        status: 200,
        headers: { "Content-Type": "application/dns-message" }
      });
    }

    const responseBody = await upstreamResponse.arrayBuffer();
    const finalResponse = new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/dns-message",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60"
      }
    });

    // 비동기 엣지 캐시 적재
    if (cache && cacheKey && ctx && typeof ctx.waitUntil === "function") {
      try {
        ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      } catch {
        // 캐시 저장 실패 시 무시
      }
    }

    return finalResponse;
  }
};

/**
 * config.js의 CONFIG_PROFILES로부터 소개 페이지용 메타데이터 추출
 */
function getProfilesMetadata() {
  return Object.entries(CONFIG_PROFILES).map(([tag, prof]) => {
    let mode = (prof.mode || DEFAULT_MODE || "fastest").toLowerCase();
    if (mode !== "priority") mode = "fastest";

    const isDefault = tag === "all";
    const listsCount = Array.isArray(prof.lists) ? prof.lists.length : 0;
    const upstreamsCount = Array.isArray(prof.upstreams) ? prof.upstreams.length : 0;

    let defaultDesc = "";
    if (listsCount > 0) {
      defaultDesc = `${listsCount}개 광고/유해 도메인 차단 및 ${upstreamsCount}개 업스트림 질의`;
    } else {
      defaultDesc = `도메인 차단 없이 ${upstreamsCount}개 업스트림을 통한 순수 초고속 암호화 DNS`;
    }

    return {
      tag,
      name: prof.name || (isDefault ? "기본 종합 차단 (All)" : `${tag.toUpperCase()} 프로필`),
      description: prof.description || defaultDesc,
      badge: prof.badge || (isDefault ? "추천 (기본값)" : ""),
      mode,
      listsCount,
      upstreamsCount
    };
  });
}

/**
 * RFC 1035 준수 정밀 도메인 및 질문 섹션 파서
 */
function parseDnsQuestionStrict(buffer) {
  if (buffer.length < 12) return null;

  const qdcount = (buffer[4] << 8) | buffer[5];
  if (qdcount < 1) return null;

  let offset = 12;
  const domainParts = [];

  while (offset < buffer.length) {
    const length = buffer[offset];
    if (length === 0) {
      offset++;
      break;
    }
    // 압축 포인터(0xC0) 조작 감지 시 거부
    if ((length & 0xC0) !== 0) return null;

    offset++;
    if (offset + length > buffer.length) return null;

    let part = "";
    for (let i = 0; i < length; i++) {
      part += String.fromCharCode(buffer[offset + i]);
    }
    domainParts.push(part);
    offset += length;
  }

  if (offset + 4 > buffer.length) return null;

  const qtype = (buffer[offset] << 8) | buffer[offset + 1];
  const qclass = (buffer[offset + 2] << 8) | buffer[offset + 3];
  offset += 4;

  const questionBuffer = buffer.slice(12, offset);

  return {
    domain: domainParts.join(".").toLowerCase(),
    qtype,
    qclass,
    questionBuffer
  };
}

/**
 * 서브도메인 포함 블랙리스트 검사
 */
function isBlacklisted(domain, lists) {
  if (!domain || !lists || !Array.isArray(lists)) return false;
  return lists.some(blocked => domain === blocked || domain.endsWith("." + blocked));
}

/**
 * RFC 규격 준수 NXDOMAIN 응답 패킷 생성기
 */
function createNxdomainResponse(rawQuery, questionBuffer) {
  const header = new Uint8Array(12);
  header[0] = rawQuery[0];
  header[1] = rawQuery[1];

  const rd = rawQuery[2] & 0x01;
  header[2] = 0x80 | rd;
  header[3] = 0x83; // RCODE=3 (NXDOMAIN)

  header[4] = 0x00; header[5] = 0x01; // QDCOUNT=1
  header[6] = 0x00; header[7] = 0x00;
  header[8] = 0x00; header[9] = 0x00;
  header[10] = 0x00; header[11] = 0x00;

  const response = new Uint8Array(12 + questionBuffer.length);
  response.set(header, 0);
  response.set(questionBuffer, 12);

  return response.buffer;
}

/**
 * 커스텀 도메인 / TLD 매핑 대상 IP 확인 (.yuha, .yu, .comm, .yh 등)
 */
function getCustomDomainTarget(domain, customRecords = {}, customTlds = {}) {
  if (!domain) return null;
  const lower = domain.toLowerCase();

  // 1) 개별 도메인 FQDN 완전 일치 (예: "router.yuha")
  if (customRecords && customRecords[lower]) {
    return customRecords[lower];
  }

  // 2) TLD 파싱 및 매칭 (.yuha, .yu, .comm, .yh 등)
  const parts = lower.split(".");
  const rawTld = parts[parts.length - 1];
  const cleanTld = rawTld.replace(/^\./, "");

  if (customTlds) {
    if (customTlds[cleanTld]) return customTlds[cleanTld];
    if (customTlds["." + cleanTld]) return customTlds["." + cleanTld];
  }

  return null;
}

/**
 * RFC 1035 규격 준수 A 레코드 응답 패킷 생성기 (IPv4)
 */
function createAResponse(rawQuery, questionBuffer, ipStr = "127.0.0.1", ttl = 300) {
  const header = new Uint8Array(12);
  header[0] = rawQuery[0];
  header[1] = rawQuery[1];

  const rd = rawQuery[2] & 0x01;
  header[2] = 0x84 | rd; // QR=1(응답), AA=1(Authoritative), RD 유지
  header[3] = 0x80;      // RA=1, RCODE=0 (NoError)

  header[4] = 0x00; header[5] = 0x01; // QDCOUNT = 1
  header[6] = 0x00; header[7] = 0x01; // ANCOUNT = 1
  header[8] = 0x00; header[9] = 0x00; // NSCOUNT = 0
  header[10] = 0x00; header[11] = 0x00; // ARCOUNT = 0

  const ipParts = ipStr.split(".").map(Number);
  const ipBytes = (ipParts.length === 4 && ipParts.every(n => !isNaN(n) && n >= 0 && n <= 255))
    ? ipParts
    : [127, 0, 0, 1];

  // Answer Section (총 16바이트)
  const answer = new Uint8Array(16);
  answer[0] = 0xC0; answer[1] = 0x0C; // Name pointer to offset 12 (Question)
  answer[2] = 0x00; answer[3] = 0x01; // Type A (1)
  answer[4] = 0x00; answer[5] = 0x01; // Class IN (1)
  answer[6] = (ttl >>> 24) & 0xFF;
  answer[7] = (ttl >>> 16) & 0xFF;
  answer[8] = (ttl >>> 8) & 0xFF;
  answer[9] = ttl & 0xFF;
  answer[10] = 0x00; answer[11] = 0x04; // RDLENGTH = 4
  answer[12] = ipBytes[0];
  answer[13] = ipBytes[1];
  answer[14] = ipBytes[2];
  answer[15] = ipBytes[3];

  const response = new Uint8Array(12 + questionBuffer.length + 16);
  response.set(header, 0);
  response.set(questionBuffer, 12);
  response.set(answer, 12 + questionBuffer.length);

  return response.buffer;
}

/**
 * RFC 1035 규격 준수 NODATA (NOERROR, ANCOUNT=0) 응답 패킷 생성기
 * (AAAA 질의 등 IPv4 외 질의 시 IPv6 타임아웃을 방지하기 위해 빈 정상 응답 반환)
 */
function createNoDataResponse(rawQuery, questionBuffer) {
  const header = new Uint8Array(12);
  header[0] = rawQuery[0];
  header[1] = rawQuery[1];

  const rd = rawQuery[2] & 0x01;
  header[2] = 0x84 | rd;
  header[3] = 0x80; // RCODE=0 (NOERROR)

  header[4] = 0x00; header[5] = 0x01; // QDCOUNT = 1
  header[6] = 0x00; header[7] = 0x00; // ANCOUNT = 0
  header[8] = 0x00; header[9] = 0x00;
  header[10] = 0x00; header[11] = 0x00;

  const response = new Uint8Array(12 + questionBuffer.length);
  response.set(header, 0);
  response.set(questionBuffer, 12);

  return response.buffer;
}

/**
 * 표준 RCODE 헤더 생성기
 */
function createRcodeResponse(rawQuery, rcode) {
  const response = new Uint8Array(12);
  if (rawQuery && rawQuery.length >= 2) {
    response[0] = rawQuery[0];
    response[1] = rawQuery[1];
  }
  response[2] = 0x81;
  response[3] = 0x80 | (rcode & 0x0F);
  return response.buffer;
}

/**
 * 모드별 업스트림 라우팅 분기기
 */
async function fetchUpstream(upstreams, dnsMessage, mode = "fastest") {
  if (mode === "priority") {
    return await fetchUpstreamPriority(upstreams, dnsMessage);
  }
  return await fetchUpstreamFastest(upstreams, dnsMessage);
}

/**
 * 1) fastest 모드: 병렬 경합(Race) 기반 가장 빠른 응답 반환
 */
async function fetchUpstreamFastest(upstreams, dnsMessage) {
  const timeoutMs = 2500;
  const attempts = upstreams.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/dns-message",
          "Content-Type": "application/dns-message"
        },
        body: dnsMessage,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  });

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

/**
 * 2) priority 모드: 배열 순서(우선순위)대로 시도하며 실패 시 다음 업스트림으로 신속 fallback
 */
async function fetchUpstreamPriority(upstreams, dnsMessage) {
  const timeoutMs = 1200; // 빠른 fallback을 위해 타임아웃 단축

  for (const url of upstreams) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/dns-message",
          "Content-Type": "application/dns-message"
        },
        body: dnsMessage,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        return res;
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return null;
}
