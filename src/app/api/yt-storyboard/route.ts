export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("v");

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: "invalid_video_id" }, { status: 400 });
  }

  try {
    const ytUrl =
      `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`;

    const ytResp = await fetch(ytUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie:
          "CONSENT=YES+cb.20210328-17-p0.en+FX+987; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnsBhAB",
      },
    });

    const html = await ytResp.text();

    const marker = "ytInitialPlayerResponse";
    const mIdx = html.indexOf(marker);
    if (mIdx === -1) {
      return Response.json({ error: "no_marker", status: ytResp.status }, { status: 404 });
    }

    const braceIdx = html.indexOf("{", mIdx + marker.length);
    if (braceIdx === -1) {
      return Response.json({ error: "no_json" }, { status: 404 });
    }

    let depth = 0;
    let inStr = false;
    let esc = false;
    let endIdx = braceIdx;
    const limit = Math.min(html.length, braceIdx + 600000);
    for (let ci = braceIdx; ci < limit; ci++) {
      const ch = html[ci];
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { endIdx = ci + 1; break; }
      }
    }

    let jsonStr = html.substring(braceIdx, endIdx);
    jsonStr = jsonStr.replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1");
    const pr = JSON.parse(jsonStr);

    const playStatus = pr?.playabilityStatus?.status || "unknown";
    const duration = parseFloat(pr?.videoDetails?.lengthSeconds || "0");
    const spec =
      pr?.storyboards?.playerStoryboardSpecRenderer?.spec || "";

    return Response.json(
      { spec, duration, videoId, status: playStatus },
      {
        headers: {
          "Cache-Control": "public, max-age=1800, s-maxage=3600",
        },
      }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ error: msg }, { status: 500 });
  }
}
