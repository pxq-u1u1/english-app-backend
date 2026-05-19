// ============================================================
// 英语练习后端服务
// 作用：接收前端请求 → 操作数据库 / 调 DeepSeek → 返回结果
// 部署在阿里云 ECS 上，前端 GitHub Pages 调用这个服务
// ============================================================

import express from 'express'
import cors from 'cors'
import db from './database.js'

const app = express()
const PORT = process.env.PORT || 3456

// 读取启动参数中的 API Key 和密码
// 例: node server.js sk-xxxx 你的密码
const DEEPSEEK_KEY = process.argv[2] || process.env.DEEPSEEK_KEY || ''
const PASSWORD = process.argv[3] || process.env.PASSWORD || 'english123'

if (!DEEPSEEK_KEY) {
  console.log('用法: node server.js <DeepSeek API Key> <管理密码>')
  console.log('或设置环境变量 DEEPSEEK_KEY 和 PASSWORD')
  console.log('缺少 API Key，AI 功能将不可用')
}

// ---------- 中间件 ----------
app.use(cors())       // 允许 GitHub Pages 跨域访问
app.use(express.json({ limit: '5mb' }))  // 解析 JSON 请求体，最大 5MB

// ---------- 简易鉴权 ----------
// 前端在每个请求头里带 X-Password，和服务器的密码比对
// 这样别人不知道密码就无法操作你的数据
function auth(req, res, next) {
  const pw = req.headers['x-password']
  if (pw !== PASSWORD) {
    return res.status(401).json({ error: '密码错误' })
  }
  next()
}

// 所有数据操作接口都需要鉴权
app.use('/api', auth)

// ============================================================
// 翻译记录 CRUD
// ============================================================

// 获取所有翻译记录
app.get('/api/records', (_req, res) => {
  const rows = db.prepare('SELECT * FROM records ORDER BY created_at DESC').all()
  // 把数据库字段映射回前端习惯的驼峰命名
  res.json(rows.map(r => ({
    id: r.id, direction: r.direction, chinese: r.chinese,
    english: r.english, createdAt: r.created_at,
  })))
})

