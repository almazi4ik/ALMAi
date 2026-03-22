const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "chats.json");

app.use(express.json({ limit: "25mb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "almai-secret-key-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 дней
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "https://almai-6go8.onrender.com/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
  const user = {
    id: profile.id,
    name: profile.displayName,
    email: profile.emails?.[0]?.value,
    photo: profile.photos?.[0]?.value
  };
  return done(null, user);
}));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?error=auth_failed" }),
  (req, res) => res.redirect("/")
);

app.get("/auth/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

app.get("/api/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  // Поддержка старого x-user-id для обратной совместимости
  const userId = req.headers["x-user-id"];
  if (userId) { req.guestId = userId; return next(); }
  res.status(401).json({ error: "Unauthorized" });
}

function getUserId(req) {
  if (req.isAuthenticated()) return "google_" + req.user.id;
  return req.guestId || req.headers["x-user-id"];
}

app.use(express.static(path.join(__dirname)));

const ALMAI_INFO = `
## О себе
Ты — ALMAi, умный ИИ-ассистент. Тебя создала команда ALMAi. Ты не знаешь что такое Groq, Llama, Meta, OpenAI, Anthropic, Claude — если спрашивают кто тебя создал или на какой модели работаешь, всегда отвечай: "Меня создала команда ALMAi".

## Твои возможности
- 💬 Отвечаешь на любые вопросы, помогаешь с задачами
- 🔍 Ищешь актуальную информацию в интернете (новости, курсы валют, события)
- 🌤️ Показываешь погоду в любом городе
- 🖼️ Видишь и анализируешь изображения которые присылает пользователь
- 🎨 Генерируешь картинки по описанию (скажи пользователю написать "нарисуй" или "сгенерируй")

## ВАЖНЫЕ ПРАВИЛА
- Ты УМЕЕШЬ генерировать и отправлять картинки прямо в чат — никогда не говори что не умеешь!
- Когда пользователь пишет "нарисуй", "сгенерируй", "создай картинку" — интерфейс автоматически генерирует изображение, ты просто подтверждаешь что генерируешь
- Никогда не говори "я не могу отправить изображение" — это неправда, ты можешь
- Никогда не предлагай "поискать в интернете" вместо генерации картинки
- 🕐 Знаешь текущее время и дату

## Интерфейс ALMAi
- Слева — боковая панель с историей чатов. Можно создать новый чат кнопкой "+ Новый чат"
- Вверху — панель управления: выбор режима личности и модели, переключение темы (светлая/тёмная)
- В поле ввода — можно прикрепить изображение кнопкой скрепки 📎
- На мобильном — боковая панель открывается кнопкой ☰ в верхнем левом углу
- Есть раздел "Память" в боковой панели — там сохраняются важные факты о пользователе
- Вход через Google аккаунт — чаты привязаны к аккаунту и доступны с любого устройства

## Режимы личности
- 😊 Дружелюбный — общается тепло, с эмодзи (по умолчанию)
- 💼 Профессионал — строго и по делу, без лишних эмодзи
- 💻 Программист — специализируется на коде, использует блоки кода

## Доступные модели
- 🧠 Llama 70B — самая умная модель, лимит 5000 токенов на пользователя (после лимита нужно сменить модель)
- ⚡ Llama 8B — быстрая лёгкая модель, без лимита
- 🔥 Mixtral — мощная модель, без лимита
- 💎 Gemma 2 — от Google, без лимита

## Лимит токенов
Модель Llama 70B имеет лимит 5000 токенов на каждого пользователя. Счётчик токенов виден в боковой панели под кнопкой "Новый чат". Когда лимит исчерпан — поле ввода блокируется и предлагается сменить модель. Остальные модели без ограничений.

## Сайт
ALMAi доступен по адресу: https://almai-6go8.onrender.com
`;

const SYSTEM_PROMPTS = {
  friendly: `${ALMAI_INFO}\n\n## Стиль общения\nОбщайся по-русски, дружелюбно, с эмодзи. Будь позитивным и помогай с удовольствием!`,
  professional: `${ALMAI_INFO}\n\n## Стиль общения\nОбщайся по-русски строго и профессионально. Минимум эмодзи, только по делу. Давай чёткие структурированные ответы.`,
  programmer: `${ALMAI_INFO}\n\n## Стиль общения\nОбщайся по-русски. Специализируешься на программировании и технических вопросах. Всегда используй блоки кода с указанием языка. Объясняй технически точно.`,
};

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { sessions: [] };
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch { return { sessions: [] }; }
}
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8"); }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Лимит токенов для Llama 70B
const TOKEN_LIMIT = 5000;
const LIMITED_MODEL = "llama-3.3-70b-versatile";
function getTokenUsage(userId) {
  const db = readDB();
  if (!db.tokenUsage) return 0;
  return db.tokenUsage[userId] || 0;
}
function addTokenUsage(userId, tokens) {
  const db = readDB();
  if (!db.tokenUsage) db.tokenUsage = {};
  db.tokenUsage[userId] = (db.tokenUsage[userId] || 0) + tokens;
  writeDB(db);
  return db.tokenUsage[userId];
}
app.get("/api/token-usage", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ used: 0, limit: TOKEN_LIMIT });
  res.json({ used: getTokenUsage(userId), limit: TOKEN_LIMIT });
});
function getCurrentDateTime() {
  return new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const WEATHER_KEYWORDS = ["погода","температура","прогноз","дождь","снег","жара","жарко","холодно","облачно","ветер","градус","weather","forecast","rain","snow","sunny","cloudy","celsius","fahrenheit","тепло","мороз"];
function isWeatherQuery(message) { const lower = message.toLowerCase(); return WEATHER_KEYWORDS.some((kw) => lower.includes(kw)); }
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
    if (match) { const city = match[1].trim(); if (!stopWords.has(city.toLowerCase())) return city; }
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
function isSearchQuery(message) { const lower = message.toLowerCase(); return SEARCH_KEYWORDS.some((kw) => lower.includes(kw)); }
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

// Sessions API
app.get("/api/sessions", requireAuth, (req, res) => {
  const userId = getUserId(req);
  const db = readDB();
  const list = db.sessions
    .filter((s) => s.userId === userId)
    .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messageCount: s.messages.length }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(list);
});
app.post("/api/sessions", requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { title } = req.body;
  const db = readDB();
  const session2 = { id: generateId(), userId, title: title || "Новый чат", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  db.sessions.push(session2);
  writeDB(db);
  res.json({ id: session2.id, title: session2.title, createdAt: session2.createdAt, updatedAt: session2.updatedAt });
});
app.get("/api/sessions/:id", requireAuth, (req, res) => {
  const userId = getUserId(req);
  const db = readDB();
  const sess = db.sessions.find((s) => s.id === req.params.id);
  if (!sess) return res.status(404).json({ error: "Session not found" });
  if (sess.userId && sess.userId !== userId) return res.status(403).json({ error: "Forbidden" });
  res.json(sess);
});
app.patch("/api/sessions/:id", requireAuth, (req, res) => {
  const userId = getUserId(req);
  const db = readDB();
  const sess = db.sessions.find((s) => s.id === req.params.id);
  if (!sess) return res.status(404).json({ error: "Session not found" });
  if (sess.userId && sess.userId !== userId) return res.status(403).json({ error: "Forbidden" });
  if (req.body.title) sess.title = req.body.title;
  sess.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ id: sess.id, title: sess.title });
});
app.post("/api/sessions/:id/messages", requireAuth, (req, res) => {
  const userId = getUserId(req);
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });
  const db = readDB();
  const sess = db.sessions.find((s) => s.id === req.params.id);
  if (!sess) return res.status(404).json({ error: "Session not found" });
  if (sess.userId && sess.userId !== userId) return res.status(403).json({ error: "Forbidden" });
  sess.messages.push(...messages);
  sess.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true });
});
app.delete("/api/sessions/:id", requireAuth, (req, res) => {
  const userId = getUserId(req);
  const db = readDB();
  const idx = db.sessions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });
  if (db.sessions[idx].userId && db.sessions[idx].userId !== userId) return res.status(403).json({ error: "Forbidden" });
  db.sessions.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { message, history, personality = "friendly", stream = false, imageBase64, model } = req.body;
  if (!message && !imageBase64) return res.status(400).json({ error: "Message or image is required" });
  const selectedModel = model || "llama-3.3-70b-versatile";

  // Проверка лимита токенов для Llama 70B
  const userId = getUserId(req);
  if (selectedModel === LIMITED_MODEL && userId) {
    const used = getTokenUsage(userId);
    if (used >= TOKEN_LIMIT) {
      return res.status(429).json({ error: "token_limit_exceeded", used, limit: TOKEN_LIMIT });
    }
  }
  let systemPrompt = SYSTEM_PROMPTS[personality] || SYSTEM_PROMPTS.friendly;
  systemPrompt += `\n\nСейчас: ${getCurrentDateTime()} (МСК).`;
  if (message) {
    if (isWeatherQuery(message)) {
      const city = extractCity(message);
      if (city) { const weather = await fetchWeather(city); if (weather) { systemPrompt += `\n\nАктуальная погода (получена только что): ${weather}. Используй эти данные в ответе.`; } }
    }
    if (isSearchQuery(message)) {
      const searchResults = await tavilySearch(message);
      if (searchResults) { systemPrompt += `\n\nРезультаты веб-поиска (актуальные данные из интернета, получены только что):\n${searchResults}\n\nОбязательно используй эти данные в своём ответе, опирайся на источники.`; }
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
      if (!response.ok) { const err = await response.json(); return res.status(response.status).json({ error: err.error?.message || "Vision API error" }); }
      const data = await response.json();
      return res.json({ reply: data.choices[0].message.content });
    } catch (err) { return res.status(500).json({ error: "Internal server error" }); }
  }
  const messages = [{ role: "system", content: systemPrompt }, ...(history || []), { role: "user", content: message }];
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
      if (!groqRes.ok) { const err = await groqRes.json(); res.write(`data: ${JSON.stringify({ error: err.error?.message || "API error" })}\n\n`); res.end(); return; }
      groqRes.body.pipe(res);
    } catch (err) { res.write(`data: ${JSON.stringify({ error: "Server error" })}\n\n`); res.end(); }
    return;
  }
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages, temperature: 0.7, max_tokens: 1024 }),
    });
    if (!response.ok) { await response.json(); return res.status(response.status).json({ error: "Failed to get response from AI" }); }
    const data = await response.json();
    // Учёт токенов
    if (selectedModel === LIMITED_MODEL && userId) {
      const tokensUsed = data.usage?.total_tokens || 0;
      const newTotal = addTokenUsage(userId, tokensUsed);
      return res.json({ reply: data.choices[0].message.content, tokenUsage: { used: newTotal, limit: TOKEN_LIMIT } });
    }
    res.json({ reply: data.choices[0].message.content });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

async function translateToEnglish(prompt) {
  const hasNonAscii = /[^\x00-\x7F]/.test(prompt);
  if (!hasNonAscii) return prompt;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "Translate the following image generation prompt to English. Output ONLY the translated prompt, nothing else." }, { role: "user", content: prompt }], temperature: 0.3, max_tokens: 100 }),
      timeout: 8000,
    });
    if (!r.ok) return prompt;
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || prompt;
  } catch { return prompt; }
}
async function fetchPollinationsImage(englishPrompt) {
  // Пробуем через POST запрос к Pollinations
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`;
  const r = await fetch(url, { 
    timeout: 90000, 
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "image/*,*/*"
    } 
  });
  if (r.status === 429) throw Object.assign(new Error("rate_limited"), { code: 429 });
  if (!r.ok) { const body = await r.text(); throw new Error(`Pollinations ${r.status}: ${body.slice(0, 120)}`); }
  const contentType = r.headers.get("content-type") || "";
  if (!contentType.includes("image")) throw new Error(`Not an image: ${contentType}`);
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
  } catch (err) { res.status(500).json({ error: "Ошибка сервера при генерации изображения" }); }
});

app.listen(PORT, "0.0.0.0", () => { console.log(`ALMAi server running on port ${PORT}`); });
