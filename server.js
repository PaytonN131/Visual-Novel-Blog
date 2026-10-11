'use strict';
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// ---------- Configuración ----------
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 8;
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (ADMIN_PASSWORD.length < 12) {
  console.error('Falta ADMIN_PASSWORD en el archivo .env (mínimo 12 caracteres).');
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error('Falta SESSION_SECRET en el archivo .env (mínimo 32 caracteres).');
  process.exit(1);
}

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const ADMIN_HASH = sha(ADMIN_PASSWORD);

// ---------- Utilidades ----------
function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function toId(v) {
  if (!/^\d+$/.test(String(v))) throw httpErr(404, 'No encontrado.');
  return parseInt(v, 10);
}

function discount(regular, sale) {
  if (regular != null && regular > 0 && sale != null && sale >= 0 && sale < regular) {
    return Math.round(((regular - sale) / regular) * 10000) / 100;
  }
  return null;
}

const KINDS = ['screenshot', 'luna', 'wallpaper'];
const REGIONS = ['pen', 'usd', 'clp', 'mxn', 'cop', 'uyu'];
const REGION_LABELS = {
  pen: 'Soles (Perú)',
  usd: 'LATAM – U.S. Dollar',
  clp: 'Pesos chilenos',
  mxn: 'Pesos mexicanos',
  cop: 'Pesos colombianos',
  uyu: 'Pesos uruguayos',
};

function fullGame(id, isAdmin) {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!g) return null;
  if (!g.published && !isAdmin) return null;
  const media = db.prepare('SELECT id, filename, caption, sort_order FROM gallery WHERE game_id = ? AND kind = ? ORDER BY sort_order, id');
  g.gallery = media.all(id, 'screenshot');
  g.luna_images = media.all(id, 'luna');
  g.wallpapers = media.all(id, 'wallpaper');
  g.cards_normal = db
    .prepare("SELECT id, name, image, price, currency, sort_order FROM cards WHERE game_id = ? AND type = 'normal' ORDER BY sort_order, id")
    .all(id);
  g.routes = db
    .prepare('SELECT id, section, title, image, options, note, sort_order FROM route_entries WHERE game_id = ? ORDER BY sort_order, id')
    .all(id);
  g.prices = db
    .prepare('SELECT region, regular, sale, lowest FROM game_prices WHERE game_id = ?')
    .all(id)
    .map((p) => ({ ...p, discount: discount(p.regular, p.sale), lowest_discount: discount(p.regular, p.lowest) }));
  return g;
}

function ensureGame(id) {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!g) throw httpErr(404, 'La novela no existe.');
  return g;
}

