const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3200;
const API_SECRET = process.env.API_SECRET || "";

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 10000);
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => { clearTimeout(timer); resolve({ status: res.statusCode, body: data }); });
    });
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

function extractPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse";
  const mIdx = html.indexOf(marker);
  if (mIdx === -1) return null;

  const braceStart = html.indexOf("{", mIdx);
  if (braceStart === -1) return null;

  let depth = 0, end = braceStart;
  for (; end < html.length; end++) {
    if (html[end] === "{") depth++;
    else if (html[end] === "}") { depth--; if (depth === 0) break; }
  }

  try {
    return JSON.parse(html.substring(braceStart, end + 1));
  } catch {
    return null;
  }
}

async function handleRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
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
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`;
    const { body: html, status: httpStatus } = await fetchUrl(ytUrl, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Cookie: "CONSENT=PENDING+987; GPS=1",
    });

    const pr = extractPlayerResponse(html);
    if (!pr) {
      res.end(JSON.stringify({
        spec: "", duration: 0, videoId,
        status: "PARSE_ERROR", httpStatus, htmlLen: html.length,
      }));
      return;
    }

    const playStatus = pr?.playabilityStatus?.status || "unknown";
    const duration = parseFloat(pr?.videoDetails?.lengthSeconds || "0");
    const spec = pr?.storyboards?.playerStoryboardSpecRenderer?.spec || "";

    res.setHeader("Cache-Control", spec ? "public, max-age=1800" : "no-store");
    res.end(JSON.stringify({ spec, duration, videoId, status: playStatus }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => console.log(`yt-storyboard proxy listening on :${PORT}`));
