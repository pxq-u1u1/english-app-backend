// ============================================================
// 数据库模块 — 用 SQLite 存储所有数据
// SQLite 就是一个文件，不需要安装数据库软件
// 重启服务器数据不会丢，文件一直存在
// ============================================================

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 数据文件就存在项目目录下的 data.db
const db = new Database(path.join(__dirname, 'data.db'))

// 开启 WAL 模式，读写更快
db.pragma('journal_mode = WAL')

// ---------- 建表 ----------
// 只在表不存在时创建，所以重启不会清空数据

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id         TEXT PRIMARY KEY,
    direction  TEXT NOT NULL,
    chinese    TEXT DEFAULT '',
    english    TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS diaries (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS corpus (
    id         TEXT PRIMARY KEY,
    english    TEXT NOT NULL,
    chinese    TEXT DEFAULT '',
    category   TEXT NOT NULL,
    source     TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- 默认分类
  INSERT OR IGNORE INTO categories (name) VALUES
    ('职场'), ('日常'), ('社交'), ('旅游'), ('美食'),
    ('科技'), ('学术'), ('情感'), ('其他');
`)

export default db
