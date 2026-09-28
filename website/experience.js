/* Sample data only: this experience never reads the system clipboard. */
const demoIcons = {
  FileText:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text" aria-hidden="true" focusable="false"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>',
  Image:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>',
  Link: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
  Folder:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" aria-hidden="true" focusable="false"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>',
  Star: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star" aria-hidden="true" focusable="false"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path></svg>',
};
(() => {
  const samples = [
    {
      id: 'hello',
      type: 'text',
      zh: ['常用开场白', '你好！这里有一个值得继续的小想法。'],
      en: ['A friendly hello', 'Hello! Here is a little idea worth coming back to.'],
    },
    {
      id: 'sketch',
      type: 'image',
      zh: ['手绘灵感.png', '把每一次复制，变成下一次创作的起点。'],
      en: ['Hand-drawn idea.png', 'Every copy can be the start of your next idea.'],
    },
    {
      id: 'project',
      type: 'link',
      zh: ['Recopy 项目资料', 'https://github.com/shiqkuangsan/Recopy'],
      en: ['Recopy on GitHub', 'https://github.com/shiqkuangsan/Recopy'],
    },
    {
      id: 'file',
      type: 'file',
      zh: ['灵感清单.pdf', '示例文件 · 灵感清单.pdf · 240 KB'],
      en: ['Idea checklist.pdf', 'Sample file · Idea checklist.pdf · 240 KB'],
    },
    {
      id: 'plan',
      type: 'rich',
      zh: ['下一次创作', '收集灵感 → 整理线索 → 开始创作\n先留下一个小想法，再慢慢让它长大。'],
      en: [
        'The next creation',
        'Collect ideas → Connect the dots → Make something\nSave a little thought, then give it room to grow.',
      ],
    },
    {
      id: 'address',
      type: 'text',
      zh: ['工作室地址', '示例地址：创意路 18 号，二层。'],
      en: ['Studio address', 'Sample address: 18 Creative Lane, second floor.'],
    },
  ];
  const filters = [
    ['all', '全部', 'All'],
    ['text', '文字', 'Text'],
    ['image', '图片', 'Images'],
    ['link', '链接', 'Links'],
    ['file', '文件', 'Files'],
    ['pins', '收藏', 'Pins'],
  ];
  const kinds = {
    text: ['文字', 'Text', 'FileText'],
    image: ['图片', 'Image', 'Image'],
    link: ['链接', 'Link', 'Link'],
    file: ['文件', 'File', 'Folder'],
    rich: ['富文本', 'Rich text', 'FileText'],
  };
  const state = {
    filter: 'all',
    selected: 'hello',
    pins: new Set(['hello']),
    pasted: [],
    message: 'ready',
    copyResult: null,
  };
  const $ = (id) => document.getElementById(id);
  const t = (zh, en) => (currentLang === 'zh' ? zh : en);
  const content = (item) => item[currentLang];
  const selected = () => samples.find((item) => item.id === state.selected);
  function visible() {
    const terms = $('demo-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return samples.filter(
      (item) =>
        (state.filter === 'all' ||
          (state.filter === 'pins'
            ? state.pins.has(item.id)
            : state.filter === 'text'
              ? ['text', 'rich'].includes(item.type)
              : item.type === state.filter)) &&
        terms.every((term) =>
          [...item.zh, ...item.en].join(' ').toLocaleLowerCase().includes(term),
        ),
    );
  }
  function status() {
    const item = selected();
    const messages = {
      ready: t('选择一条记录，试试粘贴到便签。', 'Choose an item, then paste it into the note.'),
      pasted: t(
        '已放入便签。继续找一条，或试试收藏。',
        'Added to your note. Find another item, or try pinning one.',
      ),
      pinned: t('已收藏，可在「收藏」中找到。', 'Pinned. Find it again in Pins.'),
      unpinned: t('已取消收藏。', 'Unpinned.'),
      reset: t('已重置示例，可以重新体验。', 'Samples reset. Try a new flow.'),
      search: t(`找到 ${visible().length} 条示例记录。`, `${visible().length} sample items found.`),
    };
    $('demo-status').textContent = messages[state.message] || messages.ready;
    for (const id of ['demo-paste', 'demo-pin', 'demo-preview-button']) $(id).disabled = !item;
    $('demo-pin').setAttribute('aria-pressed', String(!!item && state.pins.has(item.id)));
    $('demo-pin').querySelector('span').textContent =
      item && state.pins.has(item.id) ? t('取消收藏', 'Unpin') : t('收藏', 'Pin');
  }
  function render() {
    const focusId = document.activeElement?.dataset.sampleId;
    const focusFilter = document.activeElement?.dataset.filter;
    const items = visible();
    if (!items.some((item) => item.id === state.selected)) state.selected = items[0]?.id || null;
    $('demo-filters').replaceChildren(
      ...filters.map(([id, zh, en]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filter = id;
        button.textContent = t(zh, en);
        button.setAttribute('aria-pressed', String(id === state.filter));
        button.addEventListener('click', () => {
          state.filter = id;
          state.message = 'search';
          render();
        });
        return button;
      }),
    );
    $('demo-items').replaceChildren(
      ...items.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'demo-item';
        button.dataset.sampleId = item.id;
        button.setAttribute('aria-pressed', String(item.id === state.selected));
        button.tabIndex = item.id === state.selected ? 0 : -1;
        const top = document.createElement('span');
        top.className = 'demo-item-top';
        top.innerHTML = demoIcons[kinds[item.type][2]];
        top.append(document.createTextNode(t(kinds[item.type][0], kinds[item.type][1])));
        const title = document.createElement('strong');
        title.textContent = content(item)[0];
        const body = document.createElement('span');
        body.className = 'item-description';
        body.textContent = content(item)[1];
        button.append(top, title, body);
        if (state.pins.has(item.id)) {
          const pin = document.createElement('span');
          pin.innerHTML = demoIcons.Star;
          pin.firstElementChild.classList.add('item-pin');
          button.append(pin);
          button.setAttribute('aria-label', `${content(item)[0]}, ${t('已收藏', 'pinned')}`);
        }
        button.addEventListener('click', () => {
          state.selected = item.id;
          state.message = 'ready';
          render();
        });
        return button;
      }),
    );
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'demo-empty';
      empty.textContent = t(
        '没有找到。换个关键词，或切回「全部」试试。',
        'No matches. Try another word or switch back to All.',
      );
      $('demo-items').append(empty);
    }
    $('demo-note').value = state.pasted
      .map((id) => {
        const item = samples.find((sample) => sample.id === id);
        return item.type === 'image'
          ? t(`[示例图片] ${content(item)[0]}`, `[Sample image] ${content(item)[0]}`)
          : content(item)[1];
      })
      .join('\n\n');
    status();
    if (focusId)
      (
        $('demo-items').querySelector(`[data-sample-id="${focusId}"]`) ||
        $('demo-items').querySelector('[tabindex="0"]') ||
        $('demo-search')
      ).focus({ preventScroll: true });
    if (focusFilter)
      $('demo-filters')
        .querySelector(`[data-filter="${focusFilter}"]`)
        ?.focus({ preventScroll: true });
  }
  function paste() {
    if (!selected()) return;
    state.pasted.push(state.selected);
    state.message = 'pasted';
    render();
    $('demo-note').scrollTop = $('demo-note').scrollHeight;
    if (matchMedia('(max-width: 800px)').matches)
      $('demo-note').scrollIntoView({
        block: 'center',
        behavior: reducedMotion.matches ? 'instant' : 'smooth',
      });
  }
  function pin() {
    if (!selected()) return;
    if (state.pins.has(state.selected)) {
      state.pins.delete(state.selected);
      state.message = 'unpinned';
    } else {
      state.pins.add(state.selected);
      state.message = 'pinned';
    }
    render();
  }
  function preview() {
    const item = selected();
    if (!item) return;
    $('sample-dialog-title').textContent = content(item)[0];
    const body = document.createElement('p');
    body.textContent = content(item)[1];
    $('sample-dialog-content').replaceChildren(body);
    if (item.type === 'image') {
      const image = document.createElement('img');
      image.src = 'media/recopy-film-poster.png';
      image.alt = content(item)[0];
      $('sample-dialog-content').prepend(image);
    }
    $('sample-dialog').showModal();
  }
  function renderCopyStatus() {
    $('install-copy-status').textContent =
      state.copyResult === null
        ? ''
        : state.copyResult
          ? t('安装命令已复制。', 'Install command copied.')
          : t(
              '浏览器未允许复制，请选中上方命令手动复制。',
              'Copy was blocked. Select the command above to copy it manually.',
            );
  }
  window.refreshExperience = () => {
    renderCopyStatus();
    if ($('demo-items')) render();
  };
  document.addEventListener('DOMContentLoaded', () => {
    $('demo-search').addEventListener('input', () => {
      state.message = 'search';
      render();
    });
    $('demo-search').addEventListener('keydown', (event) => {
      if (event.isComposing || event.key !== 'ArrowDown') return;
      event.preventDefault();
      $('demo-items').querySelector('[tabindex="0"]')?.focus();
    });
    $('demo-suggestion').addEventListener('click', () => {
      $('demo-search').value = t('灵感', 'idea');
      state.filter = 'all';
      state.message = 'search';
      render();
      $('demo-search').focus();
    });
    $('demo-paste').addEventListener('click', paste);
    $('demo-pin').addEventListener('click', pin);
    $('demo-preview-button').addEventListener('click', preview);
    $('demo-reset').addEventListener('click', () => {
      Object.assign(state, {
        filter: 'all',
        selected: 'hello',
        pins: new Set(['hello']),
        pasted: [],
        message: 'reset',
      });
      $('demo-search').value = '';
      render();
    });
    $('demo-items').addEventListener('keydown', (event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const items = visible();
      const index = items.findIndex((item) => item.id === state.selected);
      if (event.key.startsWith('Arrow') && items.length) {
        event.preventDefault();
        const columns = getComputedStyle($('demo-items')).gridTemplateColumns.split(' ').length;
        const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[
          event.key
        ];
        state.selected = items[(index + delta + items.length) % items.length].id;
        // Move focus after rendering; render otherwise preserves the old card focus.
        render();
        $('demo-items').querySelector('[tabindex="0"]').focus({ preventScroll: true });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        paste();
      } else if (event.key === ' ') {
        event.preventDefault();
        preview();
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        pin();
      }
    });
    document.querySelectorAll('[data-open-film]').forEach((button) =>
      button.addEventListener('click', () => {
        const video = $('recopy-film');
        if (!video.getAttribute('src')) video.src = video.dataset.src;
        $('film-dialog').showModal();
        video.play().catch(() => {
          /* Native controls remain available when playback is blocked. */
        });
      }),
    );
    document
      .querySelectorAll('[data-close-dialog]')
      .forEach((button) =>
        button.addEventListener('click', () => $(button.dataset.closeDialog).close()),
      );
    document.querySelectorAll('dialog').forEach((dialog) =>
      dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        if (
          event.target === dialog &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          dialog.close();
      }),
    );
    $('film-dialog').addEventListener('close', () => $('recopy-film').pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) $('recopy-film').pause();
    });
    document
      .querySelectorAll('#open-product-preview, [data-open-product]')
      .forEach((button) => button.addEventListener('click', openLightbox));
    document.querySelectorAll('[data-open-install],a[href="#install"]').forEach((link) =>
      link.addEventListener('click', () => {
        $('install').open = true;
      }),
    );
    document.querySelector('[data-copy]').addEventListener('click', async (event) => {
      try {
        await navigator.clipboard.writeText(event.currentTarget.dataset.copy);
        state.copyResult = true;
      } catch {
        state.copyResult = false;
      }
      renderCopyStatus();
    });
    render();
  });
})();
