(function () {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────────────────────
  const searchInput  = document.getElementById('search-input');
  const resultCount  = document.getElementById('result-count');
  const categoryNav  = document.getElementById('category-nav');
  const emptyState   = document.getElementById('empty-state');
  const noIndexMsg   = document.getElementById('no-index-msg');
  const noResultsMsg = document.getElementById('no-results-msg');
  const resultsList  = document.getElementById('results-list');

  // ── Guard: index must exist ─────────────────────────────────────────────
  const INDEX = window.ATLAS_INDEX;
  if (!INDEX || !Array.isArray(INDEX.pages) || INDEX.pages.length === 0) {
    noIndexMsg.classList.remove('hidden');
    return;
  }

  const allPages = INDEX.pages;

  // ── Fuse.js ─────────────────────────────────────────────────────────────
  const fuse = new Fuse(allPages, {
    keys: [
      { name: 'title',       weight: 3 },
      { name: 'headings',    weight: 2 },
      { name: 'description', weight: 2 },
      { name: 'text',        weight: 1 },
    ],
    includeScore:       true,
    includeMatches:     true,
    threshold:          0.35,
    ignoreLocation:     true,
    minMatchCharLength: 2,
  });

  // ── State ───────────────────────────────────────────────────────────────
  let activeCategory = null;   // null = "All" (no filter)
  let debounceTimer  = null;

  // ── Boot ────────────────────────────────────────────────────────────────
  buildCategoryNav();
  update();
  searchInput.focus();

  // ── Events ──────────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(update, 150);
  });

  // '/' focuses search from anywhere; Esc clears and returns to empty state
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.value = '';
      searchInput.blur();
      update();
    }
  });


  // ════════════════════════════════════════════════════════════════════════
  // update — recomputes results and re-renders on every change
  // ════════════════════════════════════════════════════════════════════════
  function update() {
    const query = searchInput.value.trim();
    let results;

    if (query) {
      // Fuse search across all pages, then optionally filter by category
      results = fuse.search(query).map(r => r.item);
      if (activeCategory) {
        results = results.filter(p => p.category === activeCategory);
      }
    } else if (activeCategory) {
      // Browsing a category without a query: show all pages in it, newest first
      results = allPages
        .filter(p => p.category === activeCategory)
        .sort((a, b) => b.modified.localeCompare(a.modified));
    } else {
      // No query, no category: show empty state
      results = null;
    }

    refreshCategoryNav();
    renderView(results, query);
  }


  // ════════════════════════════════════════════════════════════════════════
  // renderView — switches between empty / no-results / results views
  // ════════════════════════════════════════════════════════════════════════
  function renderView(results, query) {
    const isEmpty   = results === null;
    const noMatch   = results !== null && results.length === 0;
    const hasResult = results !== null && results.length > 0;

    setVisible(emptyState,   isEmpty);
    setVisible(noResultsMsg, noMatch);
    setVisible(resultsList,  hasResult);

    if (hasResult) renderCards(results, query);

    // Result count: only visible while a query is active
    if (query) {
      const n = results ? results.length : 0;
      resultCount.textContent = `${n} result${n === 1 ? '' : 's'}`;
      resultCount.classList.remove('hidden');
    } else {
      resultCount.textContent = '';
      resultCount.classList.add('hidden');
    }
  }


  // ════════════════════════════════════════════════════════════════════════
  // renderCards — builds all result cards into #results-list
  // ════════════════════════════════════════════════════════════════════════
  function renderCards(pages, query) {
    resultsList.innerHTML = '';
    const frag = document.createDocumentFragment();
    pages.forEach(page => frag.appendChild(buildCard(page, query)));
    resultsList.appendChild(frag);
  }

  function buildCard(page, query) {
    const li = document.createElement('li');
    li.className = 'atlas-card';

    // Entire card is a link to the vault page
    const a = document.createElement('a');
    a.href      = page.url;
    a.className = 'atlas-card-link';

    // ── Title row: heading + category badge ──
    const titleRow = document.createElement('div');
    titleRow.className = 'atlas-card-title-row';

    const h2 = document.createElement('h2');
    h2.className   = 'atlas-card-title';
    h2.textContent = page.title;

    const badge = document.createElement('span');
    badge.className   = 'atlas-badge';
    badge.textContent = page.category;

    titleRow.append(h2, badge);
    a.appendChild(titleRow);

    // ── Description (optional) ──
    if (page.description) {
      const desc = document.createElement('p');
      desc.className   = 'atlas-card-desc';
      desc.textContent = page.description;
      a.appendChild(desc);
    }

    // ── Relevant headings ──
    const headings = relevantHeadings(page, query);
    if (headings.length) {
      const hdLine = document.createElement('p');
      hdLine.className   = 'atlas-card-headings';
      hdLine.textContent = headings.join('  ·  ');
      a.appendChild(hdLine);
    }

    // ── Modified date ──
    const meta = document.createElement('p');
    meta.className   = 'atlas-card-meta';
    meta.textContent = page.modified.slice(0, 10);
    a.appendChild(meta);

    li.appendChild(a);
    return li;
  }


  // ════════════════════════════════════════════════════════════════════════
  // Category sidebar
  // ════════════════════════════════════════════════════════════════════════
  function buildCategoryNav() {
    // Count pages per category
    const counts = {};
    allPages.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });

    const items = [
      { id: null, label: 'All', count: allPages.length },
      ...Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, count]) => ({ id: cat, label: cat, count })),
    ];

    categoryNav.innerHTML = '';

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className   = 'atlas-cat-btn';
      btn.dataset.cat = item.id ?? '';
      // Using innerHTML here — label comes from folder names (user-controlled),
      // count is a number. escapeHtml applied to label.
      btn.innerHTML =
        `<span class="atlas-cat-label">${escapeHtml(item.label)}</span>` +
        `<span class="atlas-cat-count">${item.count}</span>`;

      btn.addEventListener('click', () => {
        activeCategory = item.id;
        update();
      });

      categoryNav.appendChild(btn);
    });
  }

  // Update active state without rebuilding the whole nav
  function refreshCategoryNav() {
    categoryNav.querySelectorAll('.atlas-cat-btn').forEach(btn => {
      const cat    = btn.dataset.cat || null;
      const active = cat === activeCategory;
      btn.classList.toggle('atlas-cat-btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }


  // ════════════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════════════

  // Returns headings that match the query, falling back to first 3 headings.
  function relevantHeadings(page, query) {
    if (!page.headings.length) return [];
    if (!query) return page.headings.slice(0, 3);

    const terms   = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matched = page.headings.filter(h =>
      terms.some(t => h.toLowerCase().includes(t))
    );
    return (matched.length ? matched : page.headings).slice(0, 4);
  }

  // Show or hide an element using the .hidden utility class.
  function setVisible(el, visible) {
    el.classList.toggle('hidden', !visible);
  }

  // Prevent XSS when building HTML strings (used in buildCategoryNav labels).
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
