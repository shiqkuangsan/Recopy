/** Marks a `pnpm tauri dev` build; Vite strips it from production bundles. */
export function DevBadge() {
  if (!import.meta.env.DEV) return null;
  return (
    <span
      title="Development build (pnpm tauri dev)"
      className="select-none rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-amber-600 dark:text-amber-400"
    >
      Dev
    </span>
  );
}
