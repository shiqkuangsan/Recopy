// Copied into an isolated worktree only; uses real IPC, stores and rendered components.
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useClipboardStore } from "./stores/clipboard-store";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const paint = async () => { await frame(); await frame(); };
const waitFor = async (ready: () => boolean) => {
  const deadline = performance.now() + 15000;
  while (!ready()) {
    if (performance.now() > deadline) throw new Error("UI readiness timeout");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};
const store = () => useClipboardStore.getState();

async function run() {
  await waitFor(() => document.querySelector('[role="combobox"]') !== null);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await invoke("native_perf_show");
  await store().onPanelShow("latest");
  await waitFor(() => store().items.length > 0 && !store().loading);
  await paint();
  const ready = { phase: "ready", navigation_to_ready_ms: performance.now(), items: store().items.length };
  await invoke("native_perf_record", { payload: ready });
  const searches = [];
  for (const query of ["rcp", "中文", "中文 rcp", "missingneedle", "中文备注"]) {
    for (let repeat = 0; repeat < 5; repeat++) {
      const start = performance.now();
      store().setSearchQuery(query);
      await store().searchItems(query);
      await paint();
      searches.push({ query, repeat, ms: performance.now() - start, count: store().items.length });
    }
  }
  await store().clearSearch();
  await paint();
  const scroller = [...document.querySelectorAll<HTMLElement>("div")].find(
    (node) => node.scrollWidth > node.clientWidth + 500 && getComputedStyle(node).overflowX === "auto",
  );
  if (!scroller) throw new Error("Horizontal list scroller not found");
  const gaps: number[] = [];
  let previous = performance.now();
  for (let i = 0; i < 180; i++) {
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) * ((i % 90) / 89);
    await frame();
    const now = performance.now(); gaps.push(now - previous); previous = now;
  }
  await paint();
  const cards = document.querySelectorAll("[data-note-item-id]").length;
  const listLoadedItems = store().items.length;
  const previews: { id: string; ms: number; width: number; height: number }[] = [];
  const images = await invoke<{ id: string; image_path: string }[]>("get_clipboard_items", {
    contentType: "image", limit: 10, offset: 0,
  });
  let thumbnailReadyMs: number | null = null;
  if (images.length) {
    const start = performance.now();
    store().setFilterType("image");
    await waitFor(() => !store().loading && store().items.length === images.length);
    await waitFor(() => [...document.querySelectorAll<HTMLImageElement>("[data-note-item-id] img")]
      .filter((img) => img.complete && img.naturalWidth > 0).length >= images.length);
    await paint(); thumbnailReadyMs = performance.now() - start;
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const image of images) {
        let seen: { width: number; height: number } | null = null;
        const unlisten = await listen<{ src: string; width: number; height: number }>("native-preview-painted", (event) => {
          if (decodeURIComponent(event.payload.src).endsWith(image.image_path)) seen = event.payload;
        });
        const open = performance.now();
        try {
          await invoke("show_preview_window", { id: image.id });
          await waitFor(() => seen !== null);
          const dimensions = seen as unknown as { width: number; height: number };
          previews.push({ id: image.id, ms: performance.now() - open, ...dimensions });
        } finally { unlisten(); }
        await invoke("hide_preview_window");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  await invoke("native_perf_record", { payload: {
    phase: "complete", ready, searches, previews, thumbnail_ready_ms: thumbnailReadyMs, scroll_frame_gaps_ms: gaps,
    rendered_cards: cards, loaded_items: listLoadedItems,
    viewport: { width: innerWidth, height: innerHeight },
    user_agent: navigator.userAgent,
  }});
}
if (!new URLSearchParams(location.search).has("page")) {
  setTimeout(() => void run().catch((error) => invoke("native_perf_record", {
    payload: { phase: "error", error: String(error) },
  })), 0);
}

// Confirm actual image load in the separate native preview WebView.
if (new URLSearchParams(location.search).get("page") === "preview") {
  let lastSource = "";
  const check = () => {
    const image = document.querySelector<HTMLImageElement>('img[alt="Preview"]');
    if (!image || image.src === lastSource) return;
    const source = image.src;
    const ready = async () => {
      if (!image.complete || image.naturalWidth === 0 || image.src !== source || source === lastSource) return;
      lastSource = source;
      await paint();
      await emit("native-preview-painted", { src: source, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.addEventListener("load", () => void ready(), { once: true });
    void ready();
  };
  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  check();
}
