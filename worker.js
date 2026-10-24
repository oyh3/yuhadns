/**
 * =========================================================================
 * Cloudflare Workers 기반 고성능 DNS-over-HTTPS (DoH) 필터링 프록시
 * =========================================================================
 */

import { CONFIG_PROFILES, DEFAULT_UPSTREAMS, DEFAULT_MODE } from "./config.js";
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
    const profile = CONFIG_PROFILES[currentTag] || CONFIG_PROFILES.all;

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

    // Cloudflare Cache API 조회
    const cache = caches.default;
    const cacheKey = new Request(
      `https://${url.host}/dns-cache?tag=${encodeURIComponent(currentTag)}&q=${encodeURIComponent(domain)}&t=${qtype}`,
      { method: "GET" }
    );

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 업스트림 조회 (fastest: 병렬 경합 또는 priority: 우선순위 순차 시도)
    const targetUpstreams = profile.upstreams && profile.upstreams.length > 0 ? profile.upstreams : DEFAULT_UPSTREAMS;
    let mode = (profile.mode || DEFAULT_MODE || "fastest").toLowerCase();
    if (mode !== "priority") mode = "fastest"; // 오타 방지 및 표준화

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
    ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));

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

  // 순수 Question 섹션 바이너리 추출 (Additional OPT RR 배제)
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
  // Transaction ID 복제
  header[0] = rawQuery[0];
  header[1] = rawQuery[1];

  // Flags: QR=1 (응답), RD 원본 유지, RA=1 (재귀 지원), RCODE=3 (NXDOMAIN)
  const rd = rawQuery[2] & 0x01;
  header[2] = 0x80 | rd;
  header[3] = 0x83;

  // 레코드 카운트: QD=1, AN=0, NS=0, AR=0
  header[4] = 0x00; header[5] = 0x01;
  header[6] = 0x00; header[7] = 0x00;
  header[8] = 0x00; header[9] = 0x00;
  header[10] = 0x00; header[11] = 0x00;

  // Header + 순수 Question 섹션만 결합하여 EDNS0 전치 에러 원천 차단
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
 * @param {string[]} upstreams - 업스트림 DoH 서버 URL 배열
 * @param {Uint8Array} dnsMessage - 전송할 DNS Wire-format 메시지
 * @param {"fastest"|"priority"} mode - 업스트림 조회 모드
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
  const timeoutMs = 2000;
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
 * 2) priority 모드: 배열 순서(우선순위)대로 시도하며 실패 시 다음 업스트림으로 fallback
 */
async function fetchUpstreamPriority(upstreams, dnsMessage) {
  const timeoutMs = 2000;

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