function nextOrder(table, where, params) {
  return db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table} WHERE ${where}`).get(...params).n;
}

function moveItem(table, scopeSql, scopeParams, id, dir) {
  const ids = db.prepare(`SELECT id FROM ${table} WHERE ${scopeSql} ORDER BY sort_order, id`).all(...scopeParams).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const upd = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  db.transaction(() => ids.forEach((x, k) => upd.run(k, x)))();
}

// ---------- Imágenes ----------
function detectExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

// Comprueba el tipo REAL del archivo (por su contenido) y que coincida con la extensión.
function checkImage(file) {
  const real = detectExt(file.buffer);
  const given = path.extname(file.originalname || '').toLowerCase().replace('.', '').replace('jpeg', 'jpg');
  if (!real || given !== real) {
    throw httpErr(400, `«${file.originalname}» no es una imagen válida. Solo se admiten JPG, PNG o WebP.`);
  }
  return real;
}

function writeImage(file, ext) {
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx' });
  return name;
}

function saveImage(file) {
  return writeImage(file, checkImage(file));
}

function removeFile(name) {
  if (!name || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(name)) return;
  fs.unlink(path.join(UPLOAD_DIR, name), () => {});
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 20 },
});

// ---------- Validación de datos de juegos ----------
const NAMES = {
  title: 'Nombre', original_title: 'Título original', alt_titles: 'Títulos alternativos',
  developer: 'Desarrolladora', genres: 'Géneros', description: 'Descripción',
  adult_notes: 'Observación del parche +18', tr_group: 'Grupo que tradujo', tr_notes: 'Observaciones de la traducción',
  luna_config: 'Observaciones de LunaTranslator', price_notes: 'Notas del precio',
  store_url: 'Enlace a la tienda', tr_url: 'Enlace del grupo o parche',
  release_date: 'Fecha de lanzamiento en Steam',
};
const TEXT = {
  title: 200, original_title: 200, alt_titles: 1000, developer: 200, genres: 500, description: 20000,
  adult_notes: 3000, tr_group: 200, tr_notes: 5000, luna_config: 10000, price_notes: 2000,
};
const URLS = ['store_url', 'tr_url'];
const DATES = ['release_date'];
const ENUMS = {
  tr_status: ['disponible', 'parcial', 'en_desarrollo', 'no_disponible', 'no_verificado'],
  adult_status: ['si', 'no', 'no_verificado'],
  luna_status: ['compatible', 'incompatible', 'no_verificado'],
  ach_status: ['si', 'no', 'no_verificado'],
  cards_normal_status: ['si', 'no', 'no_verificado'],
  route_common_status: ['si', 'no', 'no_verificado'],
};

function parseMoney(v, label, errors) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1000000000) {
    errors.push(`${label}: introduce un número válido que no sea negativo.`);
    return null;
  }
  return Math.round(n * 100) / 100;
}

function cleanGameInput(body) {
  const out = {};
  const errors = [];

  for (const [k, max] of Object.entries(TEXT)) {
    if (k in body) {
      const v = String(body[k] ?? '').replace(/\r\n/g, '\n').trim();
      if (v.length > max) errors.push(`${NAMES[k]}: máximo ${max} caracteres.`);
      out[k] = v;
    }
  }
  if ('title' in out && !out.title) errors.push('El nombre es obligatorio.');

  for (const k of URLS) {
    if (k in body) {
      const v = String(body[k] ?? '').trim();
      if (v && (!/^https?:\/\/\S+$/i.test(v) || v.length > 500)) errors.push(`${NAMES[k]}: debe empezar por http:// o https://`);
      out[k] = v;
    }
  }
  for (const k of DATES) {
    if (k in body) {
      const v = String(body[k] ?? '').trim();
      if (v) {
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
        if (!ok) errors.push(`${NAMES[k]}: fecha no válida.`);
      }
      out[k] = v;
    }
  }
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (k in body) {
      if (!allowed.includes(body[k])) errors.push(`Valor no válido en «${k}».`);
      else out[k] = body[k];
    }
  }
  if ('published' in body) {
    out.published = [true, 1, '1', 'true', 'on'].includes(body.published) ? 1 : 0;
  }

  if (errors.length) throw httpErr(400, errors.join(' '));
  return out;
}

function cleanCardInput(body) {
  const errors = [];
  const name = String(body.name ?? '').trim();
  if (!name) errors.push('El nombre del cromo es obligatorio.');
  if (name.length > 200) errors.push('El nombre del cromo admite 200 caracteres como máximo.');
  const price = parseMoney(body.price, 'Precio del cromo', errors);
  const currency = String(body.currency ?? '').trim().toUpperCase() || 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('Moneda del cromo: usa un código de 3 letras, por ejemplo USD.');
  if (errors.length) throw httpErr(400, errors.join(' '));
  return { name, price, currency };
}

// ---------- Aplicación ----------
const app = express();
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(
  session({
    secret: SESSION_SECRET,
    name: 'vn.sid',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 1000 * 60 * 60 * 8 },
  })
);

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
  next();
}

// ----- Sesión de administrador -----
const attempts = new Map();
function isBlocked(ip) {
  const a = attempts.get(ip);
  return !!(a && a.until > Date.now());
}
function registerFail(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  if (a.until && a.until <= Date.now()) { a.count = 0; a.until = 0; }
  a.count += 1;
  if (a.count >= 5) { a.until = Date.now() + 15 * 60 * 1000; a.count = 0; }
  attempts.set(ip, a);
}

