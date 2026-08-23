/* =====================================================================
 * store.js — 本地持久化（localStorage）
 * 数据模型：projects[]（含 messages / versions）+ settings
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});

  // 存储键按登录用户隔离，未登录时落在 guest
  function userKey() {
    const u = (window.App && window.App.Auth && window.App.Auth.current()) || "guest";
    return "atoms_demo_state_v2_" + u;
  }

  function blank() {
    // 默认启用在线 DeepSeek；API Key 优先从 secrets.js（本地/CI 注入）读取，缺失则留空回退离线
    const secretsKey = (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    return { projects: [], settings: { mode: "llm", baseUrl: "https://api.deepseek.com/v1", apiKey: secretsKey, model: "deepseek-chat" } };
  }

  function load() {
    try {
      const raw = localStorage.getItem(userKey());
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
      localStorage.setItem(userKey(), JSON.stringify(state));
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
    // 切换登录账号后，重新从对应用户的存储键载入数据
    reload() { state = load(); },

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
