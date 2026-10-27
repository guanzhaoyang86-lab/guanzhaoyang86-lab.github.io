(() => {
  'use strict';

  const profile = window.ACADEMIC_DATA?.profile ?? {};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const profileUrl = (value, service) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
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
    } catch { /* Leave unconfigured or invalid profile links hidden. */ }
    return null;
  };

  const profileLinks = document.querySelector('.profile-links');
  [
    { service: 'github', label: 'GitHub', value: profile.githubUrl },
    { service: 'scholar', label: 'Google Scholar', value: profile.scholarUrl }
  ].forEach(({ service, label, value }) => {
    const url = profileUrl(value, service);
    if (url && profileLinks) {
      profileLinks.insertAdjacentHTML('beforeend', `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" data-profile-service="${service}">${icon(service)}${label}</a>`);
    }
  });

  let toastTimer;
  function toast(message) {
    const element = document.querySelector('#toast');
    if (!element) return;
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('visible');
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3000);
  }

  async function copyEmail() {
    if (!profile.email) return;
    try {
      await navigator.clipboard.writeText(profile.email);
      toast('Email address copied');
    } catch {
      const field = document.createElement('textarea');
      field.value = profile.email;
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(field);
      field.focus();
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* The email link remains available. */ }
      field.remove();
      document.querySelector('.copy-email')?.focus();
      toast(copied ? 'Email address copied' : 'Please select and copy the email address.');
    }
  }
  document.querySelector('.copy-email')?.addEventListener('click', copyEmail);

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  function closeMenu() {
    nav?.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', 'Open navigation');
  }
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  }

  const sections = [...document.querySelectorAll('main > section[id]')];
  if (nav && sections.length && 'IntersectionObserver' in window) {
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
})();
