'use strict';
(function () {
  const root = document.getElementById('game');
  const id = new URLSearchParams(location.search).get('id') || '';

  // Estados de traducción en los que se muestra la información del grupo
  const TR_WITH_DETAILS = ['disponible', 'parcial', 'en_desarrollo'];

  const prose = (t) => (t ? `<div class="prose">${esc(t)}</div>` : '');
  const block = (label, t) => (t ? `<div class="kv"><h3>${esc(label)}</h3>${prose(t)}</div>` : '');
  const none = (t) => `<p class="muted">${esc(t)}</p>`;
  const linkBtn = (url, label) => {
    const u = safeUrl(url);
    return u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
  };
  const section = (title, badgeHtml, inner) =>
    `<section class="sec"><h2>${esc(title)} ${badgeHtml || ''}</h2>${inner}</section>`;

  // Imágenes sueltas que se amplían al hacer clic
  const shotButton = (file, alt, big) =>
    `<button type="button" class="shot${big ? ' big' : ''}" data-lightbox="${esc(imgUrl(file))}" data-alt="${esc(alt)}" aria-label="Ampliar: ${esc(alt)}">` +
    `<img src="${imgUrl(file)}" alt="${esc(alt)}" loading="lazy"></button>`;

  function notFound() {
    document.title = 'Novela no encontrada – La Posada de las Novelas Visuales';
    root.innerHTML =
      '<div class="empty"><img src="/img/empty.svg" alt=""><h1 class="sticker">Novela no encontrada</h1>' +
      '<p>La ficha no existe o todavía no está publicada.</p><a class="btn" href="/">Volver al catálogo</a></div>';
  }

  function carouselHtml(key, label) {
    return `<div class="carousel" data-carousel="${key}" tabindex="0" aria-roledescription="carrusel" aria-label="${esc(label)}">
      <div class="stage">
        <button type="button" class="nav prev" aria-label="Imagen anterior">‹</button>
        <button type="button" class="zoom" aria-label="Ampliar imagen"><img alt=""></button>
        <button type="button" class="nav next" aria-label="Imagen siguiente">›</button>
      </div>
      <p class="car-meta"><span class="car-count"></span><span class="car-cap"></span></p>
    </div>`;
  }

  function initCarousel(key, items, title) {
    const box = root.querySelector(`[data-carousel="${key}"]`);
    if (!box || !items.length) return;
    let i = 0;
    const img = box.querySelector('.zoom img');
    const count = box.querySelector('.car-count');
    const cap = box.querySelector('.car-cap');
    function show() {
      const it = items[i];
      img.src = imgUrl(it.filename);
      img.alt = it.caption || `Imagen ${i + 1} de ${title}`;
      count.textContent = `${i + 1} / ${items.length}`;
      cap.textContent = it.caption || '';
    }
    function go(step) { i = (i + step + items.length) % items.length; show(); }
    box.querySelector('.prev').addEventListener('click', () => go(-1));
    box.querySelector('.next').addEventListener('click', () => go(1));
    box.querySelector('.zoom').addEventListener('click', () => openLightbox(img.src, img.alt));
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    });
    show();
  }

  function translationSection(g) {
    let inner;
    if (TR_WITH_DETAILS.includes(g.tr_status)) {
      inner = (g.tr_group ? `<div class="kv"><h3>Grupo que tradujo la novela</h3><p>${esc(g.tr_group)}</p></div>` : '') +
        block('Observaciones', g.tr_notes) +
        (safeUrl(g.tr_url) ? `<p class="kv">${linkBtn(g.tr_url, 'Ir al grupo o al parche')}</p>` : '');
    } else if (g.tr_status === 'no_verificado') {
      inner = none('Información no verificada.');
    } else {
      inner = none('Esta novela no tiene traducción al español por ahora.');
    }
    return section('Traducción al español', badge('tr', g.tr_status), inner);
  }

  function adultSection(g) {
    const inner = prose(g.adult_notes) || (g.adult_status === 'no_verificado' ? none('Información no verificada.') : '');
    return section('¿Necesita parche +18?', badge('adult', g.adult_status), inner);
  }

  function lunaSection(g) {
    const evidence = g.luna_images.length
      ? `<div class="shots">${g.luna_images.map((im, i) => shotButton(im.filename, `Evidencia de LunaTranslator ${i + 1}`, false)).join('')}</div>`
      : '';
    const inner = block('Configuración y observaciones', g.luna_config) + evidence ||
      (g.luna_status === 'no_verificado' ? none('Información no verificada.') : '');
    return section('Compatibilidad con LunaTranslator', badge('luna', g.luna_status), inner);
  }

  function achievementsSection(g) {
    const msg = { si: 'Este juego tiene logros de Steam.', no: 'Este juego no tiene logros de Steam.', no_verificado: 'Información no verificada.' }[g.ach_status];
    return section('Logros', badge('ach', g.ach_status), none(msg));
  }

  function cardsSection(g) {
    let inner = '';
    if (g.cards_normal_status === 'si') {
      inner = g.cards_normal.length
        ? '<ul class="tiles">' + g.cards_normal.map((c) => `
            <li class="tile">
              <div class="tile-img">${c.image ? `<img src="${imgUrl(c.image)}" alt="Cromo: ${esc(c.name)}" loading="lazy">` : ''}</div>
              <p class="tile-name">${esc(c.name)}</p>
              ${c.price != null ? `<p class="tile-price">${esc(money(c.price, c.currency))}</p>` : ''}
            </li>`).join('') + '</ul>'
        : none('Este juego tiene cromos, pero todavía no se han registrado.');

      if (g.emoticons_image) inner += `<div class="subsec"><h3>Emoticones</h3>${shotButton(g.emoticons_image, `Emoticones de ${g.title}`, true)}</div>`;
      if (g.wallpapers.length) inner += `<div class="subsec"><h3>Fondos de pantalla</h3>${carouselHtml('wallpapers', 'Fondos de pantalla')}</div>`;
      if (g.badge_image) inner += `<div class="subsec"><h3>Insignias</h3>${shotButton(g.badge_image, `Insignias de ${g.title}`, true)}</div>`;
      if (g.badge_foil_image) inner += `<div class="subsec"><h3>Insignia reflectante</h3>${shotButton(g.badge_foil_image, `Insignia reflectante de ${g.title}`, true)}</div>`;
    } else if (g.cards_normal_status === 'no') {
      inner = none('Este juego no tiene cromos.');
    } else {
      inner = none('Información no verificada.');
    }
    return section('Cromos', badge('cards', g.cards_normal_status), inner);
  }

  function pricesSection(g) {
    const byRegion = {};
    g.prices.forEach((p) => { byRegion[p.region] = p; });
    const rows = REGIONS.filter((r) => byRegion[r.code]).map((r) => {
      const p = byRegion[r.code];
      const cell = (v) => (v == null ? '<span class="muted">—</span>' : esc(money(v, r.currency)));
      const hasSale = p.discount !== null;
      return `<tr>
        <th scope="row">${esc(r.label)}</th>
        <td>${p.regular == null ? '<span class="muted">—</span>' : `<span class="${hasSale ? 'price-old' : 'price-now'}">${esc(money(p.regular, r.currency))}</span>`}</td>
        <td>${hasSale ? `<span class="price-now">${esc(money(p.sale, r.currency))}</span>` : '<span class="muted">—</span>'}</td>
        <td>${hasSale ? `<span class="price-off">-${esc(String(p.discount).replace('.', ','))} %</span>` : '<span class="muted">—</span>'}</td>
        <td>${p.lowest == null ? '<span class="muted">—</span>' : `<span class="price-low">${esc(money(p.lowest, r.currency))}</span>`}</td>
        <td>${p.lowest_discount != null ? `<span class="price-off">-${esc(String(p.lowest_discount).replace('.', ','))} %</span>` : '<span class="muted">—</span>'}</td>
      </tr>`;
    });
    const inner = rows.length
      ? `<div class="table-scroll"><table class="price-table">
           <thead><tr><th scope="col">País o moneda</th><th scope="col">Precio habitual</th><th scope="col">Precio con descuento más reciente</th><th scope="col">Descuento</th><th scope="col">Precio con descuento más bajo</th><th scope="col">Descuento máximo</th></tr></thead>
           <tbody>${rows.join('')}</tbody></table></div>`
      : none('Todavía no hay precios registrados.');
    return section('Precios en LATAM', '', inner + prose(g.price_notes));
  }

  const ROUTE_GROUPS = [
    { key: 'heroine', title: 'Rutas de heroínas', fallback: 'Heroína' },
    { key: 'sub', title: 'Subrutas', fallback: 'Subruta' },
    { key: 'bad', title: 'Bad endings', fallback: 'Bad ending' },
  ];

  function routeCard(r, label, g) {
    const alt = `${label} de ${g.title}`;
    return `<article class="route-card${r.image ? '' : ' no-img'}">
      ${r.image ? `<button type="button" class="route-img" data-lightbox="${esc(imgUrl(r.image))}" data-alt="${esc(alt)}" aria-label="Ampliar imagen: ${esc(label)}">
        <img src="${imgUrl(r.image)}" alt="${esc(alt)}" loading="lazy"></button>` : ''}
      <div>
        <h4>${esc(label)}</h4>
        ${r.options ? `<h3>Opciones correctas</h3>${prose(r.options)}` : ''}
        ${r.note ? `<div class="route-note"><h5>Observación</h5>${prose(r.note)}</div>` : ''}
      </div>
    </article>`;
  }

  function routesSection(g) {
    let inner = '';
    const common = g.routes.find((r) => r.section === 'common');
    if (g.route_common_status === 'si' && common) {
      inner += `<div class="route-group"><h3>Ruta común</h3>${routeCard(common, 'Ruta común', g)}</div>`;
    } else if (g.route_common_status === 'si') {
      inner += `<div class="route-group"><h3>Ruta común</h3>${none('Todavía no se ha registrado la ruta común.')}</div>`;
    } else if (g.route_common_status === 'no') {
      inner += `<div class="route-group"><h3>Ruta común</h3>${none('Este juego no tiene ruta común.')}</div>`;
    }
    ROUTE_GROUPS.forEach((grp) => {
      const list = g.routes.filter((r) => r.section === grp.key);
      if (!list.length) return;
      inner += `<div class="route-group"><h3>${esc(grp.title)}</h3>` +
        list.map((r, i) => routeCard(r, r.title || `${grp.fallback} ${i + 1}`, g)).join('') + '</div>';
    });
    return section('Guía de rutas', '', inner || none('Todavía no hay guía de rutas.'));
  }

  function render(g) {
    document.title = `${g.title} – La Posada de las Novelas Visuales`;

    const alts = g.alt_titles.split('\n').map((s) => s.trim()).filter(Boolean);
    const genres = g.genres.split(',').map((s) => s.trim()).filter(Boolean);
    const facts = [
      ['Desarrolladora', g.developer ? esc(g.developer) : ''],
      ['Lanzamiento en Steam', g.release_date ? esc(fmtDate(g.release_date)) : ''],
      ['Géneros', genres.length ? `<span class="chips">${genres.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</span>` : ''],
    ].filter((f) => f[1]);

    const hero = `
      <article class="hero">
        <div class="hero-cover">${g.cover
          ? `<img src="${imgUrl(g.cover)}" alt="Portada de ${esc(g.title)}">`
          : '<div class="nocover">Sin portada</div>'}</div>
        <div>
          <h1 class="sticker">${esc(g.title)}</h1>
          ${g.original_title ? `<p class="jp" lang="ja">${esc(g.original_title)}</p>` : ''}
          ${alts.length ? `<p class="alt-titles">También conocida como: ${alts.map(esc).join(' / ')}</p>` : ''}
          ${facts.length ? `<dl class="facts">${facts.map((f) => `<div><dt>${f[0]}</dt><dd>${f[1]}</dd></div>`).join('')}</dl>` : ''}
          ${linkBtn(g.store_url, 'Ver en la tienda')}
        </div>
      </article>`;

    const desc = g.description ? section('Descripción', '', prose(g.description)) : '';

    const gallery = section('Galería', '', g.gallery.length
      ? carouselHtml('gallery', 'Galería de imágenes')
      : none('Todavía no hay imágenes en la galería.'));

    const guide = routesSection(g);

    root.innerHTML =
      (g.published ? '' : '<p class="notice">Borrador: solo tú ves esta ficha porque has iniciado sesión como administrador.</p>') +
      hero + desc + translationSection(g) + adultSection(g) + lunaSection(g) + gallery + achievementsSection(g) + cardsSection(g) + pricesSection(g) + guide;

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lightbox]');
      if (b) openLightbox(b.dataset.lightbox, b.dataset.alt || '');
    });

    initCarousel('gallery', g.gallery, g.title);
    initCarousel('wallpapers', g.wallpapers, g.title);
  }

  api('/api/games/' + encodeURIComponent(id)).then(render).catch(notFound);
})();