app.post('/api/login', (req, res, next) => {
  const ip = req.ip;
  if (isBlocked(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const given = String((req.body || {}).password ?? '');
  if (!crypto.timingSafeEqual(sha(given), ADMIN_HASH)) {
    registerFail(ip);
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  attempts.delete(ip);
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.admin = true;
    res.json({ ok: true });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('vn.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireAdmin, (req, res) => res.json({ admin: true }));

// ----- API pública -----
app.get('/api/games', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const q = String(req.query.q || '').trim().slice(0, 100);
  const per = 12;
  const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
  const where = "published = 1 AND (title LIKE @like ESCAPE '\\' OR original_title LIKE @like ESCAPE '\\' OR alt_titles LIKE @like ESCAPE '\\')";
  const total = db.prepare(`SELECT COUNT(*) AS c FROM games WHERE ${where}`).get({ like }).c;
  const games = db
    .prepare(`SELECT id, title, cover FROM games WHERE ${where} ORDER BY title COLLATE NOCASE LIMIT @per OFFSET @off`)
    .all({ like, per, off: (page - 1) * per });
  res.json({ games, page, pages: Math.max(1, Math.ceil(total / per)), total });
});

app.get('/api/games/:id', (req, res) => {
  const g = fullGame(toId(req.params.id), !!(req.session && req.session.admin));
  if (!g) return res.status(404).json({ error: 'Novela no encontrada.' });
  res.json(g);
});

// ----- API de administración: juegos -----
app.get('/api/admin/games', requireAdmin, (req, res) => {
  const games = db.prepare('SELECT id, title, cover, published FROM games ORDER BY id DESC').all();
  res.json({ games });
});

app.post('/api/admin/games', requireAdmin, (req, res) => {
  const title = String((req.body || {}).title ?? '').trim();
  if (!title) throw httpErr(400, 'El nombre es obligatorio.');
  if (title.length > 200) throw httpErr(400, 'El nombre admite 200 caracteres como máximo.');
  const r = db.prepare('INSERT INTO games (title) VALUES (?)').run(title);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/games/:id', requireAdmin, (req, res) => {
  const id = toId(req.params.id);
  ensureGame(id);
  const data = cleanGameInput(req.body || {});
  const keys = Object.keys(data);
  if (keys.length) {
    const sets = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE games SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id });
  }
  res.json(fullGame(id, true));
});

app.delete('/api/admin/games/:id', requireAdmin, (req, res) => {
  const id = toId(req.params.id);
  const g = ensureGame(id);
  const files = [
    g.cover,
    g.guide_image,
    g.emoticons_image,
    g.badge_image,
    g.badge_foil_image,
    ...db.prepare('SELECT filename FROM gallery WHERE game_id = ?').all(id).map((r) => r.filename),
    ...db.prepare('SELECT image FROM cards WHERE game_id = ?').all(id).map((r) => r.image),
    ...db.prepare('SELECT image FROM route_entries WHERE game_id = ?').all(id).map((r) => r.image),
  ];
  db.prepare('DELETE FROM games WHERE id = ?').run(id); // borra también galería y cromos (ON DELETE CASCADE)
  files.forEach(removeFile);
  res.json({ ok: true });
});

// ----- Imágenes únicas: portada, emoticones, insignia e insignia reflectante -----
const IMAGE_SLOTS = { cover: 'cover', emoticons: 'emoticons_image', badge: 'badge_image', badge_foil: 'badge_foil_image' };
function slotColumn(req) {
  const col = IMAGE_SLOTS[req.params.slot];
  if (!col) throw httpErr(404, 'No encontrado.');
  return col; // solo puede ser una de las columnas de la lista, nunca texto del usuario
}

app.post('/api/admin/games/:id/image/:slot', requireAdmin, upload.single('image'), (req, res) => {
  const id = toId(req.params.id);
  const column = slotColumn(req);
  const g = ensureGame(id);
  if (!req.file) throw httpErr(400, 'Selecciona una imagen.');
  const filename = saveImage(req.file);
  try {
    db.prepare(`UPDATE games SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).run(filename, id);
  } catch (e) {
    removeFile(filename);
    throw e;
  }
  removeFile(g[column]);
  res.json(fullGame(id, true));
});

app.delete('/api/admin/games/:id/image/:slot', requireAdmin, (req, res) => {
  const id = toId(req.params.id);
  const column = slotColumn(req);
  if (column === 'cover') throw httpErr(400, 'La portada solo se puede reemplazar.');
  const g = ensureGame(id);
  db.prepare(`UPDATE games SET ${column} = '', updated_at = datetime('now') WHERE id = ?`).run(id);
  removeFile(g[column]);
  res.json(fullGame(id, true));
});

// ----- Galería, evidencias de LunaTranslator y fondos de pantalla (campo «kind») -----
function getKind(req) {
  const k = String(req.query.kind || 'screenshot');
  if (!KINDS.includes(k)) throw httpErr(400, 'Tipo de imagen no válido.');
  return k;
}

function getGalleryItem(id) {
  const it = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
  if (!it) throw httpErr(404, 'Imagen no encontrada.');
  return it;
}

app.post('/api/admin/games/:id/gallery', requireAdmin, upload.array('images', 20), (req, res) => {
  const id = toId(req.params.id);
  ensureGame(id);
  const kind = getKind(req);
  const files = req.files || [];
  if (!files.length) throw httpErr(400, 'Selecciona al menos una imagen.');
  const exts = files.map(checkImage); // valida todas antes de guardar ninguna
  let order = nextOrder('gallery', 'game_id = ? AND kind = ?', [id, kind]);
  const ins = db.prepare('INSERT INTO gallery (game_id, kind, filename, sort_order) VALUES (?, ?, ?, ?)');
  const saved = [];
  try {
    files.forEach((f, i) => {
      const name = writeImage(f, exts[i]);
      saved.push(name);
      ins.run(id, kind, name, order++);
    });
  } catch (e) {
    saved.forEach(removeFile);
    throw e;
  }
  res.status(201).json(fullGame(id, true));
});

app.put('/api/admin/gallery/:id', requireAdmin, (req, res) => {
  const it = getGalleryItem(toId(req.params.id));
  const caption = String((req.body || {}).caption ?? '').trim();
  if (caption.length > 300) throw httpErr(400, 'La descripción admite 300 caracteres como máximo.');
  db.prepare('UPDATE gallery SET caption = ? WHERE id = ?').run(caption, it.id);
  res.json(fullGame(it.game_id, true));
});

app.post('/api/admin/gallery/:id/replace', requireAdmin, upload.single('image'), (req, res) => {
  const it = getGalleryItem(toId(req.params.id));
  if (!req.file) throw httpErr(400, 'Selecciona una imagen.');
  const filename = saveImage(req.file);
  try {
    db.prepare('UPDATE gallery SET filename = ? WHERE id = ?').run(filename, it.id);
  } catch (e) {
    removeFile(filename);
    throw e;
  }
  removeFile(it.filename);
  res.json(fullGame(it.game_id, true));
});

app.post('/api/admin/gallery/:id/move', requireAdmin, (req, res) => {
  const it = getGalleryItem(toId(req.params.id));
  const dir = (req.body || {}).direction;
  if (dir !== 'up' && dir !== 'down') throw httpErr(400, 'Dirección no válida.');
  moveItem('gallery', 'game_id = ? AND kind = ?', [it.game_id, it.kind], it.id, dir);
  res.json(fullGame(it.game_id, true));
});

app.delete('/api/admin/gallery/:id', requireAdmin, (req, res) => {
  const it = getGalleryItem(toId(req.params.id));
  db.prepare('DELETE FROM gallery WHERE id = ?').run(it.id);
  removeFile(it.filename);
  res.json(fullGame(it.game_id, true));
});

// ----- Cromos -----
function getCard(id) {
  const c = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!c) throw httpErr(404, 'Cromo no encontrado.');
  return c;
}

app.post('/api/admin/games/:id/cards', requireAdmin, upload.single('image'), (req, res) => {
  const id = toId(req.params.id);
  ensureGame(id);
  const data = cleanCardInput(req.body || {});
  if (!req.file) throw httpErr(400, 'Selecciona la imagen del cromo.');
  const filename = saveImage(req.file);
  try {
    const order = nextOrder('cards', "game_id = ? AND type = 'normal'", [id]);
    db.prepare("INSERT INTO cards (game_id, type, name, image, price, currency, sort_order) VALUES (?, 'normal', ?, ?, ?, ?, ?)")
      .run(id, data.name, filename, data.price, data.currency, order);
  } catch (e) {
    removeFile(filename);
    throw e;
  }
  res.status(201).json(fullGame(id, true));
});

app.put('/api/admin/cards/:id', requireAdmin, upload.single('image'), (req, res) => {
  const card = getCard(toId(req.params.id));
  const data = cleanCardInput(req.body || {});
  let filename = card.image;
  if (req.file) filename = saveImage(req.file);
  try {
    db.prepare('UPDATE cards SET name = ?, price = ?, currency = ?, image = ? WHERE id = ?')
      .run(data.name, data.price, data.currency, filename, card.id);
  } catch (e) {
    if (req.file) removeFile(filename);
    throw e;
  }
  if (req.file) removeFile(card.image);
  res.json(fullGame(card.game_id, true));
});

app.post('/api/admin/cards/:id/move', requireAdmin, (req, res) => {
  const card = getCard(toId(req.params.id));
  const dir = (req.body || {}).direction;
  if (dir !== 'up' && dir !== 'down') throw httpErr(400, 'Dirección no válida.');
  moveItem('cards', 'game_id = ? AND type = ?', [card.game_id, card.type], card.id, dir);
  res.json(fullGame(card.game_id, true));
});

app.delete('/api/admin/cards/:id', requireAdmin, (req, res) => {
  const card = getCard(toId(req.params.id));
  db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
  removeFile(card.image);
  res.json(fullGame(card.game_id, true));
});

// ----- Guía de rutas (ruta común, heroínas, subrutas y bad endings) -----
const ROUTE_SECTIONS = ['common', 'heroine', 'sub', 'bad'];

function cleanRouteInput(body, section) {
  const errors = [];
  const title = section === 'common' ? '' : String(body.title ?? '').trim();
  const options = String(body.options ?? '').replace(/\r\n/g, '\n').trim();
  const note = String(body.note ?? '').replace(/\r\n/g, '\n').trim();
  if (title.length > 200) errors.push('El nombre admite 200 caracteres como máximo.');
  if (options.length > 8000) errors.push('Las opciones correctas admiten 8000 caracteres como máximo.');
  if (note.length > 3000) errors.push('La observación admite 3000 caracteres como máximo.');
  if (errors.length) throw httpErr(400, errors.join(' '));
  return { title, options, note };
}

function getRoute(id) {
  const r = db.prepare('SELECT * FROM route_entries WHERE id = ?').get(id);
  if (!r) throw httpErr(404, 'Ruta no encontrada.');
  return r;
}

app.post('/api/admin/games/:id/routes', requireAdmin, upload.single('image'), (req, res) => {
  const id = toId(req.params.id);
  ensureGame(id);
  const section = (req.body || {}).section;
  if (!ROUTE_SECTIONS.includes(section)) throw httpErr(400, 'Tipo de ruta no válido.');
  const data = cleanRouteInput(req.body || {}, section);
  if (!req.file && !data.options) throw httpErr(400, 'Añade una imagen o las opciones correctas.');
  if (section === 'common' && db.prepare("SELECT 1 FROM route_entries WHERE game_id = ? AND section = 'common'").get(id)) {
    throw httpErr(400, 'La ruta común ya existe. Edítala en lugar de crear otra.');
  }
  const filename = req.file ? saveImage(req.file) : '';
  try {
    const order = nextOrder('route_entries', 'game_id = ? AND section = ?', [id, section]);
    db.prepare('INSERT INTO route_entries (game_id, section, title, image, options, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, section, data.title, filename, data.options, data.note, order);
  } catch (e) {
    removeFile(filename);
    throw e;
  }
  res.status(201).json(fullGame(id, true));
});

app.put('/api/admin/routes/:id', requireAdmin, upload.single('image'), (req, res) => {
  const route = getRoute(toId(req.params.id));
  const data = cleanRouteInput(req.body || {}, route.section);
  const newFile = req.file ? saveImage(req.file) : '';
  const image = newFile || route.image;
  if (!image && !data.options) {
    removeFile(newFile);
    throw httpErr(400, 'Deja al menos una imagen o las opciones correctas.');
  }
  try {
    db.prepare('UPDATE route_entries SET title = ?, image = ?, options = ?, note = ? WHERE id = ?')
      .run(data.title, image, data.options, data.note, route.id);
  } catch (e) {
    removeFile(newFile);
    throw e;
  }
  if (newFile) removeFile(route.image);
  res.json(fullGame(route.game_id, true));
});

app.post('/api/admin/routes/:id/move', requireAdmin, (req, res) => {
  const route = getRoute(toId(req.params.id));
  const dir = (req.body || {}).direction;
  if (dir !== 'up' && dir !== 'down') throw httpErr(400, 'Dirección no válida.');
  moveItem('route_entries', 'game_id = ? AND section = ?', [route.game_id, route.section], route.id, dir);
  res.json(fullGame(route.game_id, true));
});

app.delete('/api/admin/routes/:id', requireAdmin, (req, res) => {
  const route = getRoute(toId(req.params.id));
  db.prepare('DELETE FROM route_entries WHERE id = ?').run(route.id);
  removeFile(route.image);
  res.json(fullGame(route.game_id, true));
});

// ----- Precios informativos por país -----
app.put('/api/admin/games/:id/prices', requireAdmin, (req, res) => {
  const id = toId(req.params.id);
  ensureGame(id);
  const input = (req.body || {}).prices;
  if (!input || typeof input !== 'object') throw httpErr(400, 'Datos de precios no válidos.');

  const errors = [];
  const rows = [];
  for (const code of REGIONS) {
    const p = input[code] || {};
    const label = REGION_LABELS[code];
    const regular = parseMoney(p.regular, `${label}: precio habitual`, errors);
    const sale = parseMoney(p.sale, `${label}: precio con descuento más reciente`, errors);
    const lowest = parseMoney(p.lowest, `${label}: precio con descuento más bajo`, errors);
    if (regular !== null && !(regular > 0)) errors.push(`${label}: el precio habitual debe ser mayor que cero.`);
    if (sale !== null && regular !== null && !(sale < regular)) {
      errors.push(`${label}: el precio con descuento más reciente debe ser inferior al habitual.`);
    }
    if (lowest !== null && regular !== null && !(lowest < regular)) {
      errors.push(`${label}: el precio con descuento más bajo debe ser inferior al habitual.`);
    }
    if (lowest !== null && sale !== null && lowest > sale) {
      errors.push(`${label}: el precio con descuento más bajo no puede ser mayor que el precio con descuento más reciente.`);
    }
    rows.push([code, regular, sale, lowest]);
  }
  if (errors.length) throw httpErr(400, errors.join(' '));

  const del = db.prepare('DELETE FROM game_prices WHERE game_id = ?');
  const ins = db.prepare('INSERT INTO game_prices (game_id, region, regular, sale, lowest) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => {
    del.run(id);
    rows.forEach((r) => {
      if (r[1] !== null || r[2] !== null || r[3] !== null) ins.run(id, ...r);
    });
  })();
  res.json(fullGame(id, true));
});

// ----- Archivos estáticos -----
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));

// ----- Gestión central de errores -----
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `El archivo supera el límite de ${MAX_MB} MB.` });
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Demasiados archivos o campo no válido.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos no válidos.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  console.log(`Panel de administración: http://localhost:${PORT}/admin.html`);
});
