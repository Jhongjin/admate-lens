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

    try {
      const ytUrl =
        `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`;

      const ytResp = await fetch(ytUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Cookie: "CONSENT=PENDING+987; GPS=1",
        },
      });

      const html = await ytResp.text();

      let pr = null;

      // Method 1: bracket-counting (most reliable)
      const marker = "ytInitialPlayerResponse";
      const mIdx = html.indexOf(marker);
      if (mIdx !== -1) {
        const braceStart = html.indexOf("{", mIdx);
        if (braceStart !== -1) {
          let depth = 0;
          let end = braceStart;
          for (; end < html.length; end++) {
            if (html[end] === "{") depth++;
            else if (html[end] === "}") { depth--; if (depth === 0) break; }
          }
          try {
            pr = JSON.parse(html.substring(braceStart, end + 1));
          } catch { /* fall through to method 2 */ }
        }
      }

      // Method 2: multiple regex patterns
      if (!pr) {
        const patterns = [
          /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/s,
          /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
          /ytInitialPlayerResponse\s*=\s*(\{.*?"playabilityStatus".*?\})\s*;/s,
        ];
        for (const pat of patterns) {
          const m = html.match(pat);
          if (m) {
            try { pr = JSON.parse(m[1]); break; } catch {
              const raw = m[1];
              const lb = raw.lastIndexOf("}");
              try { pr = JSON.parse(raw.substring(0, lb + 1)); break; } catch { /* next pattern */ }
            }
          }
        }
      }

      if (!pr) {
        const hasMarker = html.includes(marker);
        return json({
          error: "parse failed",
          status: "PARSE_ERROR",
          htmlLen: html.length,
          hasMarker,
        }, 200, { "Cache-Control": "no-store" });
      }

      const playStatus = pr?.playabilityStatus?.status || "unknown";
      const duration = parseFloat(pr?.videoDetails?.lengthSeconds || "0");
      const spec =
        pr?.storyboards?.playerStoryboardSpecRenderer?.spec || "";

      const cacheHeader = (spec && playStatus === "OK")
        ? { "Cache-Control": "public, max-age=1800, s-maxage=3600" }
        : { "Cache-Control": "no-store" };

      return json(
        { spec, duration, videoId, status: playStatus },
        200,
        cacheHeader
      );
    } catch (e) {
      return json({ error: e.message }, 500, { "Cache-Control": "no-store" });
    }
  },
};

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
