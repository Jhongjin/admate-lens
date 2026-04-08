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

      const match = html.match(
        /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/s
      );
      if (!match) {
        return json({ error: "no player response in HTML", status: "PARSE_ERROR" });
      }

      let pr;
      try {
        pr = JSON.parse(match[1]);
      } catch {
        const raw = match[1];
        const lastBrace = raw.lastIndexOf("}");
        pr = JSON.parse(raw.substring(0, lastBrace + 1));
      }

      const playStatus = pr?.playabilityStatus?.status || "unknown";
      const duration = parseFloat(pr?.videoDetails?.lengthSeconds || "0");
      const spec =
        pr?.storyboards?.playerStoryboardSpecRenderer?.spec || "";

      return json(
        { spec, duration, videoId, status: playStatus },
        200,
        { "Cache-Control": "public, max-age=1800, s-maxage=3600" }
      );
    } catch (e) {
      return json({ error: e.message }, 500);
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
