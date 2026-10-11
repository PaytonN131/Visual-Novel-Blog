'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'catalog.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL DEFAULT '',
  alt_titles TEXT NOT NULL DEFAULT '',
  developer TEXT NOT NULL DEFAULT '',
  release_date TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  store_url TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),

  tr_status TEXT NOT NULL DEFAULT 'no_verificado'
    CHECK (tr_status IN ('disponible','parcial','en_desarrollo','no_disponible','no_verificado')),
  tr_group TEXT NOT NULL DEFAULT '',
  tr_notes TEXT NOT NULL DEFAULT '',
  tr_url TEXT NOT NULL DEFAULT '',

  adult_status TEXT NOT NULL DEFAULT 'no_verificado'
    CHECK (adult_status IN ('si','no','no_verificado')),
  adult_notes TEXT NOT NULL DEFAULT '',

  luna_status TEXT NOT NULL DEFAULT 'no_verificado'
    CHECK (luna_status IN ('compatible','incompatible','no_verificado')),
  luna_config TEXT NOT NULL DEFAULT '',

  ach_status TEXT NOT NULL DEFAULT 'no_verificado'
    CHECK (ach_status IN ('si','no','no_verificado')),

  cards_normal_status TEXT NOT NULL DEFAULT 'no_verificado'
    CHECK (cards_normal_status IN ('si','no','no_verificado')),
  emoticons_image TEXT NOT NULL DEFAULT '',
  badge_image TEXT NOT NULL DEFAULT '',
  badge_foil_image TEXT NOT NULL DEFAULT '',

  price_url TEXT NOT NULL DEFAULT '',
  price_notes TEXT NOT NULL DEFAULT '',

  route_common_status TEXT NOT NULL DEFAULT 'no_verificado'
    CHECK (route_common_status IN ('si','no','no_verificado')),
  guide_image TEXT NOT NULL DEFAULT '',
  guide_desc TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_catalog ON games (published, title COLLATE NOCASE);

-- kind: 'screenshot' (galería), 'luna' (evidencias de LunaTranslator), 'wallpaper' (fondos de pantalla)
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'screenshot',
  filename TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'normal',
  name TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  price REAL CHECK (price IS NULL OR price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cards_game ON cards (game_id, type, sort_order);

-- Guía de rutas creada desde el panel.
-- section: 'common' (ruta común, máximo una), 'heroine' (heroínas), 'sub' (subrutas), 'bad' (bad endings)
CREATE TABLE IF NOT EXISTS route_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('common','heroine','sub','bad')),
  title TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_routes_game ON route_entries (game_id, section, sort_order);

-- Precios informativos por país (LATAM)
-- regular = precio habitual, sale = último precio con descuento, lowest = precio con descuento más bajo
CREATE TABLE IF NOT EXISTS game_prices (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  region TEXT NOT NULL CHECK (region IN ('pen','usd','clp','mxn','cop','uyu')),
  regular REAL CHECK (regular IS NULL OR regular > 0),
  sale REAL CHECK (sale IS NULL OR sale >= 0),
  lowest REAL CHECK (lowest IS NULL OR lowest >= 0),
  PRIMARY KEY (game_id, region)
);
`);

// ---- Migración: si ya tenías una base de datos de la versión anterior, añade lo nuevo ----
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('games', 'tr_group', "TEXT NOT NULL DEFAULT ''");
addColumn('games', 'emoticons_image', "TEXT NOT NULL DEFAULT ''");
addColumn('games', 'badge_image', "TEXT NOT NULL DEFAULT ''");
addColumn('games', 'badge_foil_image', "TEXT NOT NULL DEFAULT ''");
addColumn('games', 'adult_status', "TEXT NOT NULL DEFAULT 'no_verificado'");
addColumn('games', 'adult_notes', "TEXT NOT NULL DEFAULT ''");
addColumn('games', 'route_common_status', "TEXT NOT NULL DEFAULT 'no_verificado'");
addColumn('gallery', 'kind', "TEXT NOT NULL DEFAULT 'screenshot'");

db.exec('CREATE INDEX IF NOT EXISTS idx_gallery_game ON gallery (game_id, kind, sort_order)');

module.exports = db;
