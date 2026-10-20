/**
 * Indian Government APIs & Data Sources - Application Engine
 * Dynamically ingests and indexes Jekyll Kramdown-rendered README.md content
 */

(function () {
  'use strict';

  // Application Data Store
  const state = {
    categories: [],
    apis: [],
    filteredApis: [],
    activeCategory: 'all',
    searchQuery: '',
    domainFilter: 'all',
    viewMode: localStorage.getItem('gov_api_view') || 'grid',
    theme: localStorage.getItem('gov_api_theme') || 'dark'
  };

  // DOM Cache
  const DOM = {
    rawSource: document.getElementById('readme-raw-source'),
    skeleton: document.getElementById('loading-skeleton'),
    categoryPills: document.getElementById('category-pills'),
    gridView: document.getElementById('apis-grid-view'),
    tableView: document.getElementById('apis-table-view'),
    emptyState: document.getElementById('empty-state'),
    emptyQueryText: document.getElementById('empty-query-text'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    searchInput: document.getElementById('main-search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    headerSearchTrigger: document.getElementById('header-search-trigger'),
    countVisible: document.getElementById('count-visible'),
    countTotal: document.getElementById('count-total'),
    statTotalApis: document.getElementById('stat-total-apis'),
    statTotalCategories: document.getElementById('stat-total-categories'),
    domainFilter: document.getElementById('domain-filter'),
    btnViewGrid: document.getElementById('btn-view-grid'),
    btnViewTable: document.getElementById('btn-view-table'),
    themeToggle: document.getElementById('theme-toggle'),
    btnOpenContribute: document.getElementById('btn-open-contribute'),
    contributeModal: document.getElementById('contribute-modal'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    btnCopyTemplate: document.getElementById('btn-copy-template'),
    toast: document.getElementById('toast-notification'),
    toastMessage: document.getElementById('toast-message'),
    btnBackToTop: document.getElementById('btn-back-to-top')
  };

  /**
   * Parse Raw Kramdown DOM into structured API Data
   */
  function parseReadmeData() {
    if (!DOM.rawSource) return;

    const headings = DOM.rawSource.querySelectorAll('h2');
    const categories = [];
    const apis = [];

    headings.forEach((h2, catIndex) => {
      const headingText = h2.textContent.trim();

      // Skip non-directory headings
      if (
        headingText.includes('Table of Contents') ||
        headingText.includes('How to Contribute') ||
        headingText.includes('Support the Project')
      ) {
        return;
      }

      // Check for adjacent/subsequent table
      let nextElem = h2.nextElementSibling;
      let table = null;
      while (nextElem && nextElem.tagName !== 'H2') {
        if (nextElem.tagName === 'TABLE') {
          table = nextElem;
          break;
        }
        nextElem = nextElem.nextElementSibling;
      }

      if (!table) return;

      // Extract icon & name
      // Match leading emoji or symbol
      const iconMatch = headingText.match(/^(\p{Extended_Pictographic}|\p{Emoji}|[^\w\s])+/u);
      const icon = iconMatch ? iconMatch[0] : '🏛️';
      const name = headingText.replace(/^(\p{Extended_Pictographic}|\p{Emoji}|[^\w\s])+\s*/u, '').trim();
      const catId = 'cat-' + catIndex;

      const categoryObj = {
        id: catId,
        icon: icon,
        name: name,
        fullTitle: headingText,
        count: 0
      };

      // Parse table rows
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;

        const srNo = cells[0].textContent.trim();
        const linkElem = cells[1].querySelector('a');

        const apiName = linkElem ? linkElem.textContent.trim() : cells[1].textContent.trim();
        const url = linkElem ? linkElem.getAttribute('href').trim() : '#';
        const description = cells[2].textContent.trim();

        // Extract hostname domain
        let domain = '';
        let isGov = false;
        try {
          const parsedUrl = new URL(url);
          domain = parsedUrl.hostname.replace(/^www\./, '');
          isGov = /\.gov\.in$|\.nic\.in$/i.test(domain);
        } catch (e) {
          domain = url;
        }

        const apiItem = {
          id: 'api-' + (apis.length + 1),
          srNo: srNo,
          name: apiName,
          url: url,
          domain: domain,
          isGov: isGov,
          description: description,
          categoryId: catId,
          categoryName: name,
          categoryIcon: icon
        };

        apis.push(apiItem);
        categoryObj.count++;
      });

      if (categoryObj.count > 0) {
        categories.push(categoryObj);
      }
    });

    state.categories = categories;
    state.apis = apis;
    state.filteredApis = [...apis];

    // Update Top Stat Badges
    if (DOM.statTotalApis) DOM.statTotalApis.textContent = apis.length + '+';
    if (DOM.statTotalCategories) DOM.statTotalCategories.textContent = categories.length;
    if (DOM.countTotal) DOM.countTotal.textContent = apis.length;
  }

  /**
   * Render Category Filter Pills
   */
  function renderCategoryPills() {
    if (!DOM.categoryPills) return;

    let html = `
      <button type="button" class="category-pill ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all" role="tab" aria-selected="${state.activeCategory === 'all'}">
        <span class="pill-icon">✨</span>
        <span class="pill-name">All Portals</span>
        <span class="pill-count">${state.apis.length}</span>
      </button>
    `;

    state.categories.forEach((cat) => {
      const isActive = state.activeCategory === cat.id;
      html += `
        <button type="button" class="category-pill ${isActive ? 'active' : ''}" data-category="${cat.id}" role="tab" aria-selected="${isActive}">
          <span class="pill-icon">${cat.icon}</span>
          <span class="pill-name">${cat.name}</span>
          <span class="pill-count">${cat.count}</span>
        </button>
      `;
    });

    DOM.categoryPills.innerHTML = html;

    // Attach pill click events
    DOM.categoryPills.querySelectorAll('.category-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category');
        setCategory(cat);
      });
    });
  }

  /**
   * Highlight matching text in string
   */
  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeRegex(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Render Cards Grid View
   */
  function renderGridView(apis) {
    if (!DOM.gridView) return;

    if (apis.length === 0) {
      DOM.gridView.innerHTML = '';
      return;
    }

    // Group apis by category
    const grouped = {};
    apis.forEach((api) => {
      if (!grouped[api.categoryId]) {
        grouped[api.categoryId] = {
          name: api.categoryName,
          icon: api.categoryIcon,
          items: []
        };
      }
      grouped[api.categoryId].items.push(api);
    });

    let html = '';
    for (const catId in grouped) {
      const group = grouped[catId];
      html += `
        <div class="category-group" id="group-${catId}">
          <div class="category-group-header">
            <h2 class="category-group-title">
              <span>${group.icon}</span>
              <span>${escapeHtml(group.name)}</span>
            </h2>
            <span class="category-group-count">${group.items.length} ${group.items.length === 1 ? 'API' : 'APIs'}</span>
          </div>

          <div class="cards-grid">
            ${group.items
              .map((api) => {
                const query = state.searchQuery;
                const nameHighlighted = highlightText(api.name, query);
                const descHighlighted = highlightText(api.description, query);

                return `
                <article class="api-card" data-id="${api.id}">
                  <div>
                    <div class="card-top">
                      <span class="domain-badge ${api.isGov ? 'gov-verified' : ''}">
                        ${api.isGov ? '🛡️ ' : ''}${escapeHtml(api.domain)}
                      </span>
                      <span class="sr-badge" title="Catalog Entry #${api.srNo}">#${api.srNo}</span>
                    </div>

                    <h3 class="api-card-title">
                      <a href="${escapeHtml(api.url)}" target="_blank" rel="noopener noreferrer">
                        ${nameHighlighted}
                      </a>
                    </h3>

                    <p class="api-card-desc">${descHighlighted}</p>
                  </div>

                  <div class="api-card-footer">
                    <a href="${escapeHtml(api.url)}" target="_blank" rel="noopener noreferrer" class="btn-visit-api" title="Open official documentation in new tab">
                      <span>Visit Portal</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                      </svg>
                    </a>

                    <button type="button" class="btn-copy-card copy-link-btn" data-url="${escapeHtml(api.url)}" aria-label="Copy official link">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span>Copy</span>
                    </button>
                  </div>
                </article>
              `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    DOM.gridView.innerHTML = html;
  }

  /**
   * Render Data Table View
   */
  function renderTableView(apis) {
    if (!DOM.tableView) return;

    if (apis.length === 0) {
      DOM.tableView.innerHTML = '';
      return;
    }

    // Group apis by category
    const grouped = {};
    apis.forEach((api) => {
      if (!grouped[api.categoryId]) {
        grouped[api.categoryId] = {
          name: api.categoryName,
          icon: api.categoryIcon,
          items: []
        };
      }
      grouped[api.categoryId].items.push(api);
    });

    let html = '';
    for (const catId in grouped) {
      const group = grouped[catId];
      html += `
        <div class="category-group">
          <div class="category-group-header">
            <h2 class="category-group-title">
              <span>${group.icon}</span>
              <span>${escapeHtml(group.name)}</span>
            </h2>
            <span class="category-group-count">${group.items.length} ${group.items.length === 1 ? 'API' : 'APIs'}</span>
          </div>

          <div class="table-responsive-wrapper">
            <table class="directory-table">
              <thead>
                <tr>
                  <th class="table-col-num">#</th>
                  <th class="table-col-name">Name &amp; Official Link</th>
                  <th class="table-col-domain">Domain</th>
                  <th class="table-col-desc">Description</th>
                  <th class="table-col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                ${group.items
                  .map((api) => {
                    const query = state.searchQuery;
                    const nameHighlighted = highlightText(api.name, query);
                    const descHighlighted = highlightText(api.description, query);

                    return `
                    <tr>
                      <td class="table-col-num">${api.srNo}</td>
                      <td class="table-col-name">
                        <a href="${escapeHtml(api.url)}" target="_blank" rel="noopener noreferrer">
                          ${nameHighlighted} ↗
                        </a>
                      </td>
                      <td class="table-col-domain">
                        <span class="domain-badge ${api.isGov ? 'gov-verified' : ''}">
                          ${api.isGov ? '🛡️ ' : ''}${escapeHtml(api.domain)}
                        </span>
                      </td>
                      <td class="table-col-desc">${descHighlighted}</td>
                      <td class="table-col-action">
                        <button type="button" class="btn-copy-card copy-link-btn" data-url="${escapeHtml(api.url)}" title="Copy link">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          <span>Copy</span>
                        </button>
                      </td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    DOM.tableView.innerHTML = html;
  }

  /**
   * Filter, Search and Render Execution
   */
  function applyFilters() {
    const q = state.searchQuery.toLowerCase().trim();
    const cat = state.activeCategory;
    const dom = state.domainFilter;

    const filtered = state.apis.filter((api) => {
      // Category match
      if (cat !== 'all' && api.categoryId !== cat) {
        return false;
      }

      // Domain filter match
      if (dom === 'gov' && !api.isGov) {
        return false;
      }
      if (dom === 'other' && api.isGov) {
        return false;
      }

      // Search match
      if (q) {
        const nameMatch = api.name.toLowerCase().includes(q);
        const descMatch = api.description.toLowerCase().includes(q);
        const domMatch = api.domain.toLowerCase().includes(q);
        const catMatch = api.categoryName.toLowerCase().includes(q);

        if (!nameMatch && !descMatch && !domMatch && !catMatch) {
          return false;
        }
      }

      return true;
    });

    state.filteredApis = filtered;

    // Update Counts
    if (DOM.countVisible) DOM.countVisible.textContent = filtered.length;

    // Toggle Empty State vs Results
    if (filtered.length === 0) {
      if (DOM.gridView) DOM.gridView.style.display = 'none';
      if (DOM.tableView) DOM.tableView.style.display = 'none';
      if (DOM.emptyState) {
        DOM.emptyState.style.display = 'block';
        if (DOM.emptyQueryText) DOM.emptyQueryText.textContent = q || 'selected filters';
      }
    } else {
      if (DOM.emptyState) DOM.emptyState.style.display = 'none';

      if (state.viewMode === 'grid') {
        if (DOM.gridView) DOM.gridView.style.display = 'block';
        if (DOM.tableView) DOM.tableView.style.display = 'none';
        renderGridView(filtered);
      } else {
        if (DOM.gridView) DOM.gridView.style.display = 'none';
        if (DOM.tableView) DOM.tableView.style.display = 'block';
        renderTableView(filtered);
      }
    }

    // Attach clipboard copy listeners on all rendered buttons
    attachCopyListeners();
  }

  /**
   * Set Active Category
   */
  function setCategory(catId) {
    state.activeCategory = catId;

    // Update active class on pills
    if (DOM.categoryPills) {
      DOM.categoryPills.querySelectorAll('.category-pill').forEach((btn) => {
        const isMatch = btn.getAttribute('data-category') === catId;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-selected', isMatch);
      });
    }

    applyFilters();
  }

  /**
   * Set View Mode (Grid vs Table)
   */
  function setViewMode(mode) {
    state.viewMode = mode;
    localStorage.setItem('gov_api_view', mode);

    if (DOM.btnViewGrid) {
      DOM.btnViewGrid.classList.toggle('active', mode === 'grid');
      DOM.btnViewGrid.setAttribute('aria-pressed', mode === 'grid');
    }
    if (DOM.btnViewTable) {
      DOM.btnViewTable.classList.toggle('active', mode === 'table');
      DOM.btnViewTable.setAttribute('aria-pressed', mode === 'table');
    }

    applyFilters();
  }

  /**
   * Copy to Clipboard with Toast Notification
   */
  function copyToClipboard(text, customMessage) {
    if (!navigator.clipboard) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(customMessage || 'Copied to clipboard!');
      return;
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast(customMessage || 'Official API link copied to clipboard! 📋');
      })
      .catch(() => {
        showToast('Failed to copy to clipboard');
      });
  }

  function showToast(message) {
    if (!DOM.toast) return;
    if (DOM.toastMessage) DOM.toastMessage.textContent = message;

    DOM.toast.classList.add('active');
    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
      DOM.toast.classList.remove('active');
    }, 2800);
  }

  function attachCopyListeners() {
    document.querySelectorAll('.copy-link-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const url = btn.getAttribute('data-url');
        if (url) copyToClipboard(url);
      };
    });
  }

  /**
   * Dark / Light Theme Management
   */
  function initTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    state.theme = currentTheme;

    if (DOM.themeToggle) {
      DOM.themeToggle.addEventListener('click', () => {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        state.theme = nextTheme;
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('gov_api_theme', nextTheme);
      });
    }
  }

  /**
   * Global Event Listeners
   */
  function initEvents() {
    // Search input typing
    if (DOM.searchInput) {
      DOM.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (DOM.searchClearBtn) {
          DOM.searchClearBtn.style.display = state.searchQuery ? 'flex' : 'none';
        }
        applyFilters();
      });
    }

    // Clear search button
    if (DOM.searchClearBtn) {
      DOM.searchClearBtn.addEventListener('click', () => {
        if (DOM.searchInput) {
          DOM.searchInput.value = '';
          state.searchQuery = '';
          DOM.searchClearBtn.style.display = 'none';
          DOM.searchInput.focus();
          applyFilters();
        }
      });
    }

    // Header search trigger
    if (DOM.headerSearchTrigger) {
      DOM.headerSearchTrigger.addEventListener('click', () => {
        if (DOM.searchInput) {
          DOM.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          DOM.searchInput.focus();
        }
      });
    }

    // Domain filter dropdown
    if (DOM.domainFilter) {
      DOM.domainFilter.addEventListener('change', (e) => {
        state.domainFilter = e.target.value;
        applyFilters();
      });
    }

    // View buttons
    if (DOM.btnViewGrid) {
      DOM.btnViewGrid.addEventListener('click', () => setViewMode('grid'));
    }
    if (DOM.btnViewTable) {
      DOM.btnViewTable.addEventListener('click', () => setViewMode('table'));
    }

    // Reset filters button in empty state
    if (DOM.btnResetFilters) {
      DOM.btnResetFilters.addEventListener('click', () => {
        state.searchQuery = '';
        state.activeCategory = 'all';
        state.domainFilter = 'all';
        if (DOM.searchInput) DOM.searchInput.value = '';
        if (DOM.searchClearBtn) DOM.searchClearBtn.style.display = 'none';
        if (DOM.domainFilter) DOM.domainFilter.value = 'all';
        renderCategoryPills();
        applyFilters();
      });
    }

    // Keyboard shortcuts: '/' or 'Cmd+K' / 'Ctrl+K'
    document.addEventListener('keydown', (e) => {
      if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && document.activeElement !== DOM.searchInput) {
        e.preventDefault();
        if (DOM.searchInput) {
          DOM.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          DOM.searchInput.focus();
        }
      } else if (e.key === 'Escape') {
        if (DOM.contributeModal && DOM.contributeModal.classList.contains('active')) {
          closeContributeModal();
        } else if (DOM.searchInput && document.activeElement === DOM.searchInput) {
          DOM.searchInput.blur();
        }
      }
    });

    // Contribute Modal
    if (DOM.btnOpenContribute) {
      DOM.btnOpenContribute.addEventListener('click', openContributeModal);
    }
    if (DOM.modalCloseBtn) {
      DOM.modalCloseBtn.addEventListener('click', closeContributeModal);
    }
    if (DOM.modalBackdrop) {
      DOM.modalBackdrop.addEventListener('click', closeContributeModal);
    }

    // Copy template snippet in modal
    if (DOM.btnCopyTemplate) {
      DOM.btnCopyTemplate.addEventListener('click', () => {
        const template = '| <Sr. No.> | [Portal Name](https://official-portal.gov.in/) | Crisp, value-driven description for developers. |';
        copyToClipboard(template, 'Markdown row template copied! 📋');
      });
    }

    // Back to top button
    if (DOM.btnBackToTop) {
      DOM.btnBackToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  function openContributeModal() {
    if (DOM.contributeModal) {
      DOM.contributeModal.classList.add('active');
      DOM.contributeModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeContributeModal() {
    if (DOM.contributeModal) {
      DOM.contributeModal.classList.remove('active');
      DOM.contributeModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  /**
   * App Initialization
   */
  function init() {
    initTheme();
    initEvents();

    // Parse Kramdown-rendered DOM
    parseReadmeData();

    // Dismiss skeleton loading
    if (DOM.skeleton) {
      DOM.skeleton.style.display = 'none';
    }

    // Render components
    renderCategoryPills();
    setViewMode(state.viewMode);
  }

  // Kickoff on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
