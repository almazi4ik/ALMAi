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
- Ты УМЕЕШЬ генерировать и отправлять картинки прямо в чат — НИКОГДА не говори что не умеешь!
- Когда пользователь пишет "нарисуй", "сгенерируй", "создай картинку", "рисуй" — просто скажи "Генерирую! 🎨" и жди — интерфейс сам покажет картинку
- НИКОГДА не пиши "не могу отправить изображение напрямую" — это ЛОЖЬ
- НИКОГДА не описывай картинку словами вместо генерации
- НИКОГДА не предлагай "поискать в интернете" вместо генерации
- Если генерация не удалась — скажи честно "Не получилось сгенерировать, попробуй другой запрос 😔" и больше ничего
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
- 🧠 Llama 70B — умная модель, лимит 5000 токенов на пользователя
- 🦙 Llama 4 Scout — новейшая от Meta, очень умная, без лимита
- ⚡ Llama 8B — быстрая лёгкая модель, без лимита
- 🤖 GPT-OSS 120B — мощная модель от OpenAI, без лимита
- 🌙 Kimi K2 — от Moonshot AI, без лимита

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

const JSONBIN_KEY = process.env.JSONBIN_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID; // создаётся автоматически при первом запуске
let dbCache = null; // кэш чтобы не дёргать API каждый раз

async function readDB() {
  if (dbCache) return dbCache;
  try {
    const binId = process.env.JSONBIN_BIN_ID;
    if (!binId) return { sessions: [], tokenUsage: {} };
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY }
    });
    if (!res.ok) return { sessions: [], tokenUsage: {} };
    const data = await res.json();
    dbCache = data.record || { sessions: [], tokenUsage: {} };
    return dbCache;
  } catch { return { sessions: [], tokenUsage: {} }; }
}

