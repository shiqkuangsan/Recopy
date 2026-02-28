/**
 * Recopy Landing Page — i18n, Theme, Card Tilt, Blobity, Platform Detection
 */

// ============================================================
// i18n
// ============================================================
let currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('lang', currentLang);
  applyLang();
}

function updateDemoPreview() {
  const img = document.getElementById('demo-preview');
  if (!img) return;
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const lang = currentLang === 'zh' ? 'zh' : 'en';
  img.src = `images/preview-${theme}-${lang}.webp`;
}

function applyLang() {
  document.querySelectorAll('[data-en][data-zh]').forEach(el => {
    const text = el.getAttribute(`data-${currentLang}`);
    if (el.children.length === 0) {
      el.textContent = text;
    } else {
      el.innerHTML = text;
    }
  });

  const btn = document.getElementById('lang-toggle');
  if (btn) btn.textContent = currentLang === 'en' ? '中文' : 'English';

  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

  document.title = currentLang === 'zh'
    ? 'Recopy — 你的每一次复制，都不会再丢失。'
    : 'Recopy — Every copy you make, always within reach.';

  updateDemoPreview();
}

// ============================================================
// 3D Tilt + Spotlight on Feature Cards
// ============================================================
function initCardTilt() {
  const cards = document.querySelectorAll('.feature-card');

  cards.forEach(card => {
    // Inject spotlight overlay
    const spotlight = document.createElement('div');
    spotlight.className = 'card-spotlight';
    card.appendChild(spotlight);

    let isActive = false;
    let cardRect = null;
    let pointerX = 0;
    let pointerY = 0;
    let rafId = 0;

    const maxTilt = 12;
    const edgePadding = 14;
    const tiltStartInset = 12;
    const tiltRampDistance = 26;
    const leaveTolerance = 2;

    function isInsideCardRect(clientX, clientY, tolerance = 0) {
      if (!cardRect) return false;
      return (
        clientX >= cardRect.left - tolerance &&
        clientX <= cardRect.right + tolerance &&
        clientY >= cardRect.top - tolerance &&
        clientY <= cardRect.bottom + tolerance
      );
    }

    function resetTilt() {
      if (!isActive) return;
      isActive = false;
      cardRect = null;
      card.classList.remove('is-tilting');
      card.style.transform = '';
      card.style.boxShadow = '';
      spotlight.style.background = '';
      window.removeEventListener('pointermove', onPointerMove);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function updateTiltFrame() {
      rafId = 0;
      if (!isActive || !cardRect) return;

      if (!isInsideCardRect(pointerX, pointerY, leaveTolerance)) {
        resetTilt();
        return;
      }

      const rawX = pointerX - cardRect.left;
      const rawY = pointerY - cardRect.top;
      const boundedRawX = Math.min(Math.max(rawX, 0), cardRect.width);
      const boundedRawY = Math.min(Math.max(rawY, 0), cardRect.height);

      // Clamp the very edge to keep the first few pixels stable on entry.
      const x = Math.min(Math.max(rawX, edgePadding), cardRect.width - edgePadding);
      const y = Math.min(Math.max(rawY, edgePadding), cardRect.height - edgePadding);
      const centerX = cardRect.width / 2;
      const centerY = cardRect.height / 2;
      const edgeDistance = Math.min(
        boundedRawX,
        cardRect.width - boundedRawX,
        boundedRawY,
        cardRect.height - boundedRawY
      );

      // Ease-in strength from card edge to avoid immediate "border runs away" feel.
      const linearStrength = Math.min(
        Math.max((edgeDistance - tiltStartInset) / tiltRampDistance, 0),
        1
      );
      const tiltStrength = linearStrength * linearStrength * (3 - 2 * linearStrength);

      const rotateY = ((x - centerX) / centerX) * maxTilt * tiltStrength;
      const rotateX = ((centerY - y) / centerY) * maxTilt * tiltStrength;
      const scale = 1 + 0.03 * tiltStrength;

      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.boxShadow = `${-rotateY}px ${rotateX}px 0 var(--border)`;
      spotlight.style.background = `radial-gradient(circle 180px at ${rawX}px ${rawY}px, rgba(255,255,255,0.25), transparent)`;
    }

    function queueTiltFrame() {
      if (rafId) return;
      rafId = requestAnimationFrame(updateTiltFrame);
    }

    function onPointerMove(e) {
      pointerX = e.clientX;
      pointerY = e.clientY;
      queueTiltFrame();
    }

    function onPointerEnter(e) {
      if (e.pointerType === 'touch' || isActive) return;
      cardRect = card.getBoundingClientRect();
      isActive = true;
      card.classList.add('is-tilting');
      pointerX = e.clientX;
      pointerY = e.clientY;
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      queueTiltFrame();
    }

    function onPointerLeave(e) {
      if (!isActive) return;
      pointerX = e.clientX;
      pointerY = e.clientY;

      // Some leaves are caused by 3D projection changes near edges.
      // Defer a tick and only reset when pointer is truly outside the base rect.
      requestAnimationFrame(() => {
        if (!isActive) return;
        if (!isInsideCardRect(pointerX, pointerY, leaveTolerance)) {
          resetTilt();
        }
      });
    }

    card.addEventListener('pointerenter', onPointerEnter);
    card.addEventListener('pointerleave', onPointerLeave);
    card.addEventListener('pointercancel', resetTilt);
    window.addEventListener('blur', resetTilt);
  });
}

// ============================================================
// Theme Toggle (light → dark → system → light)
// ============================================================
function getSystemTheme() {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveTheme(pref) {
  if (pref === 'system' || !pref) return getSystemTheme();
  return pref;
}

function updateThemeIcon(pref) {
  const btn = document.querySelector('[data-theme-icon]');
  if (!btn) return;
  if (pref === 'light') btn.textContent = '☀️';
  else if (pref === 'dark') btn.textContent = '🌙';
  else btn.textContent = '🖥️';
}

function updateBlobityForTheme(theme) {
  if (!window.__blobity) return;
  if (theme === 'dark') {
    window.__blobity.updateOptions({ color: '#ffffff', dotColor: '#059669', fontColor: '#0d1117' });
  } else {
    window.__blobity.updateOptions({ color: '#190a11', dotColor: '#f59e0b', fontColor: '#000000' });
  }
}

function applyTheme(pref) {
  const effective = getEffectiveTheme(pref);
  document.documentElement.setAttribute('data-theme', effective);
  updateThemeIcon(pref);
  updateBlobityForTheme(effective);
  updateDemoPreview();
}

function toggleTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  const next = saved === 'light' ? 'dark' : saved === 'dark' ? 'system' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
}

// On load: restore theme preference
(function initTheme() {
  const saved = localStorage.getItem('theme');
  const pref = saved || 'light';
  applyTheme(pref);

  // Listen for system theme changes when preference is "system"
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = localStorage.getItem('theme');
    if (current === 'system' || !current) applyTheme('system');
  });
})();

