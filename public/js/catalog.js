'use strict';
(function () {
  const input = document.getElementById('q');
  const grid = document.getElementById('grid');
  const pager = document.getElementById('pager');
  const count = document.getElementById('count');
  const form = document.getElementById('search');

  const params = new URLSearchParams(location.search);
  let query = (params.get('q') || '').trim();
  let page = parseInt(params.get('page'), 10) || 1;
  let requestId = 0; // evita que una respuesta lenta pise a una más reciente
  let timer;

  input.value = query;

  function empty(title, text) {
    return `<div class="empty"><img src="/img/empty.svg" alt=""><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function updateUrl() {
    const qs = new URLSearchParams();
    if (query) qs.set('q', query);
    if (page > 1) qs.set('page', page);
    const s = qs.toString();
    history.replaceState(null, '', '/' + (s ? '?' + s : ''));
  }

  async function load() {
    const my = ++requestId;
    try {
      const d = await api(`/api/games?q=${encodeURIComponent(query)}&page=${page}`);
      if (my !== requestId) return;

      if (!d.games.length) {
        count.textContent = '';
        pager.innerHTML = '';
        grid.innerHTML = query
          ? empty('Sin resultados', `No hay novelas que coincidan con «${query}».`)
          : empty('El catálogo está vacío por ahora', 'Todavía no hay novelas visuales publicadas. Vuelve pronto.');
        return;
      }

      count.textContent = d.total === 1 ? '1 novela' : `${d.total} novelas`;
      grid.innerHTML = d.games.map((g) => `
        <a class="card" href="/game.html?id=${g.id}">
          <div class="cover">${g.cover
            ? `<img src="${imgUrl(g.cover)}" alt="Portada de ${esc(g.title)}" loading="lazy">`
            : '<span class="nocover">Sin portada</span>'}</div>
          <h2 class="card-title">${esc(g.title)}</h2>
        </a>`).join('');

      pager.innerHTML = d.pages > 1
        ? (d.page > 1 ? `<a href="#" data-page="${d.page - 1}">Anterior</a>` : '<span class="disabled">Anterior</span>') +
          `<span>Página ${d.page} de ${d.pages}</span>` +
          (d.page < d.pages ? `<a href="#" data-page="${d.page + 1}">Siguiente</a>` : '<span class="disabled">Siguiente</span>')
        : '';
    } catch (e) {
      if (my !== requestId) return;
      grid.innerHTML = empty('No se pudo cargar el catálogo', e.message);
    }
  }

  // Búsqueda mientras se escribe (espera 250 ms después de la última tecla)
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const v = input.value.trim();
      if (v === query) return;
      query = v;
      page = 1;
      updateUrl();
      load();
    }, 250);
  });

  // Pulsar Enter o el botón también busca, sin recargar la página
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    query = input.value.trim();
    page = 1;
    updateUrl();
    load();
  });

  pager.addEventListener('click', (e) => {
    const a = e.target.closest('[data-page]');
    if (!a) return;
    e.preventDefault();
    page = parseInt(a.dataset.page, 10);
    updateUrl();
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  load();
})();
