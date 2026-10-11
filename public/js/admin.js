'use strict';
(function () {
  const app = document.getElementById('app');
  const logoutBtn = document.getElementById('logout');
  const toastEl = document.getElementById('toast');
  const state = { game: null, tab: 'general' };

  const STATUS_TR = [['no_verificado', 'No verificado'], ['disponible', 'Disponible'], ['parcial', 'Parcial'], ['en_desarrollo', 'En desarrollo'], ['no_disponible', 'No disponible']];
  const TR_WITH_DETAILS = ['disponible', 'parcial', 'en_desarrollo'];
  const STATUS_ADULT = [['no_verificado', 'No verificado'], ['si', 'Sí necesita parche'], ['no', 'No necesita parche']];
  const STATUS_LUNA = [['no_verificado', 'Sin verificar'], ['compatible', 'Compatible'], ['incompatible', 'No compatible']];
  const STATUS_ACH = [['no_verificado', 'No verificado'], ['si', 'Sí'], ['no', 'No']];
  const STATUS_ROUTE = [['no_verificado', 'No verificado'], ['si', 'Sí hay ruta común'], ['no', 'No hay ruta común']];
  const STATUS_CARDS = [['no_verificado', 'No verificado'], ['si', 'Sí hay cromos'], ['no', 'No hay cromos']];

  const TABS = [
    ['general', 'General'],
    ['traduccion', 'Traducción al español'],
    ['adult', 'Parche +18'],
    ['luna', 'LunaTranslator'],
    ['galeria', 'Galería'],
    ['logros', 'Logros'],
    ['cromos', 'Cromos'],
    ['precio', 'Precios'],
    ['guia', 'Guía de rutas'],
    ['publicacion', 'Publicación'],
  ];

  const IMG_ACCEPT = 'image/jpeg,image/png,image/webp';
  const CURRENCIES = ['USD', 'EUR', 'PEN', 'MXN', 'ARS', 'CLP', 'COP', 'UYU', 'GBP', 'BRL', 'JPY'];

  // ---------- Utilidades ----------
  let toastTimer;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show ' + (kind || 'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 5000);
  }

  const jsonOpts = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Ejecuta una petición, gestiona errores y bloquea el botón mientras tanto.
  async function run(btn, fn) {
    if (btn) btn.disabled = true;
    try {
      return await fn();
    } catch (e) {
      if (e.status === 401) {
        toast('Tu sesión ha caducado. Inicia sesión de nuevo.', 'error');
        showLogin();
      } else {
        toast(e.message, 'error');
      }
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Ejecuta una petición que devuelve la ficha completa y vuelve a pintar el editor.
  async function mutate(btn, fn, okMsg) {
    const g = await run(btn, fn);
    if (g) {
      state.game = g;
      renderEditor();
      toast(okMsg);
    }
  }

  function formValues(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'file') continue;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return o;
  }

  function field(def, value) {
    const id = 'f_' + def.name;
    const v = value === null || value === undefined ? '' : String(value);
    let control;
    if (def.type === 'textarea') {
      control = `<textarea id="${id}" name="${def.name}" rows="${def.rows || 4}" maxlength="${def.max || 5000}">${esc(v)}</textarea>`;
    } else if (def.type === 'select') {
      control = `<select id="${id}" name="${def.name}">${def.options.map(([val, label]) =>
        `<option value="${val}"${val === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    } else {
      control = `<input id="${id}" name="${def.name}" type="${def.type || 'text'}" value="${esc(v)}"` +
        `${def.required ? ' required' : ''} maxlength="${def.max || 500}">`;
    }
    return `<div class="field"><label for="${id}">${esc(def.label)}</label>${control}` +
      `${def.hint ? `<p class="hint">${esc(def.hint)}</p>` : ''}</div>`;
  }

  function fieldsForm(title, g, defs) {
    return `<form data-form="fields">
      <h2>${esc(title)}</h2>
      ${defs.map((d) => field(d, g[d.name])).join('')}
      <div class="actions"><button type="submit">Guardar cambios</button></div>
    </form>`;
  }

  // Formulario para una imagen única (portada, guía, emoticones, insignia)
  function singleImageForm(slot, currentFile, title, canDelete) {
    return `<form data-form="image" data-slot="${slot}" class="upload-box">
      <h2>${esc(title)}</h2>
      <img id="${slot}-preview" class="preview" alt="Vista previa" ${currentFile ? `src="${imgUrl(currentFile)}"` : 'hidden'}>
      <div class="field">
        <label for="${slot}-file">Elegir imagen (JPG, PNG o WebP)</label>
        <input id="${slot}-file" type="file" name="image" accept="${IMG_ACCEPT}" data-preview="${slot}-preview" required>
      </div>
      <div class="actions">
        <button type="submit">${currentFile ? 'Reemplazar imagen' : 'Subir imagen'}</button>
        ${canDelete && currentFile ? `<button type="button" class="btn btn-danger" data-action="image-delete" data-slot="${slot}">Eliminar imagen</button>` : ''}
      </div>
    </form>`;
  }

  // Gestor de varias imágenes (galería, evidencias de LunaTranslator, fondos de pantalla)
  function mediaManager(g, kind, list, opts) {
    return `<form data-form="media-upload" data-kind="${kind}" class="upload-box">
        <h2>${esc(opts.title)}</h2>
        <div class="field">
          <label for="${kind}-files">Elegir una o varias imágenes (JPG, PNG o WebP)</label>
          <input id="${kind}-files" type="file" name="images" multiple accept="${IMG_ACCEPT}" data-preview-multi="${kind}-preview" required>
        </div>
        <div id="${kind}-preview" class="thumbs"></div>
        <button type="submit">Subir imágenes</button>
      </form>
      <h2>${esc(opts.listTitle)} (${list.length})</h2>
      ${list.length ? `<ul class="item-list">${list.map((im, i) => `
        <li class="item">
          <img class="thumb" src="${imgUrl(im.filename)}" alt="" loading="lazy">
          ${opts.captions ? `<form data-form="gallery-caption" data-id="${im.id}" class="item-form">
              <div class="field"><label for="cap-${im.id}">Descripción (opcional)</label>
              <input id="cap-${im.id}" name="caption" value="${esc(im.caption)}" maxlength="300"></div>
              <button type="submit" class="btn-ghost">Guardar descripción</button>
            </form>` : '<div></div>'}
          <div class="item-actions">
            <button type="button" class="btn btn-ghost" data-action="gallery-up" data-id="${im.id}" ${i === 0 ? 'disabled' : ''}>Subir posición</button>
            <button type="button" class="btn btn-ghost" data-action="gallery-down" data-id="${im.id}" ${i === list.length - 1 ? 'disabled' : ''}>Bajar posición</button>
            <button type="button" class="btn btn-danger" data-action="gallery-delete" data-id="${im.id}">Eliminar</button>
            ${opts.replace ? `<label class="replace">Reemplazar por otra imagen
              <input type="file" accept="${IMG_ACCEPT}" data-change="gallery-replace" data-id="${im.id}"></label>` : ''}
          </div>
        </li>`).join('')}</ul>` : `<p class="empty-note">${esc(opts.empty)}</p>`}`;
  }

  // ---- Guía de rutas: textos de cada tipo de ruta ----
  const ROUTE_UI = {
    common: { single: 'Ruta común', imageLabel: 'Imagen de la ruta común' },
    heroine: { block: 'Rutas de heroínas', create: 'Crear ruta heroína', single: 'Heroína', nameLabel: 'Nombre de la heroína (opcional)', imageLabel: 'Imagen de la heroína' },
    sub: { block: 'Subrutas', create: 'Crear subruta', single: 'Subruta', nameLabel: 'Nombre de la subruta (opcional)', imageLabel: 'Imagen de la subruta' },
    bad: { block: 'Bad endings', create: 'Crear bad ending', single: 'Bad ending', nameLabel: 'Nombre del bad ending (opcional)', imageLabel: 'Imagen del bad ending' },
  };

  // Formulario de una ruta: imagen a la izquierda, opciones correctas a la derecha.
  // Si r es null, es el formulario para crear una nueva.
  function routeForm(section, r, idx, movable) {
    const ui = ROUTE_UI[section];
    const key = r ? r.id : `new-${section}`;
    const hasNote = !!(r && r.note);
    const heading = r ? (section === 'common' ? 'Ruta común' : (r.title || `${ui.single} ${idx + 1}`)) : '';
    return `<form data-form="route" data-section="${section}" ${r ? `data-id="${r.id}"` : ''} class="route-entry">
      ${heading ? `<h3>${esc(heading)}</h3>` : ''}
      <div class="route-cols">
        <div>
          <img id="route-prev-${key}" class="preview" alt="Vista previa" ${r && r.image ? `src="${imgUrl(r.image)}"` : 'hidden'}>
          <div class="field"><label for="route-img-${key}">${esc(ui.imageLabel)}</label>
            <input id="route-img-${key}" type="file" name="image" accept="${IMG_ACCEPT}" data-preview="route-prev-${key}"></div>
        </div>
        <div>
          ${section !== 'common' ? `<div class="field"><label for="route-title-${key}">${esc(ui.nameLabel)}</label>
            <input id="route-title-${key}" name="title" value="${esc(r ? r.title : '')}" maxlength="200"></div>` : ''}
          <div class="field"><label for="route-opt-${key}">Opciones correctas para avanzar</label>
            <textarea id="route-opt-${key}" name="options" rows="7" maxlength="8000">${esc(r ? r.options : '')}</textarea>
            <p class="hint">Escribe cada elección en una línea.</p></div>
          <div class="note-box" ${hasNote ? '' : 'hidden'}>
            <div class="field"><label for="route-note-${key}">Observación</label>
              <textarea id="route-note-${key}" name="note" rows="3" maxlength="3000">${esc(r ? r.note : '')}</textarea></div>
          </div>
          ${hasNote ? '' : '<button type="button" class="btn btn-ghost" data-action="note-show">Añadir observación</button>'}
        </div>
      </div>
      <div class="actions">
        <button type="submit">${r ? 'Guardar cambios' : 'Guardar ruta'}</button>
        ${r && movable ? `<button type="button" class="btn btn-ghost" data-action="route-up" data-id="${r.id}" ${idx === 0 ? 'disabled' : ''}>Subir posición</button>
          <button type="button" class="btn btn-ghost" data-action="route-down" data-id="${r.id}" ${idx === movable - 1 ? 'disabled' : ''}>Bajar posición</button>` : ''}
        ${r ? `<button type="button" class="btn btn-danger" data-action="route-delete" data-id="${r.id}">Eliminar</button>` : ''}
      </div>
    </form>`;
  }

  function routeBlock(g, section) {
    const ui = ROUTE_UI[section];
    const list = g.routes.filter((r) => r.section === section);
    return `<div class="route-block">
      <h2>${esc(ui.block)} (${list.length})</h2>
      ${list.map((r, i) => routeForm(section, r, i, list.length)).join('')}
      <details class="add"><summary>${esc(ui.create)}</summary>${routeForm(section, null)}</details>
    </div>`;
  }

  const currencyList = `<datalist id="currencies">${CURRENCIES.map((c) => `<option value="${c}">`).join('')}</datalist>`;

  // ---------- Vistas ----------
  function showLogin() {
    state.game = null;
    logoutBtn.hidden = true;
    app.innerHTML = `<section class="login panel">
      <h1 class="sticker">Panel de administración</h1>
      <p class="muted">Acceso solo para el administrador.</p>
      <form data-form="login">
        <div class="field"><label for="pw">Contraseña</label>
        <input id="pw" type="password" autocomplete="current-password" required></div>
        <div class="actions"><button type="submit">Iniciar sesión</button></div>
      </form>
    </section>`;
    document.getElementById('pw').focus();
  }

  async function showList() {
    state.game = null;
    logoutBtn.hidden = false;
    app.innerHTML = '<p class="muted">Cargando…</p>';
    let d;
    try {
      d = await api('/api/admin/games');
    } catch (e) {
      if (e.status === 401) return showLogin();
      app.innerHTML = `<p class="error-text">${esc(e.message)}</p>`;
      return;
    }
    app.innerHTML = `
      <div class="admin-head"><h1 class="sticker">Novelas visuales</h1></div>
      <form data-form="new" class="inline-form">
        <div class="field grow"><label for="new-title">Nombre de la nueva novela</label>
        <input id="new-title" required maxlength="200"></div>
        <button type="submit">Crear novela</button>
      </form>
      ${d.games.length ? `<ul class="admin-list">${d.games.map((g) => `
        <li>
          ${g.cover ? `<img class="mini" src="${imgUrl(g.cover)}" alt="" loading="lazy">` : '<span class="mini"></span>'}
          <span class="title">${esc(g.title)}</span>
          <span class="badge ${g.published ? 'badge-ok' : 'badge-unk'}">${g.published ? 'Publicada' : 'Borrador'}</span>
          <button type="button" class="btn btn-ghost" data-action="edit" data-id="${g.id}">Editar</button>
          <button type="button" class="btn btn-danger" data-action="list-delete" data-id="${g.id}" data-title="${esc(g.title)}">Eliminar</button>
        </li>`).join('')}</ul>`
        : '<p class="empty-note">Aún no has creado ninguna novela. Escribe un nombre arriba para empezar.</p>'}`;
  }

  async function openEditor(id) {
    const g = await run(null, () => api('/api/games/' + id));
    if (!g) return;
    state.game = g;
    state.tab = 'general';
    renderEditor();
  }

  function renderEditor() {
    const g = state.game;
    logoutBtn.hidden = false;
    app.innerHTML = `
      <div class="admin-head">
        <button type="button" class="btn btn-ghost" data-action="back">Volver a la lista</button>
        <h1 class="sticker">${esc(g.title)}</h1>
        <span class="badge ${g.published ? 'badge-ok' : 'badge-unk'}">${g.published ? 'Publicada' : 'Borrador'}</span>
        <a class="btn btn-ghost" href="/game.html?id=${g.id}" target="_blank" rel="noopener">Ver ficha</a>
      </div>
      <div class="tabs" role="tablist" aria-label="Secciones de la ficha">
        ${TABS.map(([k, l]) => `<button type="button" role="tab" class="tab" aria-selected="${k === state.tab}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}
      </div>
      <section class="panel" role="tabpanel">${PANELS[state.tab](g)}</section>`;
  }

  // ---------- Paneles de cada pestaña ----------
  const PANELS = {
    general(g) {
      return singleImageForm('cover', g.cover, 'Portada principal', false) +
        fieldsForm('Información general', g, [
          { name: 'title', label: 'Nombre de la novela visual', required: true, max: 200 },
          { name: 'original_title', label: 'Título original en japonés (opcional)', max: 200 },
          { name: 'alt_titles', label: 'Títulos alternativos (opcional)', type: 'textarea', rows: 3, max: 1000, hint: 'Escribe uno por línea.' },
          { name: 'developer', label: 'Desarrolladora', max: 200 },
          { name: 'release_date', label: 'Fecha de lanzamiento en Steam', type: 'date' },
          { name: 'genres', label: 'Géneros', max: 500, hint: 'Sepáralos con comas. Ejemplo: Romance, Misterio, Drama.' },
          { name: 'description', label: 'Descripción', type: 'textarea', rows: 8, max: 20000 },
          { name: 'store_url', label: 'Enlace a Steam u otra tienda (opcional)', type: 'url' },
        ]);
    },

    traduccion(g) {
      const show = TR_WITH_DETAILS.includes(g.tr_status);
      return `<form data-form="fields">
        <h2>Traducción al español</h2>
        ${field({ name: 'tr_status', label: 'Estado', type: 'select', options: STATUS_TR }, g.tr_status)}
        <div id="tr-extra" ${show ? '' : 'hidden'}>
          ${field({ name: 'tr_group', label: 'Grupo que tradujo la novela', max: 200 }, g.tr_group)}
          ${field({ name: 'tr_notes', label: 'Observaciones', type: 'textarea', rows: 5 }, g.tr_notes)}
          ${field({ name: 'tr_url', label: 'Enlace del grupo o del parche', type: 'url' }, g.tr_url)}
        </div>
        <p class="hint">Si el estado es «No disponible» o «No verificado», no se pide nada más.</p>
        <div class="actions"><button type="submit">Guardar cambios</button></div>
      </form>`;
    },

    adult(g) {
      return `<form data-form="fields">
        <h2>¿Necesita parche +18?</h2>
        ${field({ name: 'adult_status', label: '¿Necesita parche +18?', type: 'select', options: STATUS_ADULT }, g.adult_status)}
        ${field({ name: 'adult_notes', label: 'Observación (opcional)', type: 'textarea', rows: 4, max: 3000 }, g.adult_notes)}
        <div class="actions"><button type="submit">Guardar cambios</button></div>
      </form>`;
    },

    luna(g) {
      return `<form data-form="fields">
          <h2>Compatibilidad con LunaTranslator</h2>
          ${field({ name: 'luna_status', label: 'Estado de compatibilidad', type: 'select', options: STATUS_LUNA }, g.luna_status)}
          ${field({ name: 'luna_config', label: 'Configuración – observaciones (opcional)', type: 'textarea', rows: 7, max: 10000, hint: 'Se conservan los saltos de línea.' }, g.luna_config)}
          <div class="actions"><button type="submit">Guardar cambios</button></div>
        </form>` +
        mediaManager(g, 'luna', g.luna_images, {
          title: 'Imágenes de evidencia',
          listTitle: 'Evidencias subidas',
          empty: 'Todavía no hay imágenes de evidencia.',
          captions: false,
          replace: false,
        });
    },

    galeria(g) {
      return mediaManager(g, 'screenshot', g.gallery, {
        title: 'Añadir imágenes a la galería',
        listTitle: 'Imágenes de la galería',
        empty: 'Todavía no hay imágenes en la galería.',
        captions: true,
        replace: true,
      });
    },

    logros(g) {
      return `<form data-form="fields">
        <h2>Logros de Steam</h2>
        ${field({ name: 'ach_status', label: '¿La novela tiene logros?', type: 'select', options: STATUS_ACH }, g.ach_status)}
        <div class="actions"><button type="submit">Guardar cambios</button></div>
      </form>`;
    },

    cromos(g) {
      const list = g.cards_normal;
      const show = g.cards_normal_status === 'si';
      return `<form data-form="fields">
          <h2>Cromos de Steam</h2>
          ${field({ name: 'cards_normal_status', label: '¿Hay cromos?', type: 'select', options: STATUS_CARDS }, g.cards_normal_status)}
          <div class="actions"><button type="submit">Guardar cambios</button></div>
        </form>
        <div id="cards-extra" ${show ? '' : 'hidden'}>
          <h2>Añadir cromo</h2>
          <details class="add"><summary>Añadir cromo</summary>
            <form data-form="card-add">
              <img id="card-new-preview" class="preview" alt="Vista previa del cromo" hidden>
              <div class="field"><label for="card-new-name">Nombre del cromo</label>
                <input id="card-new-name" name="name" required maxlength="200"></div>
              <div class="field"><label for="card-new-price">Precio (opcional)</label>
                <input id="card-new-price" name="price" type="number" min="0" step="0.01"></div>
              <div class="field"><label for="card-new-cur">Moneda</label>
                <input id="card-new-cur" name="currency" list="currencies" value="USD" maxlength="3"></div>
              <div class="field"><label for="card-new-img">Imagen del cromo (JPG, PNG o WebP)</label>
                <input id="card-new-img" name="image" type="file" accept="${IMG_ACCEPT}" data-preview="card-new-preview" required></div>
              <div class="actions"><button type="submit">Guardar cromo</button></div>
            </form>
          </details>
          <h2>Cromos registrados (${list.length})</h2>
          ${list.length ? `<ul class="item-list">${list.map((c, i) => `
            <li class="item">
              <img class="thumb" id="card-img-${c.id}" src="${imgUrl(c.image)}" alt="Cromo: ${esc(c.name)}" loading="lazy">
              <form data-form="card-edit" data-id="${c.id}" class="item-form">
                <div class="row">
                  <div class="field"><label for="cname-${c.id}">Nombre</label>
                    <input id="cname-${c.id}" name="name" value="${esc(c.name)}" required maxlength="200"></div>
                  <div class="field"><label for="cprice-${c.id}">Precio</label>
                    <input id="cprice-${c.id}" name="price" type="number" min="0" step="0.01" value="${c.price === null ? '' : c.price}"></div>
                  <div class="field"><label for="ccur-${c.id}">Moneda</label>
                    <input id="ccur-${c.id}" name="currency" list="currencies" value="${esc(c.currency)}" maxlength="3"></div>
                </div>
                <div class="field"><label for="cimg-${c.id}">Reemplazar imagen (opcional)</label>
                  <input id="cimg-${c.id}" name="image" type="file" accept="${IMG_ACCEPT}" data-preview="card-img-${c.id}"></div>
                <button type="submit">Guardar cromo</button>
              </form>
              <div class="item-actions">
                <button type="button" class="btn btn-ghost" data-action="card-up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''}>Subir posición</button>
                <button type="button" class="btn btn-ghost" data-action="card-down" data-id="${c.id}" ${i === list.length - 1 ? 'disabled' : ''}>Bajar posición</button>
                <button type="button" class="btn btn-danger" data-action="card-delete" data-id="${c.id}">Eliminar</button>
              </div>
            </li>`).join('')}</ul>` : '<p class="empty-note">Todavía no hay cromos registrados.</p>'}

          <div class="subsec">${singleImageForm('emoticons', g.emoticons_image, 'EMOTICONES (una captura)', true)}</div>
          <div class="subsec">${mediaManager(g, 'wallpaper', g.wallpapers, {
            title: 'FONDOS DE PANTALLA (carrusel)',
            listTitle: 'Fondos de pantalla subidos',
            empty: 'Todavía no hay fondos de pantalla.',
            captions: false,
            replace: false,
          })}</div>
          <div class="subsec">${singleImageForm('badge', g.badge_image, 'INSIGNIAS (una imagen)', true)}</div>
          <div class="subsec">${singleImageForm('badge_foil', g.badge_foil_image, 'INSIGNIA REFLECTANTE (una imagen)', true)}</div>
        </div>` + currencyList;
    },

    precio(g) {
      const byRegion = {};
      g.prices.forEach((p) => { byRegion[p.region] = p; });
      const val = (v) => (v === null || v === undefined ? '' : v);
      const rows = REGIONS.map((r) => {
        const p = byRegion[r.code] || {};
        const label = esc(r.label);
        return `<tr>
          <th scope="row">${label}<br><span class="hint">${r.currency}</span></th>
          <td><input type="number" min="0" step="0.01" name="${r.code}_regular" value="${esc(val(p.regular))}" aria-label="${label}: precio habitual"></td>
          <td><input type="number" min="0" step="0.01" name="${r.code}_sale" value="${esc(val(p.sale))}" aria-label="${label}: precio con descuento más reciente"></td>
          <td><span class="disc" id="disc-${r.code}">${p.discount != null ? `-${String(p.discount).replace('.', ',')} %` : '—'}</span></td>
          <td><input type="number" min="0" step="0.01" name="${r.code}_lowest" value="${esc(val(p.lowest))}" aria-label="${label}: precio con descuento más bajo"></td>
          <td><span class="disc" id="discmax-${r.code}">${p.lowest_discount != null ? `-${String(p.lowest_discount).replace('.', ',')} %` : '—'}</span></td>
        </tr>`;
      }).join('');
      return `<form data-form="prices" id="prices-form">
          <h2>Precios en LATAM</h2>
          <p class="hint">Deja vacío lo que no quieras mostrar. Los descuentos se calculan solos: el primero con el precio con descuento más reciente y el «máximo» con el precio con descuento más bajo.</p>
          <div class="table-scroll"><table class="price-table">
            <thead><tr><th scope="col">País o moneda</th><th scope="col">Precio habitual</th><th scope="col">Precio con descuento más reciente</th><th scope="col">Descuento</th><th scope="col">Precio con descuento más bajo</th><th scope="col">Descuento máximo</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <div class="actions"><button type="submit">Guardar precios</button></div>
        </form>` +
        fieldsForm('Notas', g, [
          { name: 'price_notes', label: 'Notas adicionales (opcional)', type: 'textarea', rows: 3, max: 2000 },
        ]);
    },

    guia(g) {
      const common = g.routes.find((r) => r.section === 'common');
      return `<form data-form="fields">
          <h2>Guía de rutas</h2>
          ${field({ name: 'route_common_status', label: '¿El juego tiene ruta común?', type: 'select', options: STATUS_ROUTE }, g.route_common_status)}
          <div class="actions"><button type="submit">Guardar</button></div>
        </form>
        <div id="route-common-extra" class="route-block" ${g.route_common_status === 'si' ? '' : 'hidden'}>
          <h2>Ruta común</h2>
          ${common ? routeForm('common', common, 0, 0) : routeForm('common', null)}
        </div>
        ${routeBlock(g, 'heroine')}
        ${routeBlock(g, 'sub')}
        ${routeBlock(g, 'bad')}`;
    },

    publicacion(g) {
      return `<form data-form="fields">
          <h2>Publicación</h2>
          <label class="check"><input type="checkbox" name="published" ${g.published ? 'checked' : ''}>
            Mostrar esta ficha en el catálogo público</label>
          <p class="hint">Si la desmarcas, la ficha se retira del catálogo pero no se borra nada.</p>
          <div class="actions"><button type="submit">Guardar cambios</button></div>
        </form>
        <div class="danger-zone">
          <h2>Eliminar novela</h2>
          <p>Se borrarán la ficha y todas sus imágenes. Esta acción no se puede deshacer.</p>
          <button type="button" class="btn btn-danger" data-action="game-delete">Eliminar esta novela</button>
        </div>`;
    },
  };

  // ---------- Eventos ----------
  app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    const g = state.game;

    switch (action) {
      case 'edit': return openEditor(id);
      case 'back': return showList();
      case 'tab':
        state.tab = el.dataset.tab;
        return renderEditor();
      case 'list-delete': {
        if (!confirm(`¿Eliminar «${el.dataset.title}» y todas sus imágenes? No se puede deshacer.`)) return;
        const r = await run(el, () => api(`/api/admin/games/${id}`, { method: 'DELETE' }));
        if (r) { toast('Novela eliminada.'); showList(); }
        return;
      }
      case 'image-delete':
        if (!confirm('¿Eliminar esta imagen?')) return;
        return mutate(el, () => api(`/api/admin/games/${g.id}/image/${el.dataset.slot}`, { method: 'DELETE' }), 'Imagen eliminada.');
      case 'gallery-delete':
        if (!confirm('¿Eliminar esta imagen?')) return;
        return mutate(el, () => api(`/api/admin/gallery/${id}`, { method: 'DELETE' }), 'Imagen eliminada.');
      case 'gallery-up':
      case 'gallery-down':
        return mutate(el, () => api(`/api/admin/gallery/${id}/move`, jsonOpts('POST', { direction: action.endsWith('up') ? 'up' : 'down' })), 'Orden actualizado.');
      case 'card-delete':
        if (!confirm('¿Eliminar este cromo?')) return;
        return mutate(el, () => api(`/api/admin/cards/${id}`, { method: 'DELETE' }), 'Cromo eliminado.');
      case 'card-up':
      case 'card-down':
        return mutate(el, () => api(`/api/admin/cards/${id}/move`, jsonOpts('POST', { direction: action.endsWith('up') ? 'up' : 'down' })), 'Orden actualizado.');
      case 'note-show': {
        const box = el.parentElement.querySelector('.note-box');
        box.hidden = false;
        el.hidden = true;
        box.querySelector('textarea').focus();
        return;
      }
      case 'route-delete':
        if (!confirm('¿Eliminar esta ruta?')) return;
        return mutate(el, () => api(`/api/admin/routes/${id}`, { method: 'DELETE' }), 'Ruta eliminada.');
      case 'route-up':
      case 'route-down':
        return mutate(el, () => api(`/api/admin/routes/${id}/move`, jsonOpts('POST', { direction: action.endsWith('up') ? 'up' : 'down' })), 'Orden actualizado.');
      case 'game-delete': {
        if (!confirm(`¿Eliminar «${g.title}» y todas sus imágenes? No se puede deshacer.`)) return;
        const r = await run(el, () => api(`/api/admin/games/${g.id}`, { method: 'DELETE' }));
        if (r) { toast('Novela eliminada.'); showList(); }
        return;
      }
      default:
    }
  });

  app.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const kind = form.dataset.form;
    const btn = form.querySelector('button[type="submit"]');
    const g = state.game;

    switch (kind) {
      case 'login': {
        const password = form.querySelector('#pw').value;
        const r = await run(btn, () => api('/api/login', jsonOpts('POST', { password })));
        if (r) showList();
        break;
      }
      case 'new': {
        const title = form.querySelector('#new-title').value;
        const r = await run(btn, () => api('/api/admin/games', jsonOpts('POST', { title })));
        if (r) { toast('Novela creada. Completa su ficha.'); openEditor(r.id); }
        break;
      }
      case 'fields':
        await mutate(btn, () => api(`/api/admin/games/${g.id}`, jsonOpts('PUT', formValues(form))), 'Cambios guardados.');
        break;
      case 'image':
        await mutate(btn, () => api(`/api/admin/games/${g.id}/image/${form.dataset.slot}`, { method: 'POST', body: new FormData(form) }), 'Imagen guardada.');
        break;
      case 'media-upload':
        await mutate(btn, () => api(`/api/admin/games/${g.id}/gallery?kind=${form.dataset.kind}`, { method: 'POST', body: new FormData(form) }), 'Imágenes subidas.');
        break;
      case 'gallery-caption':
        await mutate(btn, () => api(`/api/admin/gallery/${form.dataset.id}`, jsonOpts('PUT', { caption: form.caption.value })), 'Descripción guardada.');
        break;
      case 'card-add':
        await mutate(btn, () => api(`/api/admin/games/${g.id}/cards`, { method: 'POST', body: new FormData(form) }), 'Cromo añadido.');
        break;
      case 'card-edit':
        await mutate(btn, () => api(`/api/admin/cards/${form.dataset.id}`, { method: 'PUT', body: new FormData(form) }), 'Cromo guardado.');
        break;
      case 'route': {
        const fd = new FormData(form);
        if (form.dataset.id) {
          await mutate(btn, () => api(`/api/admin/routes/${form.dataset.id}`, { method: 'PUT', body: fd }), 'Ruta guardada.');
        } else {
          fd.append('section', form.dataset.section);
          await mutate(btn, () => api(`/api/admin/games/${g.id}/routes`, { method: 'POST', body: fd }), 'Ruta creada.');
        }
        break;
      }
      case 'prices': {
        const prices = {};
        REGIONS.forEach((r) => {
          prices[r.code] = {
            regular: form.elements[`${r.code}_regular`].value,
            sale: form.elements[`${r.code}_sale`].value,
            lowest: form.elements[`${r.code}_lowest`].value,
          };
        });
        await mutate(btn, () => api(`/api/admin/games/${g.id}/prices`, jsonOpts('PUT', { prices })), 'Precios guardados.');
        break;
      }
      default:
    }
  });

  app.addEventListener('change', async (e) => {
    const el = e.target;

    // Mostrar u ocultar campos según el estado elegido
    if (el.name === 'tr_status') {
      document.getElementById('tr-extra').hidden = !TR_WITH_DETAILS.includes(el.value);
      return;
    }
    if (el.name === 'route_common_status') {
      document.getElementById('route-common-extra').hidden = el.value !== 'si';
      return;
    }
    if (el.name === 'cards_normal_status') {
      document.getElementById('cards-extra').hidden = el.value !== 'si';
      return;
    }

    if (el.type !== 'file') return;

    // Vista previa antes de subir
    if (el.dataset.preview && el.files[0]) {
      const img = document.getElementById(el.dataset.preview);
      if (img) { img.src = URL.createObjectURL(el.files[0]); img.hidden = false; }
    }
    if (el.dataset.previewMulti) {
      const box = document.getElementById(el.dataset.previewMulti);
      box.innerHTML = '';
      Array.from(el.files).forEach((f) => {
        const im = document.createElement('img');
        im.src = URL.createObjectURL(f);
        im.alt = '';
        box.appendChild(im);
      });
    }

    // Reemplazo inmediato de una imagen de la galería
    if (el.dataset.change === 'gallery-replace' && el.files[0]) {
      const fd = new FormData();
      fd.append('image', el.files[0]);
      await mutate(el, () => api(`/api/admin/gallery/${el.dataset.id}/replace`, { method: 'POST', body: fd }), 'Imagen reemplazada.');
    }
  });

  // Cálculo en vivo del descuento por país (el servidor lo vuelve a calcular al guardar)
  app.addEventListener('input', (e) => {
    const form = e.target.closest('#prices-form');
    if (!form) return;
    REGIONS.forEach((r) => {
      const reg = parseFloat(form.elements[`${r.code}_regular`].value);
      const sale = parseFloat(form.elements[`${r.code}_sale`].value);
      const low = parseFloat(form.elements[`${r.code}_lowest`].value);
      const pct = (price) => ((reg > 0 && price >= 0 && price < reg)
        ? `-${(Math.round(((reg - price) / reg) * 10000) / 100).toLocaleString('es')} %`
        : '—');
      document.getElementById(`disc-${r.code}`).textContent = pct(sale);
      document.getElementById(`discmax-${r.code}`).textContent = pct(low);
    });
  });

  logoutBtn.addEventListener('click', async () => {
    await run(logoutBtn, () => api('/api/logout', { method: 'POST' }));
    showLogin();
  });

  // ---------- Inicio ----------
  api('/api/me').then(showList).catch(showLogin);
})();
