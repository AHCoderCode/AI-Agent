export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  return res.status(200).json({
    ok: true,
    service: "PocketPilot AI Website Agent",
    status: "online",
    mode: "website-only",
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    phoneControl: false,
    capabilities: ["chat", "google_search_grounding", "youtube_search_link", "open_https_website", "browser_voice_input", "browser_read_aloud"],
    time: new Date().toISOString()
  });
}