// ============================================================
// Blobity Cursor
// ============================================================
import('https://esm.sh/blobity@0.2.3').then(({ default: Blobity }) => {
  // Skip touch devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

  const blobity = new Blobity({
    licenseKey: 'opensource',
    invert: true,
    zIndex: 50,
    color: '#190a11',
    dotColor: '#f59e0b',    // Amber accent
    radius: 6,
    magnetic: false,
    mode: 'normal',
    focusableElements: 'a, button, [data-blobity]',
    focusableElementsOffsetX: 5,
    focusableElementsOffsetY: 4,
    font: "'Space Grotesk', system-ui, sans-serif",
    fontSize: 15,
    fontWeight: 600,
    fontColor: '#000000',
    tooltipPadding: 12,
  });

  window.__blobity = blobity;
  document.body.classList.add('blobity-active');

  // Apply dark mode colors if already in dark theme
  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    blobity.updateOptions({ color: '#ffffff', dotColor: '#059669', fontColor: '#0d1117' });
  }

  // Scroll bounce
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      blobity.bounce();
      scrollTimeout = null;
    }, 150);
  }, { passive: true });
}).catch(() => {
  // Blobity load failed — graceful fallback, default cursor stays
});

// ============================================================
// Platform Detection
// ============================================================
function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return 'macos';
  if (/Win/.test(ua)) return 'windows';
  return 'other';
}

function updateDownloadButtons() {
  const platform = detectPlatform();
  const downloadBtn = document.getElementById('download-btn');
  const heroBtn = document.getElementById('hero-download-btn');
  const heroSpan = heroBtn ? heroBtn.querySelector('span[data-en]') : null;
  const ctaBtn = document.getElementById('cta-download-btn');

  if (platform === 'windows') {
    if (downloadBtn) {
      downloadBtn.setAttribute('data-en', 'Download for Windows');
      downloadBtn.setAttribute('data-zh', '下载 Windows 版');
    }
    if (heroSpan) {
      heroSpan.setAttribute('data-en', 'Download for Windows');
      heroSpan.setAttribute('data-zh', '下载 Windows 版');
    }
    if (ctaBtn) {
      ctaBtn.setAttribute('data-en', 'Download for Windows');
      ctaBtn.setAttribute('data-zh', '下载 Windows 版');
    }
  }
  // macOS is the default text, no change needed
  // 'other' also uses generic text
}

// ============================================================
// Lightbox
// ============================================================
function openLightbox() {
  const src = document.getElementById('demo-preview').src;
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = src;
  lightbox.classList.add('is-open');
  document.addEventListener('keydown', closeLightboxOnEsc);
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('is-open');
  document.removeEventListener('keydown', closeLightboxOnEsc);
}

function closeLightboxOnEsc(e) {
  if (e.key === 'Escape') closeLightbox();
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  updateDownloadButtons();
  applyLang();
  initCardTilt();
});
