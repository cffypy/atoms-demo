/* =====================================================================
 * store.js — 本地持久化（localStorage）
 * 数据模型：projects[]（含 messages / versions）+ settings
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});
  const KEY = "atoms_demo_state_v1";

  function blank() {
    return { projects: [], settings: { mode: "offline", baseUrl: "https://api.deepseek.com/v1", apiKey: "", model: "deepseek-chat" } };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const s = JSON.parse(raw);
      if (!s.projects) s.projects = [];
      if (!s.settings) s.settings = blank().settings;
      return s;
    } catch (e) {
      return blank();
    }
  }

  let state = load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("存储失败", e);
    }
  }

  function uid() {
    return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const Store = {
    getState: () => state,
    save: persist,

    getProjects: () => state.projects,
    getProject: (id) => state.projects.find((p) => p.id === id) || null,

    createProject(name) {
      const p = {
        id: uid(),
        name: name || "未命名项目",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        versions: [],
        current: -1,
        accent: "#7c5cff",
        dark: false,
      };
      state.projects.unshift(p);
      persist();
      return p;
    },

    updateProject(id, patch) {
      const p = this.getProject(id);
      if (!p) return null;
      Object.assign(p, patch);
      p.updatedAt = Date.now();
      persist();
      return p;
    },

    deleteProject(id) {
      state.projects = state.projects.filter((p) => p.id !== id);
      persist();
    },

    renameProject(id, name) {
      return this.updateProject(id, { name: name || "未命名项目" });
    },

    addMessage(id, msg) {
      const p = this.getProject(id);
      if (!p) return;
      p.messages.push(Object.assign({ ts: Date.now() }, msg));
      persist();
    },

    addVersion(id, version) {
      const p = this.getProject(id);
      if (!p) return null;
      p.versions.push(version);
      p.current = p.versions.length - 1;
      p.updatedAt = Date.now();
      persist();
      return version;
    },

    setCurrent(id, idx) {
      const p = this.getProject(id);
      if (!p) return;
      p.current = idx;
      persist();
    },

    getSettings: () => state.settings,
    setSettings(patch) {
      Object.assign(state.settings, patch);
      persist();
    },
  };

  App.Store = Store;
})();