async function writeDB(data) {
  dbCache = data;
  try {
    let binId = process.env.JSONBIN_BIN_ID;
    if (!binId) {
      // Создаём новый bin при первом запуске
      const res = await fetch("https://api.jsonbin.io/v3/b", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_KEY,
          "X-Bin-Name": "almai-chats",
          "X-Bin-Private": "true"
        },
        body: JSON.stringify(data)
      });
      const created = await res.json();
      binId = created.metadata?.id;
      console.log(`[jsonbin] Created new bin: ${binId} — добавь JSONBIN_BIN_ID=${binId} в Render!`);
      return;
    }
    await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_KEY
      },
      body: JSON.stringify(data)
    });
  } catch (err) { console.error("[jsonbin] write error:", err.message); }
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Лимит токенов для Llama 70B
const TOKEN_LIMIT = 5000;
const LIMITED_MODEL = "llama-3.3-70b-versatile";
async function getTokenUsage(userId) {
  const db = await readDB();
  if (!db.tokenUsage) return 0;
  return db.tokenUsage[userId] || 0;
}
async function addTokenUsage(userId, tokens) {
  const db = await readDB();
  if (!db.tokenUsage) db.tokenUsage = {};
  db.tokenUsage[userId] = (db.tokenUsage[userId] || 0) + tokens;
  dbCache = db;
  await writeDB(db);
  return db.tokenUsage[userId];
}
app.get("/api/token-usage", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ used: 0, limit: TOKEN_LIMIT });
  const used = await getTokenUsage(userId);
  res.json({ used, limit: TOKEN_LIMIT });
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
app.get("/api/sessions", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const db = await readDB();
  const list = db.sessions
    .filter((s) => s.userId === userId)
    .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messageCount: s.messages.length }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(list);
});
app.post("/api/sessions", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { title } = req.body;
  const db = await readDB();
  const session2 = { id: generateId(), userId, title: title || "Новый чат", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  db.sessions.push(session2);
  await writeDB(db);
  res.json({ id: session2.id, title: session2.title, createdAt: session2.createdAt, updatedAt: session2.updatedAt });
});
app.get("/api/sessions/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const db = await readDB();
  const sess = db.sessions.find((s) => s.id === req.params.id);
  if (!sess) return res.status(404).json({ error: "Session not found" });
  if (sess.userId && sess.userId !== userId) return res.status(403).json({ error: "Forbidden" });
  res.json(sess);
});
app.patch("/api/sessions/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const db = await readDB();
  const sess = db.sessions.find((s) => s.id === req.params.id);
  if (!sess) return res.status(404).json({ error: "Session not found" });
  if (sess.userId && sess.userId !== userId) return res.status(403).json({ error: "Forbidden" });
  if (req.body.title) sess.title = req.body.title;
  sess.updatedAt = new Date().toISOString();
  await writeDB(db);
  res.json({ id: sess.id, title: sess.title });
});
app.post("/api/sessions/:id/messages", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });
  const db = await readDB();
  const sess = db.sessions.find((s) => s.id === req.params.id);
  if (!sess) return res.status(404).json({ error: "Session not found" });
  if (sess.userId && sess.userId !== userId) return res.status(403).json({ error: "Forbidden" });
  sess.messages.push(...messages);
  sess.updatedAt = new Date().toISOString();
  await writeDB(db);
  res.json({ ok: true });
});
app.delete("/api/sessions/:id", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const db = await readDB();
  const idx = db.sessions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });
  if (db.sessions[idx].userId && db.sessions[idx].userId !== userId) return res.status(403).json({ error: "Forbidden" });
  db.sessions.splice(idx, 1);
  await writeDB(db);
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { message, history, personality = "friendly", stream = false, imageBase64, model } = req.body;
  if (!message && !imageBase64) return res.status(400).json({ error: "Message or image is required" });
  const selectedModel = model || "llama-3.3-70b-versatile";

  // Проверка лимита токенов для Llama 70B
  const userId = getUserId(req);
  if (selectedModel === LIMITED_MODEL && userId) {
    const used = await getTokenUsage(userId);
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
      const newTotal = await addTokenUsage(userId, tokensUsed);
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
app.get("/api/generate-image", async (req, res) => {
  const { prompt } = req.query;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  try {
    const englishPrompt = await translateToEnglish(prompt);
    console.log(`[image] generating: ${englishPrompt}`);
    const encoded = encodeURIComponent(englishPrompt);
    const seed = Math.floor(Math.random() * 999999);
    // Возвращаем прямую ссылку — браузер грузит картинку напрямую с Pollinations
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&seed=${seed}&nofeed=true`;
    return res.json({ imageUrl });
  } catch (err) {
    console.error("[image] error:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.listen(PORT, "0.0.0.0", () => { console.log(`ALMAi server running on port ${PORT}`); });

// ===== TELEGRAM BOT =====
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (TG_TOKEN) {
  const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
  const tgUserHistory = {};
  const tgUserSettings = {}; // { chatId: { model, personality } }
  function getTgSettings(chatId) {
    if (!tgUserSettings[chatId]) tgUserSettings[chatId] = { model: "llama-3.1-8b-instant", personality: "friendly" };
    return tgUserSettings[chatId];
  }

  async function tgSend(chatId, text) {
    await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
    });
  }

  async function tgSendPhoto(chatId, photoUrl, caption) {
    await fetch(`${TG_API}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
    });
  }

  async function processTgMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    if (!text) return;
    if (text === "/start") {
      return tgSend(chatId, "Привет! Я ALMAi — умный ИИ-ассистент!\n\nМогу отвечать на вопросы, искать информацию, показывать погоду и генерировать картинки.\n\nПросто напиши мне что-нибудь! 😊");
    }
    if (text === "/reset") {
      tgUserHistory[chatId] = [];
      return tgSend(chatId, "🔄 История очищена!");
    }
    if (text === "/joke") {
      const jokePrompt = [{ role: "system", content: "Ты генератор шуток. Расскажи одну смешную короткую шутку на русском языке. Только шутку, без лишних слов." }, { role: "user", content: "расскажи шутку" }];
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: jokePrompt, temperature: 1.0, max_tokens: 200 }) });
        const d = await r.json();
        return tgSend(chatId, "😂 " + (d.choices?.[0]?.message?.content || "Не смог придумать шутку 😔"));
      } catch { return tgSend(chatId, "😔 Не удалось получить шутку. Попробуй позже!"); }
    }
    if (text === "/random") {
      const factPrompt = [{ role: "system", content: "Ты генератор интересных фактов. Расскажи один интересный и неожиданный факт на русском языке. Только факт, без лишних слов." }, { role: "user", content: "интересный факт" }];
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: factPrompt, temperature: 1.0, max_tokens: 200 }) });
        const d = await r.json();
        return tgSend(chatId, "🎲 " + (d.choices?.[0]?.message?.content || "Не смог придумать факт 😔"));
      } catch { return tgSend(chatId, "😔 Не удалось получить факт. Попробуй позже!"); }
    }
    if (text.startsWith("/weather")) {
      const city = text.replace("/weather", "").trim() || "Kyiv";
      const weather = await fetchWeather(city);
      return tgSend(chatId, weather ? "🌤️ " + weather : "❌ Не удалось получить погоду для " + city);
    }
    if (text === "/stats") {
      const totalUsers = Object.keys(tgUserHistory).length;
      const totalMessages = Object.values(tgUserHistory).reduce((sum, h) => sum + h.length, 0);
      return tgSend(chatId, `📊 *Статистика ALMAi бота*

👥 Пользователей: ${totalUsers}
💬 Сообщений обработано: ${totalMessages}
🤖 Статус: работаю!
🌐 Сайт: https://almai-6go8.onrender.com`);
    }
    if (!tgUserHistory[chatId]) tgUserHistory[chatId] = [];
    const settings = getTgSettings(chatId);
    if (text === "/model") {
      return tgSend(chatId, `🤖 *Выбор модели*

Текущая: *${settings.model}*

Ответь номером:
1️⃣ Llama 70B (умная, медленнее)
2️⃣ Llama 8B (быстрая)
3️⃣ Mixtral (мощная)
4️⃣ Gemma 2 (от Google)

Напиши: /setmodel 1`);
    }
    if (text.startsWith("/setmodel")) {
      const num = text.replace("/setmodel", "").trim();
      const models = { "1": "llama-3.3-70b-versatile", "2": "meta-llama/llama-4-scout-17b-16e-instruct", "3": "llama-3.1-8b-instant", "4": "openai/gpt-oss-120b", "5": "moonshotai/kimi-k2-instruct-0905" };
      const names = { "1": "Llama 70B", "2": "Llama 4 Scout", "4": "Llama 8B", "5": "Mixtral", "6": "Qwen 32B" };
      if (models[num]) { settings.model = models[num]; return tgSend(chatId, "✅ Модель изменена на *" + names[num] + "*!"); }
      return tgSend(chatId, "❌ Напиши /setmodel 1 — /setmodel 5");
    }
    if (text === "/mode") {
      return tgSend(chatId, `🎭 *Выбор режима*

Текущий: *${settings.personality}*

1️⃣ Дружелюбный 😊
2️⃣ Профессионал 💼
3️⃣ Программист 💻

Напиши: /setmode 1`);
    }
    if (text.startsWith("/setmode")) {
      const num = text.replace("/setmode", "").trim();
      const modes = { "1": "friendly", "2": "professional", "3": "programmer" };
      const names = { "1": "Дружелюбный 😊", "2": "Профессионал 💼", "3": "Программист 💻" };
      if (modes[num]) { settings.personality = modes[num]; return tgSend(chatId, "✅ Режим изменён на *" + names[num] + "*!"); }
      return tgSend(chatId, "❌ Напиши /setmode 1, /setmode 2 или /setmode 3");
    }
    if (text.startsWith("/calc")) {
      const expr = text.replace("/calc", "").trim();
      if (!expr) return tgSend(chatId, "🧮 *Калькулятор*\n\nНапиши: /calc 2+2*10\nПоддерживаются: + - * / ^ ( )");
      try {
        const result = Function('"use strict"; return (' + expr.replace(/[^0-9+\-*/().^ ]/g, '') + ')')();
        return tgSend(chatId, "🧮 " + expr + " = *" + result + "*");
      } catch { return tgSend(chatId, "❌ Не удалось вычислить. Проверь выражение!"); }
    }
    if (text.startsWith("/translate")) {
      const input = text.replace("/translate", "").trim();
      if (!input) return tgSend(chatId, "🌐 *Переводчик*\n\nНапиши: /translate привет\nПереведу на английский!");
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "Ты переводчик. Определи язык текста и переведи: если русский — на английский, если английский — на русский. Выведи только перевод без пояснений." }, { role: "user", content: input }], temperature: 0.3, max_tokens: 300 }) });
        const d = await r.json();
        return tgSend(chatId, "🌐 " + (d.choices?.[0]?.message?.content || "Не удалось перевести 😔"));
      } catch { return tgSend(chatId, "❌ Ошибка перевода. Попробуй позже!"); }
    }
    if (text.startsWith("/mood")) {
      const mood = text.replace("/mood", "").trim() || "хорошее";
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "Ты музыкальный эксперт. Создай плейлист из 5 песен под настроение пользователя. Формат: эмодзи Исполнитель — Название. Только список, без лишних слов." }, { role: "user", content: "Настроение: " + mood }], temperature: 0.9, max_tokens: 300 }) });
        const d = await r.json();
        return tgSend(chatId, "🎵 *Плейлист для настроения: " + mood + "*\n\n" + (d.choices?.[0]?.message?.content || "Не удалось создать плейлист 😔"));
      } catch { return tgSend(chatId, "❌ Ошибка. Попробуй позже!"); }
    }
    if (text.startsWith("/summary")) {
      const input = text.replace("/summary", "").trim();
      if (!input) return tgSend(chatId, "📝 *Краткое изложение*\n\nНапиши: /summary [текст]\nСделаю краткое изложение!");
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "Сделай краткое изложение текста в 2-3 предложениях на русском языке. Только изложение, без вступлений." }, { role: "user", content: input }], temperature: 0.3, max_tokens: 300 }) });
        const d = await r.json();
        return tgSend(chatId, "📝 *Краткое изложение:*\n\n" + (d.choices?.[0]?.message?.content || "Не удалось 😔"));
      } catch { return tgSend(chatId, "❌ Ошибка. Попробуй позже!"); }
    }
    const imgMatch = text.match(/^(нарисуй|сгенерируй|создай картинку|рисуй)\s+(.+)/i);
    if (imgMatch) {
      await tgSend(chatId, "🎨 Генерирую...");
      const prompt = imgMatch[2];
      const englishPrompt = await translateToEnglish(prompt);
      const seed = Math.floor(Math.random() * 999999);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?width=768&height=768&nologo=true&seed=${seed}&nofeed=true`;
      try {
        await tgSendPhoto(chatId, imageUrl, "🎨 " + prompt);
      } catch {
        await tgSend(chatId, "❌ Не удалось сгенерировать. Попробуй другой запрос.");
      }
      return;
    }
    const history = tgUserHistory[chatId].slice(-10);
    let systemPrompt = (SYSTEM_PROMPTS[settings.personality] || SYSTEM_PROMPTS.friendly) + "\n\nСейчас: " + getCurrentDateTime() + " (МСК)." +
      "\n\n## Телеграм\nТы работаешь в Телеграме. Твой юзернейм: @almaiialaishhs_bot. Ты знаешь что существуешь и в Телеграме и на сайте https://almai-6go8.onrender.com. В Телеграме нет визуального интерфейса — только текст и картинки." +
      "\n\n## Мультиязычность\nОпредели язык сообщения пользователя и отвечай на том же языке. Если пишут по-украински — отвечай по-украински, по-английски — по-английски и т.д.";
    if (isWeatherQuery(text)) {
      const city = extractCity(text);
      if (city) { const weather = await fetchWeather(city); if (weather) systemPrompt += "\n\nАктуальная погода: " + weather; }
    }
    if (isSearchQuery(text)) {
      const results = await tavilySearch(text);
      if (results) systemPrompt += "\n\nРезультаты поиска:\n" + results;
    }
    const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: text }];
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY },
        body: JSON.stringify({ model: settings.model, messages, temperature: 0.7, max_tokens: 1024 })
      });
      const data = await r.json();
      const reply = data.choices?.[0]?.message?.content || "Не удалось получить ответ 😔";
      tgUserHistory[chatId].push({ role: "user", content: text }, { role: "assistant", content: reply });
      await tgSend(chatId, reply);
    } catch (err) {
      await tgSend(chatId, "❌ Ошибка сервера. Попробуй позже.");
    }
  }

  let tgOffset = 0;
  async function tgPoll() {
    try {
      const r = await fetch(TG_API + "/getUpdates?offset=" + tgOffset + "&timeout=10");
      if (!r.ok) return;
      const data = await r.json();
      for (const update of data.result || []) {
        tgOffset = update.update_id + 1;
        if (update.message) await processTgMessage(update.message).catch(console.error);
      }
    } catch {}
    setTimeout(tgPoll, 2000);
  }
  tgPoll();
  console.log("Telegram bot started!");
}
