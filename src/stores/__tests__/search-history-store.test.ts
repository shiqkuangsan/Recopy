import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchHistoryStore as history } from "../search-history-store";
import { useSettingsStore } from "../settings-store";

beforeEach(() => {
  history.getState().clear();
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, search_history_enabled: "true" },
  }));
});

function search(query: string) {
  history.getState().begin(query);
  history.getState().executed(query);
  history.getState().finish();
}

describe("recent searches", () => {
  it("keeps search usable if local persistence is unavailable", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => search("order")).not.toThrow();
      expect(history.getState().entries).toEqual(["order"]);
    } finally {
      write.mockRestore();
      warning.mockRestore();
    }
  });
  it("records only the final executed query, not typing prefixes", () => {
    history.getState().begin("o");
    history.getState().executed("o");
    history.getState().begin("order");
    history.getState().executed("order");
    expect(history.getState().entries).toEqual([]);
    history.getState().finish();
    expect(history.getState().entries).toEqual(["order"]);
  });
  it("waits for the final search to execute after focus leaves", () => {
    history.getState().begin("order");
    history.getState().finish();
    expect(history.getState().entries).toEqual([]);
    history.getState().executed("order");
    expect(history.getState().entries).toEqual(["order"]);
  });
  it("ignores stale query completion", () => {
    history.getState().begin("old");
    history.getState().begin("new");
    history.getState().executed("old");
    history.getState().finish();
    expect(history.getState().entries).toEqual([]);
  });
  it("trims, deduplicates, promotes reuse and caps at ten", () => {
    for (let i = 0; i < 12; i++) search(`query ${i}`);
    search("  query 3  ");
    search("   ");
    expect(history.getState().entries).toEqual([
      "query 3",
      "query 11",
      "query 10",
      "query 9",
      "query 8",
      "query 7",
      "query 6",
      "query 5",
      "query 4",
      "query 2",
    ]);
  });
  it("does not resurrect a removed query when the session finishes again", () => {
    search("order");
    history.getState().remove("order");
    history.getState().finish();
    expect(history.getState().entries).toEqual([]);
  });
  it("clear cancels pending history writes", () => {
    history.getState().begin("order");
    history.getState().finish();
    history.getState().clear();
    history.getState().executed("order");
    expect(history.getState().entries).toEqual([]);
  });
  it("does not record while disabled and retains previous entries", () => {
    search("previous");
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, search_history_enabled: "false" },
    }));
    search("private");
    expect(history.getState().entries).toEqual(["previous"]);
  });
  it("persists entries but never an unfinished search session", async () => {
    search("saved");
    history.getState().begin("draft");
    const persisted = JSON.parse(localStorage.getItem("recopy-recent-searches")!);
    expect(persisted.state).toEqual({ entries: ["saved"] });
    localStorage.setItem(
      "recopy-recent-searches",
      JSON.stringify({ state: { entries: [" saved ", 4, "", "saved", "another"] }, version: 0 }),
    );
    await history.persist.rehydrate();
    expect(history.getState().entries).toEqual(["saved", "another"]);
  });
});
