export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const videoId = url.searchParams.get("v");
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return json({ error: "invalid video id" }, 400);
    }

    const errors = [];

    // Run ALL methods in parallel with individual timeouts
    const results = await Promise.allSettled([
      withTimeout(fetchInnerTube(videoId, "WEB", {
        clientName: "WEB", clientVersion: "2.20241201.00.00", hl: "en",
      }), 6000),
      withTimeout(fetchInnerTube(videoId, "MWEB", {
        clientName: "MWEB", clientVersion: "2.20241201.00.00", hl: "en",
      }), 6000),
      withTimeout(fetchInnerTube(videoId, "TVHTML5", {
        clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en",
      }, { thirdParty: { embedUrl: "https://www.google.com" } }), 6000),
      withTimeout(fetchHtml(videoId), 8000),
      withTimeout(fetchEmbed(videoId), 6000),
    ]);

    let spec = "";
    let duration = 0;
    let playStatus = "unknown";
    let source = "";

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        errors.push(r.value.debug);
        if (!spec && r.value.spec) {
          spec = r.value.spec;
          duration = r.value.duration;
          playStatus = r.value.playStatus;
          source = r.value.source;
        }
        if (!duration && r.value.duration) duration = r.value.duration;
        if (playStatus === "unknown" && r.value.playStatus !== "unknown") {
          playStatus = r.value.playStatus;
        }
      } else if (r.status === "rejected") {
        errors.push({ error: r.reason?.message || "timeout" });
      }
    }

    const cacheHeader = spec
      ? { "Cache-Control": "public, max-age=1800, s-maxage=3600" }
      : { "Cache-Control": "no-store" };

    return json({ spec, duration, videoId, status: playStatus, source, errors }, 200, cacheHeader);
  },
};

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout_" + ms + "ms")), ms)),
  ]);
}

async function fetchInnerTube(videoId, label, clientObj, extra = {}) {
  const body = { videoId, context: { client: clientObj, ...extra } };
  const resp = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Origin: "https://www.youtube.com",
      Referer: "https://www.youtube.com/",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  const st = data?.playabilityStatus?.status || "unknown";
  const sb = data?.storyboards?.playerStoryboardSpecRenderer?.spec || "";
  const dur = parseFloat(data?.videoDetails?.lengthSeconds || "0");
  return {
    spec: (sb && sb.includes("|")) ? sb : "",
    duration: dur,
    playStatus: st,
    source: "innertube_" + label,
    debug: { method: "innertube_" + label, httpStatus: resp.status, ytStatus: st, specLen: sb.length, dur },
  };
}

async function fetchHtml(videoId) {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`;
  const resp = await fetch(ytUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Cookie: "CONSENT=PENDING+987; GPS=1",
    },
  });
  const html = await resp.text();
  const marker = "ytInitialPlayerResponse";
  const mIdx = html.indexOf(marker);
  const debugInfo = { method: "html", httpStatus: resp.status, htmlLen: html.length, hasMarker: mIdx !== -1 };

  if (mIdx === -1) return { spec: "", duration: 0, playStatus: "unknown", source: "html", debug: debugInfo };

  const braceStart = html.indexOf("{", mIdx);
  if (braceStart === -1) return { spec: "", duration: 0, playStatus: "unknown", source: "html", debug: debugInfo };

  let depth = 0, end = braceStart;
  for (; end < html.length; end++) {
    if (html[end] === "{") depth++;
    else if (html[end] === "}") { depth--; if (depth === 0) break; }
  }

  const pr = JSON.parse(html.substring(braceStart, end + 1));
  const st = pr?.playabilityStatus?.status || "unknown";
  const sb = pr?.storyboards?.playerStoryboardSpecRenderer?.spec || "";
  const dur = parseFloat(pr?.videoDetails?.lengthSeconds || "0");

  debugInfo.ytStatus = st;
  debugInfo.specLen = sb.length;

  return {
    spec: (sb && sb.includes("|")) ? sb : "",
    duration: dur,
    playStatus: st,
    source: "html_parse",
    debug: debugInfo,
  };
}

async function fetchEmbed(videoId) {
  const resp = await fetch(`https://www.youtube.com/embed/${videoId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });
  const html = await resp.text();
  const sbMatch = html.match(/"playerStoryboardSpecRenderer"\s*:\s*\{"spec"\s*:\s*"([^"]+)"/);
  const debugInfo = { method: "embed", httpStatus: resp.status, htmlLen: html.length, hasSpec: !!sbMatch };

  if (!sbMatch || !sbMatch[1].includes("|")) {
    return { spec: "", duration: 0, playStatus: "unknown", source: "embed", debug: debugInfo };
  }

  const spec = sbMatch[1].replace(/\\u0026/g, "&");
  const durMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
  const dur = durMatch ? parseFloat(durMatch[1]) : 0;
  return { spec, duration: dur, playStatus: "OK", source: "embed_parse", debug: debugInfo };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...extra },
  });
}
