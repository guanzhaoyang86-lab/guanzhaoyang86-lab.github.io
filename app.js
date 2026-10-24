(() => {
  'use strict';
  const data = window.ACADEMIC_DATA;
  if (!data) return;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const isGuan = name => /^(?:Zhaoyang Guan|Z\. Guan)$/i.test(name.trim());
  const externalUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
    catch { return null; }
  };
  const profileUrl = (value, service) => {
    const normalized = externalUrl(value);
    if (!normalized) return null;
    const url = new URL(normalized);
    if (url.username || url.password || url.port) return null;
    if (service === 'github') {
      return url.hostname === 'github.com' && /^\/[^/]+\/?$/.test(url.pathname) ? url.href : null;
    }
    if (service === 'scholar') {
      return url.hostname === 'scholar.google.com'
        && /^\/citations\/?$/.test(url.pathname)
        && Boolean(url.searchParams.get('user')?.trim())
        && url.searchParams.get('view_op') !== 'search_authors'
        && !url.searchParams.has('mauthors') ? url.href : null;
    }
    return null;
  };
  const profileLinks = document.querySelector('.profile-links');
  [
    { service: 'github', label: 'GitHub', value: data.profile.githubUrl },
    { service: 'scholar', label: 'Google Scholar', value: data.profile.scholarUrl }
  ].forEach(({ service, label, value }) => {
    const url = profileUrl(value, service);
    if (url && profileLinks) {
      profileLinks.insertAdjacentHTML('beforeend', `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" data-profile-service="${service}">${icon(service)}${label}</a>`);
    }
  });
  let filter = 'all';
  let toastTimer;
  let currentCitation = '';
  const list = document.querySelector('#publication-list');
  const dialog = document.querySelector('#citation-dialog');
  const repositoryStars = new Map();
  const validStarCount = value => Number.isSafeInteger(value) && value >= 0;

  function repositoryState(paper) {
    if (typeof paper.githubRepo !== 'string') return null;
    const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/.exec(paper.githubRepo);
    if (!match || match[2] === '.' || match[2] === '..') return null;
    const key = paper.githubRepo.toLowerCase();
    if (!repositoryStars.has(key)) {
      const date = typeof paper.githubStarsCheckedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paper.githubStarsCheckedAt)
        ? new Date(`${paper.githubStarsCheckedAt}T00:00:00Z`) : null;
      const checkedAt = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === paper.githubStarsCheckedAt
        ? paper.githubStarsCheckedAt : null;
      repositoryStars.set(key, {
        key,
        repo: paper.githubRepo,
        count: validStarCount(paper.githubStars) ? paper.githubStars : null,
        checkedAt,
        status: 'loading',
        requested: false
      });
    }
    return repositoryStars.get(key);
  }

  function starLabel(state) {
    const count = state.count === null ? 'Stars' : state.count.toLocaleString('en-US');
    if (state.status === 'live') return { count, description: `${count} GitHub stars. Retrieved from GitHub during this page visit.` };
    const snapshot = state.count === null ? 'GitHub star count unavailable.'
      : `${count} GitHub stars. Verified snapshot${state.checkedAt ? ` from ${state.checkedAt}` : ' (date unavailable)'}.`;
    return { count, description: `${snapshot} ${state.status === 'loading' ? 'Refreshing from GitHub.' : 'Live count unavailable.'}` };
  }

  function repositoryActions(paper) {
    const state = repositoryState(paper);
    if (!state) return '';
    const url = `https://github.com/${state.repo}`;
    const label = starLabel(state);
    return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Code</a><a class="github-stars" href="${escape(url)}/stargazers" target="_blank" rel="noopener noreferrer" data-github-stars="${escape(state.key)}" data-star-status="${state.status}" title="${escape(label.description)}" aria-label="${escape(label.description)}"><span aria-hidden="true">★</span><span data-star-count>${escape(label.count)}</span></a>`;
  }

  function updateVisibleStars(state) {
    const label = starLabel(state);
    list.querySelectorAll('[data-github-stars]').forEach(link => {
      if (link.dataset.githubStars !== state.key) return;
      link.querySelector('[data-star-count]').textContent = label.count;
      link.dataset.starStatus = state.status;
      link.title = label.description;
      link.setAttribute('aria-label', label.description);
    });
  }

  async function refreshRepositoryStars(state) {
    if (state.requested) return;
    state.requested = true;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 6000) : null;
    try {
      const response = await fetch(`https://api.github.com/repos/${state.repo}`, {
        credentials: 'omit',
        headers: { Accept: 'application/vnd.github+json' },
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!response.ok) throw new Error('GitHub stars unavailable');
      const repository = await response.json();
      if (!validStarCount(repository?.stargazers_count)) throw new Error('Invalid GitHub star count');
      state.count = repository.stargazers_count;
      state.status = 'live';
    } catch {
      state.status = 'fallback';
    } finally {
      clearTimeout(timeout);
    }
    updateVisibleStars(state);
  }

  function toast(message) {
    const element = document.querySelector('#toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('visible');
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3000);
  }

  async function copy(text, success) {
    try {
      await navigator.clipboard.writeText(text);
      toast(success);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      (dialog.open ? dialog : document.body).append(field);
      field.focus();
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* Manual selection remains available. */ }
      field.remove();
      toast(copied ? success : 'Please select and copy the text.');
    }
  }

  function authorMarkup(paper) {
    return paper.authors.map(name => isGuan(name)
      ? `<strong>${escape(name)}${paper.equalContribution ? '*' : ''}</strong>`
      : escape(name)).join(', ');
  }

  function renderPublications() {
    const papers = data.papers.filter(paper => filter === 'all' || (filter === 'published' ? paper.status === 'Published' : paper.status !== 'Published'));
    list.innerHTML = papers.map(paper => {
      const url = externalUrl(paper.url);
      const title = url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(paper.title)}</a>` : escape(paper.title);
      return `<article class="publication" id="paper-${escape(paper.id)}">
        <span class="publication-year">${escape(paper.year)}</span>
        <div><h3 class="publication-title">${title}</h3>
        <p class="publication-authors">${authorMarkup(paper)}</p>
        <div class="publication-meta"><span class="publication-venue">${escape(paper.venue)}</span>${paper.status !== 'Published' ? `<span class="status-badge">${escape(paper.status)}</span>` : ''}${paper.equalContribution ? '<span class="status-badge">Co-first author</span>' : ''}</div>
        <div class="publication-actions">${url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${url.includes('arxiv.org') ? 'arXiv' : 'Paper'}${icon('external')}</a>` : ''}${repositoryActions(paper)}<button type="button" data-cite="${escape(paper.id)}" aria-label="Cite ${escape(paper.title)}">Cite ${icon('copy')}</button></div>
        ${paper.summary ? `<details><summary>Research focus</summary><p>${escape(paper.summary)}</p></details>` : ''}
        </div></article>`;
    }).join('');
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
      const count = data.papers.filter(paper => button.dataset.filter === 'all' || (button.dataset.filter === 'published' ? paper.status === 'Published' : paper.status !== 'Published')).length;
      button.querySelector('span').textContent = count;
    });
  }

  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    renderPublications();
  }));

  list.addEventListener('click', event => {
    const trigger = event.target.closest('[data-cite]');
    if (!trigger) return;
    const paper = data.papers.find(item => item.id === trigger.dataset.cite);
    if (!paper) return;
    currentCitation = `${paper.authors.join(', ')} (${paper.year}). ${paper.title}. ${paper.venue}.${paper.status !== 'Published' ? ` ${paper.status}.` : ''}${paper.url ? `\n${paper.url}` : ''}`;
    document.querySelector('#citation-text').textContent = currentCitation;
    dialog.showModal();
  });
  document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  document.querySelector('.copy-citation').addEventListener('click', () => copy(currentCitation, 'Citation copied to clipboard'));
  document.querySelector('.copy-email').addEventListener('click', () => copy(data.profile.email, 'Email address copied'));


  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  function closeMenu() { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open navigation'); }
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

  document.querySelectorAll('[data-paper-target]').forEach(link => link.addEventListener('click', () => {
    if (filter !== 'all') { filter = 'all'; renderPublications(); }
    const paper = document.querySelector(`#paper-${link.dataset.paperTarget}`);
    if (paper) { paper.classList.remove('highlighted'); requestAnimationFrame(() => paper.classList.add('highlighted')); }
  }));

  if ('IntersectionObserver' in window) {
    const sections = [...document.querySelectorAll('main > section[id]')];
    const observer = new IntersectionObserver(() => {
      let current = sections[0].id;
      sections.forEach(section => { if (section.getBoundingClientRect().top <= 180) current = section.id; });
      nav.querySelectorAll('a').forEach(link => {
        if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-80px 0px -60% 0px', threshold: [0, 1] });
    sections.forEach(section => observer.observe(section));
  }
  renderPublications();
  repositoryStars.forEach(state => {
    refreshRepositoryStars(state).catch(() => { /* A star update must not interrupt the homepage. */ });
  });
})();
