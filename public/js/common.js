'use strict';

// Escapa texto para insertarlo de forma segura en HTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Etiquetas y colores de cada estado.
const LABELS = {
  tr: {
    disponible: ['Disponible', 'ok'],
    parcial: ['Parcial', 'warn'],
    en_desarrollo: ['En desarrollo', 'info'],
    no_disponible: ['No disponible', 'bad'],
    no_verificado: ['No verificado', 'unk'],
  },
  adult: {
    si: ['Sí necesita parche', 'warn'],
    no: ['No necesita parche', 'ok'],
    no_verificado: ['No verificado', 'unk'],
  },
  luna: {
    compatible: ['Compatible', 'ok'],
    incompatible: ['No compatible', 'bad'],
    no_verificado: ['Sin verificar', 'unk'],
  },
  ach: {
    si: ['Tiene logros', 'ok'],
    no: ['No tiene logros', 'neutral'],
    no_verificado: ['No verificado', 'unk'],
  },
  cards: {
    si: ['Tiene cromos', 'ok'],
    no: ['No tiene cromos', 'neutral'],
    no_verificado: ['No verificado', 'unk'],
  },
};

// Regiones de precios (LATAM). El código coincide con el del servidor.
const REGIONS = [
  { code: 'pen', label: 'Soles (Perú)', currency: 'PEN' },
  { code: 'usd', label: 'LATAM – U.S. Dollar', currency: 'USD' },
  { code: 'clp', label: 'Pesos chilenos', currency: 'CLP' },
  { code: 'mxn', label: 'Pesos mexicanos', currency: 'MXN' },
  { code: 'cop', label: 'Pesos colombianos', currency: 'COP' },
  { code: 'uyu', label: 'Pesos uruguayos', currency: 'UYU' },
];

function badge(group, key) {
  const [text, cls] = LABELS[group][key] || LABELS[group].no_verificado;
  return `<span class="badge badge-${cls}">${esc(text)}</span>`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin cuerpo JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function money(v, cur) {
  if (v === null || v === undefined || v === '') return '';
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency: cur }).format(v);
  } catch (e) {
    return `${v} ${cur}`;
  }
}

function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
function imgUrl(f) { return '/uploads/' + encodeURIComponent(f); }
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// Ampliación de imágenes a pantalla completa.
function openLightbox(src, alt) {
  let box = document.getElementById('lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.className = 'lightbox';
    box.innerHTML =
      '<button type="button" class="lb-close" aria-label="Cerrar">×</button>' +
      '<img alt="">' +
      '<a class="lb-open" target="_blank" rel="noopener">Abrir en una pestaña nueva</a>';
    document.body.appendChild(box);
    box.addEventListener('click', (e) => { if (e.target.tagName !== 'A') box.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('open'); });
  }
  const img = box.querySelector('img');
  img.src = src;
  img.alt = alt || '';
  box.querySelector('.lb-open').href = src;
  box.classList.add('open');
}