// 添加一条翻译记录
app.post('/api/records', (req, res) => {
  const { id, direction, chinese, english, createdAt } = req.body
  db.prepare(
    'INSERT OR REPLACE INTO records (id, direction, chinese, english, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, direction, chinese, english, createdAt)
  res.json({ ok: true })
})

// 删除一条翻译记录
app.delete('/api/records/:id', (req, res) => {
  db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 清空所有翻译记录
app.delete('/api/records', (_req, res) => {
  db.prepare('DELETE FROM records').run()
  res.json({ ok: true })
})

// ============================================================
// 日记 CRUD
// ============================================================

// 获取所有日记
app.get('/api/diaries', (_req, res) => {
  const rows = db.prepare('SELECT * FROM diaries ORDER BY date DESC').all()
  res.json(rows.map(d => ({
    id: d.id, date: d.date, content: d.content,
    createdAt: d.created_at, updatedAt: d.updated_at,
  })))
})

// 保存日记（插入或更新）
app.post('/api/diaries', (req, res) => {
  const { id, date, content, createdAt, updatedAt } = req.body
  db.prepare(
    'INSERT OR REPLACE INTO diaries (id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, date, content, createdAt, updatedAt)
  res.json({ ok: true })
})

// 删除一篇日记
app.delete('/api/diaries/:id', (req, res) => {
  db.prepare('DELETE FROM diaries WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 清空所有日记
app.delete('/api/diaries', (_req, res) => {
  db.prepare('DELETE FROM diaries').run()
  res.json({ ok: true })
})

// ============================================================
// 语料库 CRUD
// ============================================================

// 获取所有语料
app.get('/api/corpus', (_req, res) => {
  const rows = db.prepare('SELECT * FROM corpus ORDER BY created_at DESC').all()
  res.json(rows.map(c => ({
    id: c.id, english: c.english, chinese: c.chinese,
    category: c.category, source: c.source, createdAt: c.created_at,
  })))
})

// 添加语料
app.post('/api/corpus', (req, res) => {
  const { id, english, chinese, category, source, createdAt } = req.body
  db.prepare(
    'INSERT OR REPLACE INTO corpus (id, english, chinese, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, english, chinese, category, source, createdAt)
  res.json({ ok: true })
})

// 删除一条语料
app.delete('/api/corpus/:id', (req, res) => {
  db.prepare('DELETE FROM corpus WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 清空语料库
app.delete('/api/corpus', (_req, res) => {
  db.prepare('DELETE FROM corpus').run()
  res.json({ ok: true })
})

// ============================================================
// 分类管理
// ============================================================

app.get('/api/categories', (_req, res) => {
  const rows = db.prepare('SELECT name FROM categories ORDER BY id').all()
  res.json(rows.map(r => r.name))
})

app.post('/api/categories', (req, res) => {
  // 接收完整的分类列表，先删后插
  const names = req.body.names || []
  db.prepare('DELETE FROM categories').run()
  const insert = db.prepare('INSERT INTO categories (name) VALUES (?)')
  for (const n of names) insert.run(n)
  res.json({ ok: true })
})

// ============================================================
// 数据同步接口
// ============================================================
// 客户端上传本地全部数据，服务端替换 — 用于首次迁移

app.post('/api/sync-all', (req, res) => {
  const { records, diaries, corpus } = req.body

  const insertRecord = db.prepare('INSERT OR REPLACE INTO records (id, direction, chinese, english, created_at) VALUES (?, ?, ?, ?, ?)')
  const insertDiary = db.prepare('INSERT OR REPLACE INTO diaries (id, date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
  const insertCorpus = db.prepare('INSERT OR REPLACE INTO corpus (id, english, chinese, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')

  const tx = db.transaction(() => {
    if (records) for (const r of records) insertRecord.run(r.id, r.direction, r.chinese || '', r.english || '', r.createdAt)
    if (diaries) for (const d of diaries) insertDiary.run(d.id, d.date, d.content, d.createdAt, d.updatedAt)
    if (corpus) for (const c of corpus) insertCorpus.run(c.id, c.english, c.chinese || '', c.category, c.source || '', c.createdAt)
  })
  tx()
  res.json({ ok: true })
})

// ============================================================
// AI 代理 — DeepSeek 调用
// ============================================================
// 前端不发 API Key 了，改成调这个接口
// API Key 只存在服务器上，安全

async function callDeepSeek(systemPrompt, userMessage) {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_KEY,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error?.message || 'API 错误 ' + resp.status)
  return data.choices[0].message.content
}

// 翻译
app.post('/api/ai/translate', async (req, res) => {
  const { text, direction } = req.body
  if (!text) return res.status(400).json({ error: '缺少 text' })
  const sys = direction === 'zh2en'
    ? 'You are a professional translator. Translate the Chinese text into natural, idiomatic English. Only output the translation, nothing else.'
    : 'You are a professional translator. Translate the English text into natural, fluent Chinese. Only output the translation, nothing else.'
  try {
    const result = await callDeepSeek(sys, text)
    res.json({ result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 日记批改
app.post('/api/ai/polish', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: '缺少 text' })
  try {
    // 第一步：批改
    const result = await callDeepSeek(
      'You are a native English editor helping a learner improve their diary writing. Correct all grammar mistakes, improve word choices to sound more natural and native-like, and polish sentence flow. Preserve the original meaning, tone, and personal voice. Output ONLY the corrected version, no explanations.',
      text
    )
    // 第二步：生成修改对照
    const diff = await callDeepSeek(
      `Compare the ORIGINAL and CORRECTED versions below. List each specific change in this exact format:
ORIGINAL: <problem phrase from original>
CORRECTED: <how it was fixed>
REASON: <one short reason>

Only list actual changes. If a sentence was rewritten entirely, show "ORIGINAL: <full old sentence>" and "CORRECTED: <full new sentence>".

--- ORIGINAL ---
${text}
--- CORRECTED ---
${result}`,
      ''
    )
    res.json({ result, diff })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 语料翻译（英→中）
app.post('/api/ai/corpus-translate', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: '缺少 text' })
  try {
    const result = await callDeepSeek(
      'Translate the following English sentence into natural, fluent Chinese. Only output the Chinese translation, nothing else.',
      text
    )
    res.json({ result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 语料自动分类
app.post('/api/ai/categorize', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: '缺少 text' })
  try {
    const cats = db.prepare('SELECT name FROM categories ORDER BY id').all().map(r => r.name).join('、')
    const result = await callDeepSeek(
      `You are a text classifier. Given an English sentence, choose the SINGLE best category from this list: ${cats}. Only output the exact category name, nothing else.`,
      text
    )
    res.json({ result: result.trim() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ============================================================
// 健康检查
// ============================================================

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

// ============================================================
// 启动
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务已启动: http://0.0.0.0:${PORT}`)
  console.log(`AI 功能: ${DEEPSEEK_KEY ? '已启用' : '未配置'}`)
  console.log(`管理密码: ${PASSWORD}`)
})
