const $ = selector => document.querySelector(selector);
const form = $("#chat-form");
const input = $("#message-input");
const sendButton = $("#send-button");
const voiceButton = $("#voice-input");
const messagesBox = $("#messages");
const welcome = $("#welcome");
const setupBanner = $("#setup-banner");
const setupMessage = $("#setup-message");
const connectionLabel = $("#connection-label");
const onlineIndicator = $("#online-indicator");
const recordingLabel = $("#recording-label");
const sidebar = $("#sidebar");
const STORAGE_KEY = "pocketpilot.website.chat.v1";
let busy = false;
let recognition = null;
let recording = false;
let messages = readSavedMessages();

function readSavedMessages() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-60);
  } catch { return []; }
}
function saveMessages() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60))); } catch {} }
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function niceTime(value) {
  try { return new Date(value || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}
function safeOpen(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") window.open(parsed.toString(), "_blank", "noopener,noreferrer");
  } catch {}
}
function renderMessages() {
  const hasMessages = messages.length > 0;
  welcome.hidden = hasMessages;
  messagesBox.hidden = !hasMessages;
  messagesBox.replaceChildren();
  for (const message of messages) {
    const row = el("article", "message-row " + message.role);
    const avatar = el("div", "avatar", message.role === "user" ? "Y" : "P");
    avatar.setAttribute("aria-hidden", "true");
    const content = el("div", "message-content");
    const meta = el("div", "message-meta");
    meta.append(el("strong", "", message.role === "user" ? "You" : "PocketPilot"), el("span", "", niceTime(message.time)));
    content.append(meta, el("div", "message-text", message.content));
    if (message.role === "assistant") {
      if (message.action && typeof message.action.url === "string" && message.action.url.startsWith("https://")) {
        const extras = el("div", "message-extras");
        const button = el("button", "action-button", "↗  " + (message.action.label || "Open link"));
        button.type = "button";
        button.addEventListener("click", () => safeOpen(message.action.url));
        extras.append(button);
        content.append(extras);
      }
      if (Array.isArray(message.sources) && message.sources.length) {
        const extras = el("div", "message-extras");
        extras.append(el("div", "source-title", "WEB SOURCES"));
        for (const source of message.sources.slice(0, 6)) {
          try {
            const url = new URL(source.url);
            if (url.protocol !== "https:") continue;
            const link = el("a", "source-link", "↗  " + (source.title || url.hostname));
            link.href = url.toString(); link.target = "_blank"; link.rel = "noopener noreferrer";
            extras.append(link);
          } catch {}
        }
        if (extras.children.length > 1) content.append(extras);
      }
      const tools = el("div", "message-tools");
      const copy = el("button", "message-tool", "Copy"); copy.type = "button";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(message.content); copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1200); }
        catch { copy.textContent = "Copy unavailable"; }
      });
      tools.append(copy);
      if ("speechSynthesis" in window && message.content.trim()) {
        const speak = el("button", "message-tool", "Read aloud"); speak.type = "button";
        speak.addEventListener("click", () => {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(message.content);
          utterance.rate = 1; window.speechSynthesis.speak(utterance);
        });
        tools.append(speak);
      }
      content.append(tools);
    }
    row.append(avatar, content); messagesBox.append(row);
  }
  if (messagesBox.lastElementChild) messagesBox.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" });
}
function addMessage(role, content, extras = {}) {
  messages.push({ role, content: String(content || ""), time: new Date().toISOString(), ...(extras.action ? { action: extras.action } : {}), ...(Array.isArray(extras.sources) ? { sources: extras.sources } : {}) });
  messages = messages.slice(-60); saveMessages(); renderMessages();
}
function showLoading() {
  const row = el("article", "message-row assistant loading-row");
  const avatar = el("div", "avatar", "P");
  const content = el("div", "message-content");
  content.append(el("div", "message-meta", "PocketPilot is thinking"));
  const dots = el("div", "loading-dots"); dots.append(el("span"), el("span"), el("span"));
  content.append(dots); row.append(avatar, content); messagesBox.append(row);
  row.scrollIntoView({ behavior: "smooth", block: "end" });
  return row;
}
async function sendMessage(raw) {
  const message = String(raw || "").trim();
  if (!message || busy) return;
  busy = true; sendButton.disabled = true; input.disabled = true;
  addMessage("user", message);
  const loading = showLoading();
  const history = messages.slice(0, -1).slice(-12).map(item => ({ role: item.role, content: item.content }));
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history }) });
    let data = {}; try { data = await response.json(); } catch {}
    loading.remove();
    if (!response.ok || !data.ok) addMessage("assistant", data.message || "I couldn't complete that request. Please try again.");
    else addMessage("assistant", data.reply, { action: data.action, sources: data.sources });
  } catch {
    loading.remove(); addMessage("assistant", "I couldn't reach PocketPilot's server. Check your internet connection and try again.");
  } finally { busy = false; sendButton.disabled = false; input.disabled = false; input.focus(); resizeInput(); }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  const value = input.value;
  if (!value.trim() || busy) return;
  input.value = ""; resizeInput(); sendMessage(value);
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
input.addEventListener("input", resizeInput);
function resizeInput() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 190) + "px"; }
function newChat() {
  if (busy) return;
  messages = []; saveMessages(); renderMessages(); input.value = ""; resizeInput(); input.focus();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  sidebar.classList.remove("open");
}
$("#new-chat").addEventListener("click", newChat);
$("#clear-chat").addEventListener("click", newChat);
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => {
  input.value = button.getAttribute("data-prompt") || ""; resizeInput(); input.focus();
  if (button.classList.contains("side-prompt")) sidebar.classList.remove("open");
}));
$("#menu-toggle").addEventListener("click", () => sidebar.classList.toggle("open"));
document.addEventListener("click", event => {
  if (window.innerWidth <= 760 && sidebar.classList.contains("open") && !sidebar.contains(event.target) && !$("#menu-toggle").contains(event.target)) sidebar.classList.remove("open");
});
async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("health check failed");
    onlineIndicator.style.background = "#72d5a0";
    connectionLabel.textContent = data.aiConfigured ? "Gemini connected" : "Setup required";
    connectionLabel.style.color = data.aiConfigured ? "#aab6c8" : "#f1ca7b";
    setupBanner.hidden = Boolean(data.aiConfigured);
    if (!data.aiConfigured) setupMessage.textContent = "Add GEMINI_API_KEY in Vercel → Project Settings → Environment Variables, then redeploy. Your key stays on the server.";
  } catch {
    onlineIndicator.style.background = "#e6a66c";
    connectionLabel.textContent = "Could not check server";
    setupBanner.hidden = false;
    setupMessage.textContent = "The service status could not be checked. Open /api/health or inspect the latest Vercel deployment.";
  }
}
function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { voiceButton.disabled = true; voiceButton.title = "Voice typing is not supported here. Try the latest Chrome."; return; }
  recognition = new SpeechRecognition(); recognition.lang = navigator.language || "en-US"; recognition.interimResults = false; recognition.continuous = false;
  recognition.onstart = () => { recording = true; voiceButton.classList.add("recording"); recordingLabel.hidden = false; voiceButton.setAttribute("aria-label", "Stop voice typing"); };
  recognition.onresult = event => { const transcript = event.results?.[0]?.[0]?.transcript || ""; if (transcript) { input.value = (input.value ? input.value.trim() + " " : "") + transcript; resizeInput(); input.focus(); } };
  recognition.onerror = () => finishSpeech(); recognition.onend = () => finishSpeech();
}
function finishSpeech() { recording = false; voiceButton.classList.remove("recording"); recordingLabel.hidden = true; voiceButton.setAttribute("aria-label", "Use voice typing"); }
voiceButton.addEventListener("click", () => { if (!recognition) return; try { recording ? recognition.stop() : recognition.start(); } catch {} });
renderMessages(); setupSpeech(); checkHealth();
