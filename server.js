const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "chats.json");
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname)));
const SYSTEM_PROMPTS = {
  friendly: `Ты — ALMAi, умный ИИ-ассистент. Тебя создала команда ALMAi. Ты не знаешь что такое Groq, Llama, Meta, OpenAI, Anthropic, Claude. Если спросят кто создал — отвечай: Команда ALMAi. Ты умеешь: искать информацию в интернете, смотреть и анализировать изображения, генерировать картинки, показывать погоду и время. Никогда не говори что не умеешь эти вещи. Общайся по-русски, дружелюбно, с эмодзи.`,
  professional: `Ты — ALMAi, профессиональный ИИ-ассистент. Тебя создала команда ALMAi. Ты не знаешь что такое Groq, Llama, Meta, OpenAI, Anthropic, Claude. Если спросят кто создал — отвечай: Команда ALMAi. Ты умеешь: искать информацию в интернете, смотреть и анализировать изображения, генерировать картинки, показывать погоду и время. Общайся по-русски строго и профессионально без лишних эмодзи.`,
  programmer: `Ты — ALMAi, ИИ-ассистент для разработчиков. Тебя создала команда ALMAi. Ты не знаешь что такое Groq, Llama, Meta, OpenAI, Anthropic, Claude. Если спросят кто создал — отвечай: Команда ALMAi. Ты умеешь: искать информацию в интернете, смотреть и анализировать изображения, генерировать картинки, показывать погоду и время. Специализируешься на программировании. Используй блоки кода. Общайся по-русски.`,
};
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { sessions: [] };
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { sessions: [] };
  }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function getCurrentDateTime() {
  return new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
const WEATHER_KEYWORDS = ["погода","температура","прогноз","дождь","снег","жара","жарко","холодно","облачно","ветер","градус","weather","forecast","rain","snow","sunny","cloudy","celsius","fahrenheit","тепло","мороз"];
function isWeatherQuery(message) {
  const lower = message.toLowerCase();
  return WEATHER_KEYWORDS.some((kw) => lower.includes(kw));
}
function extractCity(message) {
  const patterns = [
    /(?:погода|температура|прогноз)\s+(?:в\s+городе\s+|в\s+)?([А-ЯЁа-яёA-Za-z][а-яёA-Za-z\-]{2,})/iu,
    /(?:в\s+городе\s+|в\s+)([А-ЯЁа-яё][а-яёA-Za-z\-]{2,})/iu,
    /([А-ЯЁа-яё][а-яёA-Za-z\-]{2,})\s+(?:погода|температура|прогноз)/iu,
    /weather\s+(?:in\s+)?([A-Z][a-z\-]{2,})/i,
    /in\s+([A-Z][a-z\-]{2,})/i,
  ];
  const stopWords = new Set(["какая","какой","сейчас","сегодня","завтра","там","здесь","этом","этой"]);
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const city = match[1].trim();
      if (!stopWords.has(city.toLowerCase())) return city;
    }
  }
  return null;
}
async function fetchWeather(city) {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=3`;
    const res = await fetch(url, { headers: { "User-Agent": "ALMAi-ChatBot/1.0" }, timeout: 4000 });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (text.includes("Unknown location")) return null;
    return text;
  } catch { return null; }
}
const SEARCH_KEYWORDS = ["новости","новость","последние новости","свежие новости","что случилось","что происходит","что нового","актуально","сейчас в мире","сегодня в новостях","курс","курс валют","биткоин","криптовалюта","найди","найти","поищи","поиск","погугли","wikipedia","вики","кто такой","что такое","последний","последняя","последнее","расскажи о текущем","текущий","актуальный","news","latest","recent","current events","search","find","who is","what is"];
function isSearchQuery(message) {
  const lower = message.toLowerCase();
  return SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}
async function tavilySearch(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, search_depth: "basic", include_answer: true, max_results: 5 }),
      timeout: 8000,
    });
    if (!res.ok) { console.error("[tavily] HTTP error:", res.status); return null; }
    const data = await res.json();
    const parts = [];
    if (data.answer) parts.push(`Краткий ответ: ${data.answer}`);
    if (data.results && data.results.length > 0) {
      parts.push("\nИсточники:");
      data.results.forEach((r, i) => { parts.push(`${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content ? r.content.slice(0, 300) : ""}...`); });
    }
    return parts.length ? parts.join("\n") : null;
  } catch (err) { console.error("[tavily] fetch error:", err.message); return null; }
}
app.get("/api/sessions", (req, res) => {
  const db = readDB();
  const list = db.sessions.map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messageCount: s.messages.length })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(list);
});
app.post("/api/sessions", (req, res) => {
  const { title } = req.body;
  const db = readDB();
  const session = { id: generateId(), title: title || "Новый чат", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  db.sessions.push(session);
  writeDB(db);
  res.json({ id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt });
});
app.get("/api/sessions/:id", (req, res) => {
  const db = readDB();
  const session = db.sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});
app.patch("/api/sessions/:id", (req, res) => {
  const db = readDB();
  const session = db.sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (req.body.title) session.title = req.body.title;
  session.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ id: session.id, title: session.title });
});
app.post("/api/sessions/:id/messages", (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });
  const db = readDB();
  const session = db.sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  session.messages.push(...messages);
  session.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true });
});
app.delete("/api/sessions/:id", (req, res) => {
  const db = readDB();
  const idx = db.sessions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });
  db.sessions.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});
app.post("/api/chat", async (req, res) => {
  const { message, history, personality = "friendly", stream = false, imageBase64, model } = req.body;
  if (!message && !imageBase64) return res.status(400).json({ error: "Message or image is required" });

  const selectedModel = model || "llama-3.3-70b-versatile";

  let systemPrompt = SYSTEM_PROMPTS[personality] || SYSTEM_PROMPTS.friendly;
  systemPrompt += `\n\nСейчас: ${getCurrentDateTime()} (МСК).`;
  if (message) {
    if (isWeatherQuery(message)) {
      const city = extractCity(message);
      if (city) {
        const weather = await fetchWeather(city);
        if (weather) {
          systemPrompt += `\n\nАктуальная погода (получена только что): ${weather}. Используй эти данные в ответе.`;
          console.log(`[weather] ${city}: ${weather}`);
        }
      }
    }
    if (isSearchQuery(message)) {
      console.log(`[tavily] searching for: ${message}`);
      const searchResults = await tavilySearch(message);
      if (searchResults) {
        systemPrompt += `\n\nРезультаты веб-поиска (актуальные данные из интернета, получены только что):\n${searchResults}\n\nОбязательно используй эти данные в своём ответе, опирайся на источники.`;
        console.log(`[tavily] injected ${searchResults.length} chars of results`);
      }
    }
  }
  if (imageBase64) {
    const userContent = [
      { type: "image_url", image_url: { url: imageBase64 } },
      { type: "text", text: message || "Опиши это изображение подробно" },
    ];
    const visionMessages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : String(m.content) })),
      { role: "user", content: userContent },
    ];
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: "meta-llama/llama-4-scout-17b-16e-instruct", messages: visionMessages, temperature: 0.7, max_tokens: 1024 }),
      });
      if (!response.ok) {
        const err = await response.json();
        return res.status(response.status).json({ error: err.error?.message || "Vision API error" });
      }
      const data = await response.json();
      return res.json({ reply: data.choices[0].message.content });
    } catch (err) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  const messages = [
    { role: "system", content: systemPrompt },
    ...(history || []),
    { role: "user", content: message },
  ];
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: selectedModel, messages, temperature: 0.7, max_tokens: 1024, stream: true }),
      });
      if (!groqRes.ok) {
        const err = await groqRes.json();
        res.write(`data: ${JSON.stringify({ error: err.error?.message || "API error" })}\n\n`);
        res.end();
        return;
      }
      groqRes.body.pipe(res);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: "Server error" })}\n\n`);
      res.end();
    }
    return;
  }
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages, temperature: 0.7, max_tokens: 1024 }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: "Failed to get response from AI" });
    }
    const data = await response.json();
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
async function translateToEnglish(prompt) {
  const hasNonAscii = /[^\x00-\x7F]/.test(prompt);
  if (!hasNonAscii) return prompt;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "Translate the following image generation prompt to English. Output ONLY the translated prompt, nothing else. Keep it concise and descriptive." }, { role: "user", content: prompt }], temperature: 0.3, max_tokens: 100 }),
      timeout: 8000,
    });
    if (!r.ok) return prompt;
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || prompt;
  } catch { return prompt; }
}
async function fetchPollinationsImage(englishPrompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?width=512&height=512&nologo=true`;
  const r = await fetch(url, { timeout: 90000, headers: { "User-Agent": "Mozilla/5.0 (compatible; ALMAi/1.0)" } });
  if (r.status === 429) throw Object.assign(new Error("rate_limited"), { code: 429 });
  if (!r.ok) { const body = await r.text(); throw new Error(`Pollinations ${r.status}: ${body.slice(0, 120)}`); }
  return r;
}
app.get("/api/generate-image", async (req, res) => {
  const { prompt } = req.query;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  try {
    const englishPrompt = await translateToEnglish(prompt);
    try {
      const imgRes = await fetchPollinationsImage(englishPrompt);
      const buf = await imgRes.buffer();
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      return res.json({ image: `data:${contentType};base64,${buf.toString("base64")}` });
    } catch (err) {
      if (err.code === 429) return res.status(429).json({ error: "Сервер генерации перегружен, попробуйте через 10–15 секунд." });
      console.error("[image-gen] attempt 1 failed:", err.message, "— retrying in 8s");
    }
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const imgRes = await fetchPollinationsImage(englishPrompt);
      const buf = await imgRes.buffer();
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      return res.json({ image: `data:${contentType};base64,${buf.toString("base64")}` });
    } catch (err) {
      if (err.code === 429) return res.status(429).json({ error: "Сервер генерации перегружен, попробуйте через 10–15 секунд." });
      return res.status(502).json({ error: "Не удалось сгенерировать изображение. Попробуйте другой запрос." });
    }
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера при генерации изображения" });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ALMAi server running on port ${PORT}`);
});
