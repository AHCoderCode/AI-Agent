const DEFAULT_MODEL = "gemini-3.8-flash";
const SYSTEM_INSTRUCTION = [
  "You are PocketPilot AI, a helpful website-based assistant.",
  "Answer clearly, accurately, and honestly. Be concise unless the user asks for detail.",
  "When Google Search is enabled for the request, use it for current facts and summarize relevant findings with source context.",
  "This product runs in a normal website. You cannot control installed Android apps, phone settings, contacts, device files, calls, SMS, or the operating system. Never claim to have performed those actions.",
  "Search and website actions are suggestions only. The browser UI asks the user to click before opening any URL.",
  "Never claim an external action was completed unless the user actually clicks the provided action button."
].join("\n");

const rateWindows = new Map();

function json(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(data);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function limited(key) {
  const now = Date.now();
  const previous = rateWindows.get(key);
  if (!previous || now - previous.start > 60_000) {
    rateWindows.set(key, { start: now, count: 1 });
    return false;
  }
  previous.count += 1;
  if (rateWindows.size > 1000) {
    for (const [client, item] of rateWindows) {
      if (now - item.start > 60_000) rateWindows.delete(client);
    }
  }
  return previous.count > 18;
}

function clientKey(req) {
  const value = req.headers?.["x-forwarded-for"];
  if (typeof value === "string" && value.trim()) return value.split(",")[0].trim();
  return String(req.headers?.["x-real-ip"] || "unknown");
}

function directWebsiteAction(message) {
  const text = String(message || "").trim();
  const match = text.match(/^(?:please\\s+)?(?:open|visit|go to|navigate to|launch)\\s+(?:(?:the|a)\\s+)?(?:website\\s+)?(.+?)[.!?]*$/i);
  if (!match?.[1]) return null;

  const target = match[1].trim().replace(/\\s+website$/i, "").replace(/[.!?,;]+$/, "").trim().toLowerCase();
  const sites = {
    "youtube": ["YouTube", "https://www.youtube.com/"],
    "you tube": ["YouTube", "https://www.youtube.com/"],
    "youtube.com": ["YouTube", "https://www.youtube.com/"],
    "google": ["Google", "https://www.google.com/"],
    "google.com": ["Google", "https://www.google.com/"],
    "github": ["GitHub", "https://github.com/"],
    "github.com": ["GitHub", "https://github.com/"],
    "wikipedia": ["Wikipedia", "https://www.wikipedia.org/"],
    "wikipedia.org": ["Wikipedia", "https://www.wikipedia.org/"],
    "reddit": ["Reddit", "https://www.reddit.com/"],
    "reddit.com": ["Reddit", "https://www.reddit.com/"],
    "stack overflow": ["Stack Overflow", "https://stackoverflow.com/"],
    "stackoverflow": ["Stack Overflow", "https://stackoverflow.com/"],
    "stackoverflow.com": ["Stack Overflow", "https://stackoverflow.com/"],
    "chatgpt": ["ChatGPT", "https://chatgpt.com/"],
    "openai": ["OpenAI", "https://openai.com/"],
    "instagram": ["Instagram", "https://www.instagram.com/"],
    "facebook": ["Facebook", "https://www.facebook.com/"],
    "twitter": ["X", "https://x.com/"],
    "x": ["X", "https://x.com/"],
    "tiktok": ["TikTok", "https://www.tiktok.com/"],
    "discord": ["Discord", "https://discord.com/app"],
    "spotify": ["Spotify", "https://open.spotify.com/"],
    "netflix": ["Netflix", "https://www.netflix.com/"],
    "amazon": ["Amazon", "https://www.amazon.com/"],
    "w3schools": ["W3Schools", "https://www.w3schools.com/"],
    "mdn": ["MDN Web Docs", "https://developer.mozilla.org/"],
    "vercel": ["Vercel", "https://vercel.com/"],
    "roblox": ["Roblox", "https://www.roblox.com/"],
    "gmail": ["Gmail", "https://mail.google.com/"],
    "google ai studio": ["Google AI Studio", "https://aistudio.google.com/"],
    "aistudio.google.com": ["Google AI Studio", "https://aistudio.google.com/"],
    "canva": ["Canva", "https://www.canva.com/"],
    "linkedin": ["LinkedIn", "https://www.linkedin.com/"],
    "outlook": ["Outlook", "https://outlook.live.com/mail/"],
    "bing": ["Bing", "https://www.bing.com/"],
    "duckduckgo": ["DuckDuckGo", "https://duckduckgo.com/"],
    "pinterest": ["Pinterest", "https://www.pinterest.com/"],
    "twitch": ["Twitch", "https://www.twitch.tv/"],
    "google drive": ["Google Drive", "https://drive.google.com/"],
    "google docs": ["Google Docs", "https://docs.google.com/"],
    "google classroom": ["Google Classroom", "https://classroom.google.com/"],
    "google maps": ["Google Maps", "https://maps.google.com/"]
  };
  const site = sites[target];
  if (site) return { label: "Open " + site[0], url: site[1] };

  // Also support explicit HTTPS URLs or ordinary public domain names.
  let raw = target;
  if (!/^https?:\\/\\//i.test(raw) && /^[a-z0-9-]+(?:\\.[a-z0-9-]+)+(?:\\/[^\\s]*)?$/i.test(raw)) raw = "https://" + raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.hostname === "localhost") return null;
    if (/^(127\\.|10\\.|192\\.168\\.|169\\.254\\.)/i.test(url.hostname)) return null;
    return { label: "Open " + url.hostname, url: url.toString() };
  } catch {
    return null;
  }
}

function requestedAction(message) {
  const text = String(message || "").trim();
  let match = text.match(/\b(?:search|find|look up)\s+(?:youtube\s+for|on youtube for)\s+(.+)/i)
    || text.match(/\byoutube\s+(?:search|search for)\s+(.+)/i);
  if (match?.[1]) {
    const query = match[1].trim().replace(/[?.!]+$/, "");
    return { label: "Open YouTube results", url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(query) };
  }
  match = text.match(/\b(?:search|look up|find)\s+(?:the\s+)?(?:web|internet|google)\s+(?:for\s+)?(.+)/i)
    || text.match(/\bgoogle\s+search\s+(?:for\s+)?(.+)/i);
  if (match?.[1]) {
    const query = match[1].trim().replace(/[?.!]+$/, "");
    return { label: "Open Google results", url: "https://www.google.com/search?q=" + encodeURIComponent(query) };
  }
  match = text.match(/\bopen\s+(?:the\s+)?(?:website\s+)?(https?:\/\/[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)/i);
  if (match?.[1]) {
    let raw = match[1].replace(/[),.;!?]+$/, "");
    try {
      if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
      const url = new URL(raw);
      if (!url.hostname.includes(".") || url.hostname === "localhost") return null;
      if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) return null;
      url.protocol = "https:";
      return { label: "Open " + url.hostname, url: url.toString() };
    } catch { return null; }
  }
  return null;
}

