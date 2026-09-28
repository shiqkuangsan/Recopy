/* Shared language and theme behavior for the landing and privacy pages. */
const themeIcons = {
  Sun: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>',
  Moon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon" aria-hidden="true" focusable="false"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"></path></svg>',
  Monitor:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" aria-hidden="true" focusable="false"><rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>',
};
let currentLang = ['en', 'zh'].includes(localStorage.getItem('lang'))
  ? localStorage.getItem('lang')
  : navigator.language.startsWith('zh')
    ? 'zh'
    : 'en';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function getThemePreference() {
  return ['light', 'dark', 'system'].includes(localStorage.getItem('theme'))
    ? localStorage.getItem('theme')
    : 'system';
}
function updateDemoPreview() {
  const theme = document.documentElement.dataset.theme || 'light';
  document.querySelectorAll('#demo-preview, [data-product-image]').forEach((img) => {
    img.src = `images/recopy-ui-${theme}.png`;
    img.alt =
      currentLang === 'zh'
        ? 'Recopy 桌面剪贴板历史界面'
        : 'Recopy desktop clipboard history panel (Chinese interface)';
  });
}
function updateThemeIcon() {
  const button = document.querySelector('[data-theme-icon]');
  if (!button) return;
  const pref = getThemePreference();
  button.innerHTML = themeIcons[{ light: 'Sun', dark: 'Moon', system: 'Monitor' }[pref]];
  const labels =
    currentLang === 'zh'
      ? { light: '浅色', dark: '深色', system: '跟随系统' }
      : { light: 'Light', dark: 'Dark', system: 'System' };
  button.setAttribute(
    'aria-label',
    currentLang === 'zh'
      ? `当前主题：${labels[pref]}，点击切换`
      : `Theme: ${labels[pref]}. Change theme`,
  );
}
function applyLang() {
  document.querySelectorAll('[data-en][data-zh]').forEach((el) => {
    const value = el.getAttribute(`data-${currentLang}`);
    if (el.children.length || /<(br|span|strong)\b/.test(value)) el.innerHTML = value;
    else el.textContent = value;
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.textContent = currentLang === 'zh' ? 'English' : '中文';
    toggle.setAttribute('aria-label', currentLang === 'zh' ? 'Switch to English' : '切换为中文');
  }
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  const privacy = location.pathname.endsWith('privacy.html');
  document.title = privacy
    ? currentLang === 'zh'
      ? 'Recopy — 隐私政策'
      : 'Recopy — Privacy Policy'
    : currentLang === 'zh'
      ? 'Recopy — 给剪贴板，多一点记忆。'
      : 'Recopy — A little memory for your clipboard.';
  document
    .querySelectorAll('[data-label-en]')
    .forEach((el) => el.setAttribute('aria-label', el.getAttribute(`data-label-${currentLang}`)));
  document
    .querySelectorAll('[data-placeholder-en]')
    .forEach((el) =>
      el.setAttribute('placeholder', el.getAttribute(`data-placeholder-${currentLang}`)),
    );
  updateDemoPreview();
  updateThemeIcon();
  window.refreshExperience?.();
}
function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('lang', currentLang);
  applyLang();
}
function applyTheme(pref) {
  document.documentElement.dataset.theme =
    pref === 'system' ? (systemTheme.matches ? 'dark' : 'light') : pref;
  updateThemeIcon();
  updateDemoPreview();
}
function toggleTheme() {
  const next = { light: 'dark', dark: 'system', system: 'light' }[getThemePreference()];
  localStorage.setItem('theme', next);
  applyTheme(next);
}
systemTheme.addEventListener('change', () => {
  if (getThemePreference() === 'system') applyTheme('system');
});
function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1))
    return 'other';
  return /Mac/.test(ua) ? 'macos' : /Win/.test(ua) ? 'windows' : 'other';
}
function updateDownloadButtons() {
  const platform = detectPlatform();
  const destination = platform === 'windows' ? '/download/windows' : '#install';
  for (const id of ['download-btn', 'hero-download-btn']) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.href = destination;
    if (destination === '#install')
      button.addEventListener('click', () => {
        document.getElementById('install').open = true;
      });
  }
  const label = document.querySelector('#hero-download-btn span[data-en]');
  if (label) {
    label.dataset.en =
      platform === 'windows'
        ? 'Download for Windows'
        : platform === 'macos'
          ? 'Download for macOS'
          : 'Choose your platform';
    label.dataset.zh =
      platform === 'windows'
        ? '下载 Windows 版'
        : platform === 'macos'
          ? '下载 macOS 版'
          : '选择下载平台';
  }
}
function openLightbox() {
  window.recopyImageViewer.open(document.getElementById('demo-preview'));
}

applyTheme(getThemePreference());
document.addEventListener('DOMContentLoaded', () => {
  updateDownloadButtons();
  applyLang();
});
