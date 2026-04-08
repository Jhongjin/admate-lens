const http = require("http");
const { execSync } = require("child_process");

const PORT = process.env.PORT || 3200;
const COOKIES_PATH = process.env.COOKIES_PATH || "/home/ubuntu/cookies.txt";
const API_SECRET = process.env.API_SECRET || "";

const cache = new Map();
const CACHE_TTL = 3600 * 1000;

function getStoryboard(videoId) {
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`[cache hit] ${videoId}`);
    return cached.data;
  }

  console.log(`[yt-dlp] fetching ${videoId}...`);
  const cmd = [
    "yt-dlp",
    `--cookies "${COOKIES_PATH}"`,
    "--remote-components ejs:github",
    "--dump-single-json",
    "--skip-download",
    `"https://www.youtube.com/watch?v=${videoId}"`,
  ].join(" ");

  const output = execSync(cmd, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
  }).toString();

  const data = JSON.parse(output);
  const duration = data.duration || 0;
  const sb = data.formats?.find((f) => f.format_id === "sb0");
  const storyboardFormats = (data.formats || []).filter(
    (f) => String(f.format_note || "").toLowerCase() === "storyboard"
  );
  const hasDefaultStoryboardSheet = storyboardFormats.some((f) =>
    String(f.url || "").includes("/default.jpg")
  );
  const fragments = (sb?.fragments || []).map((f) => ({
    url: f.url,
    duration: f.duration,
  }));
  const firstFragmentLooksIndexed = fragments.length > 0 && /\/M0\.jpg/i.test(String(fragments[0].url || ""));

  const result = {
    videoId,
    duration,
    title: data.title || "",
    storyboard: sb
      ? {
          width: sb.width,
          height: sb.height,
          rows: sb.rows,
          columns: sb.columns,
          fps: sb.fps,
          fragments,
          // Some videos expose a default storyboard sheet outside M0..MN.
          // In that case, frame indexing from M0 can be shifted by one sheet.
          sheetOffset: hasDefaultStoryboardSheet && firstFragmentLooksIndexed ? 1 : 0,
        }
      : null,
  };

  cache.set(videoId, { data: result, ts: Date.now() });
  console.log(
    `[yt-dlp] ${videoId}: dur=${duration} storyboard=${result.storyboard ? "yes" : "no"} fragments=${result.storyboard?.fragments.length || 0}`
  );
  return result;
}

function handleRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(), cached: cache.size }));
    return;
  }

  if (url.pathname !== "/yt-storyboard") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (API_SECRET && url.searchParams.get("key") !== API_SECRET) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: "forbidden" }));
    return;
  }

  const videoId = url.searchParams.get("v");
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "invalid video id" }));
    return;
  }

  try {
    const result = getStoryboard(videoId);
    res.setHeader("Cache-Control", result.storyboard ? "public, max-age=1800" : "no-store");
    res.end(JSON.stringify(result));
  } catch (e) {
    console.error(`[error] ${videoId}:`, e.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message?.substring(0, 200) }));
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => console.log(`yt-storyboard proxy (yt-dlp) listening on :${PORT}`));