function needsWebSearch(message) {
  if (/\b(?:youtube|video on youtube)\b/i.test(message)) return false;
  return /\b(?:search (?:the )?(?:web|internet|google)|look up online|latest|current|today|yesterday|this week|news|weather|forecast|exchange rate|stock price|price of|recently|right now)\b/i.test(message);
}

function buildContents(history, message) {
  const contents = [];
  const recent = Array.isArray(history) ? history.slice(-12) : [];
  for (const entry of recent) {
    if (!entry || typeof entry.content !== "string") continue;
    const text = entry.content.trim().slice(0, 6000);
    if (!text) continue;
    contents.push({
      role: entry.role === "assistant" || entry.role === "model" ? "model" : "user",
      parts: [{ text }]
    });
  }
  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed", message: "Use POST for chat requests." });
  }
  if (limited(clientKey(req))) {
    return json(res, 429, { ok: false, error: "rate_limited", message: "Too many messages in a short period. Wait about a minute and try again." });
  }

  const body = readBody(req);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return json(res, 400, { ok: false, error: "empty_message", message: "Type a message first." });
  if (message.length > 6000) return json(res, 413, { ok: false, error: "message_too_long", message: "Please keep each message under 6,000 characters." });

  // Website-opening commands are deterministic: do not wait for Gemini to answer them.
  const directAction = directWebsiteAction(message);
  if (directAction) {
    const siteName = directAction.label.replace(/^Open\\s+/, "");
    return json(res, 200, {
      ok: true,
      reply: "Tap the button below to open " + siteName + ".",
      action: directAction,
      sources: [],
      model: "direct-action",
      usedGoogleSearch: false
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 503, { ok: false, error: "missing_api_key", message: "Gemini is not connected yet. Add GEMINI_API_KEY in Vercel → Settings → Environment Variables, then redeploy." });
  }
  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) return json(res, 500, { ok: false, error: "invalid_model", message: "GEMINI_MODEL contains invalid characters." });

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: buildContents(body.history, message),
    generationConfig: { maxOutputTokens: 2048 }
  };
  const useSearch = needsWebSearch(message);
  if (useSearch) payload.tools = [{ google_search: {} }];

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 38_000);
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal
    };
    let response;
    let data = {};
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(endpoint, requestOptions);
      try { data = await response.json(); } catch { data = {}; }
      if (response.status !== 503 || attempt === 2) break;
      const delayMs = 1000 * (2 ** attempt) + Math.floor(Math.random() * 250);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    if (!response.ok) {
      if (response.status === 429) return json(res, 429, { ok: false, error: "gemini_quota", message: "Gemini has reached a rate limit or quota. Check API usage in Google AI Studio and try again later." });
      if (response.status === 401 || response.status === 403) return json(res, 502, { ok: false, error: "gemini_auth", message: "Google rejected the Gemini API key. Check that the key is active and Gemini API access is enabled." });
      if (response.status === 404) return json(res, 502, { ok: false, error: "gemini_model", message: "The Gemini model was not found. Set GEMINI_MODEL to gemini-3.8-flash or remove that variable to use the default." });
      if (response.status === 503) return json(res, 503, { ok: false, error: "gemini_unavailable", message: "Gemini is temporarily overloaded or unavailable. PocketPilot retried the request; please try again shortly." });
      return json(res, 502, { ok: false, error: "gemini_request_failed", message: "Gemini returned HTTP " + response.status + ". Check the Vercel function logs for details." });
    }

    const candidate = data?.candidates?.[0];
    const reply = candidate?.content?.parts?.map(part => typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n").trim();
    if (!reply) return json(res, 502, { ok: false, error: "empty_model_reply", message: "Gemini returned no text. Please rephrase your message and try again." });

    const sources = [];
    const seen = new Set();
    for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
      const web = chunk?.web;
      if (!web?.uri || !/^https:\/\//i.test(web.uri) || seen.has(web.uri)) continue;
      seen.add(web.uri);
      sources.push({ title: String(web.title || "Source").slice(0, 180), url: web.uri });
      if (sources.length >= 6) break;
    }
    return json(res, 200, { ok: true, reply, action: requestedAction(message), sources, model, usedGoogleSearch: useSearch });
  } catch (error) {
    if (error?.name === "AbortError") return json(res, 504, { ok: false, error: "gemini_timeout", message: "Gemini took too long to reply. Try again." });
    return json(res, 502, { ok: false, error: "upstream_unavailable", message: "PocketPilot could not reach Gemini. Check your internet connection and try again." });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
