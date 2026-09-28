/* Display the supplied PNG pixels directly; zoom changes layout, never the source. */
(() => {
  const dialog = document.getElementById('lightbox');
  const stage = document.getElementById('viewer-stage');
  const canvas = document.getElementById('viewer-canvas');
  const image = document.getElementById('lightbox-img');
  const status = document.getElementById('viewer-status');
  const original = document.getElementById('viewer-original');
  const out = document.getElementById('viewer-zoom-out');
  const into = document.getElementById('viewer-zoom-in');
  const actual = document.getElementById('viewer-actual');
  const fit = document.getElementById('viewer-fit');
  const pointers = new Map();
  const initialScale = 0.5;
  let scale = initialScale,
    ready = false,
    fitted = false,
    sequence = 0;
  const t = (zh, en) => (currentLang === 'zh' ? zh : en);
  const fitScale = () =>
    Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight, 1);
  function controls() {
    document.getElementById('viewer-scale').textContent = `${Math.round(scale * 100)}%`;
    into.disabled = !ready || scale >= 2;
    out.disabled = !ready || scale <= fitScale() + 0.001;
    actual.disabled = fit.disabled = !ready;
    actual.setAttribute('aria-pressed', String(ready && Math.abs(scale - 1) < 0.001));
    fit.setAttribute('aria-pressed', String(ready && fitted));
  }
  function zoom(value, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
    if (!ready) return;
    const oldW = image.naturalWidth * scale,
      oldH = image.naturalHeight * scale;
    const imageX = (stage.scrollLeft + x - Math.max(0, (stage.clientWidth - oldW) / 2)) / scale;
    const imageY = (stage.scrollTop + y - Math.max(0, (stage.clientHeight - oldH) / 2)) / scale;
    scale = Math.max(fitScale(), Math.min(2, value));
    const width = image.naturalWidth * scale,
      height = image.naturalHeight * scale;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    stage.scrollLeft = imageX * scale + Math.max(0, (stage.clientWidth - width) / 2) - x;
    stage.scrollTop = imageY * scale + Math.max(0, (stage.clientHeight - height) / 2) - y;
    controls();
  }
  function fitImage() {
    fitted = true;
    zoom(fitScale());
  }
  function actualSize() {
    fitted = false;
    zoom(1);
  }
  function step(factor) {
    fitted = false;
    zoom(scale * factor);
  }
  window.recopyImageViewer = {
    async open(source) {
      const ticket = ++sequence;
      ready = false;
      fitted = false;
      scale = initialScale;
      canvas.hidden = true;
      original.href = source.src;
      image.src = source.src;
      image.alt = source.alt;
      dialog.showModal();
      stage.setAttribute('aria-busy', 'true');
      status.textContent = t('正在载入原图…', 'Loading the original image…');
      controls();
      try {
        await image.decode();
        if (ticket !== sequence || !dialog.open) return;
        canvas.hidden = false;
        ready = true;
        zoom(initialScale);
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
        stage.setAttribute('aria-busy', 'false');
        status.textContent = t(
          `${image.naturalWidth} × ${image.naturalHeight} px · 拖动 / 双指缩放 · 加减键缩放，0 原尺寸，F 适应窗口。`,
          `${image.naturalWidth} × ${image.naturalHeight} px · Drag / pinch to explore · +/− zoom, 0 actual size, F fit.`,
        );
        stage.focus({ preventScroll: true });
      } catch {
        if (ticket !== sequence || !dialog.open) return;
        stage.setAttribute('aria-busy', 'false');
        status.textContent = t(
          '图片未能载入，请尝试「打开原图」。',
          'The image could not load. Try “Open original”.',
        );
      }
    },
  };
  into.addEventListener('click', () => step(1.25));
  out.addEventListener('click', () => step(0.8));
  fit.addEventListener('click', fitImage);
  actual.addEventListener('click', actualSize);
  dialog.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (['+', '=', '-', '0', 'f', 'F'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '-') step(0.8);
      else if (event.key === '0') actualSize();
      else if (event.key.toLowerCase() === 'f') fitImage();
      else step(1.25);
    }
  });
  stage.addEventListener('dblclick', (event) => {
    if (event.pointerType === 'touch') return;
    if (Math.abs(scale - 1) < 0.001) fitImage();
    else actualSize();
  });
  stage.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey || !ready) return;
      event.preventDefault();
      fitted = false;
      const rect = stage.getBoundingClientRect();
      zoom(
        scale * Math.exp(-event.deltaY * 0.01),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    { passive: false },
  );
  stage.addEventListener('pointerdown', (event) => {
    if (!ready || event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const previous = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      stage.scrollLeft -= event.clientX - old.x;
      stage.scrollTop -= event.clientY - old.y;
    } else if (pointers.size === 2) {
      const next = [...pointers.values()];
      const distance = (points) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const before = distance(previous),
        after = distance(next);
      if (before < 1 || after < 1) return;
      const rect = stage.getBoundingClientRect();
      const x = (next[0].x + next[1].x) / 2,
        y = (next[0].y + next[1].y) / 2;
      fitted = false;
      zoom((scale * after) / before, x - rect.left, y - rect.top);
      stage.scrollLeft -= x - (previous[0].x + previous[1].x) / 2;
      stage.scrollTop -= y - (previous[0].y + previous[1].y) / 2;
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) stage.classList.remove('is-dragging');
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    stage.addEventListener(name, release);
  dialog.addEventListener('close', () => {
    sequence++;
    ready = false;
    pointers.clear();
    stage.classList.remove('is-dragging');
  });
  new ResizeObserver(() => {
    if (ready && dialog.open) {
      if (fitted) fitImage();
      else zoom(scale);
    }
  }).observe(stage);
})();
