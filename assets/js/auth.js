/* =====================================================================
 * auth.js — 本地账号系统（注册 / 登录 / 会话）
 * 纯前端实现：账号与密码哈希存于浏览器 localStorage，按账号隔离数据。
 * 注意：本地账号无服务端校验，仅用于演示「需登录才能使用」的门槛，
 *       密码仅做 SHA-256 哈希（非明文存储），并不等同于服务端安全。
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});
  const USERS_KEY = "atoms_demo_users_v1";
  const SESSION_KEY = "atoms_demo_session_v1";

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveUsers(u) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {}
  }

  // 密码哈希：优先用 Web Crypto（安全上下文）；非安全上下文（如 file://）降级
  function hash(pw) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw))
        .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
    }
    let h = 5381;
    for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) >>> 0;
    return Promise.resolve("d_" + h.toString(16));
  }

  const Auth = {
    current() {
      try { return localStorage.getItem(SESSION_KEY) || null; }
      catch (e) { return null; }
    },
    isLoggedIn() { return !!this.current(); },

    async register(username, password) {
      username = (username || "").trim();
      if (username.length < 3) return { ok: false, error: "用户名至少 3 个字符" };
      if (!/^[\w\u4e00-\u9fa5-]+$/.test(username)) return { ok: false, error: "用户名仅限字母/数字/中文/下划线/连字符" };
      if (password.length < 6) return { ok: false, error: "密码至少 6 个字符" };
      const users = getUsers();
      if (users[username]) return { ok: false, error: "该用户名已被注册" };
      users[username] = { pw: await hash(password), createdAt: Date.now() };
      saveUsers(users);
      try { localStorage.setItem(SESSION_KEY, username); } catch (e) {}
      return { ok: true };
    },

    async login(username, password) {
      username = (username || "").trim();
      const u = getUsers()[username];
      if (!u) return { ok: false, error: "用户不存在，请先注册" };
      if (u.pw !== (await hash(password))) return { ok: false, error: "密码错误" };
      try { localStorage.setItem(SESSION_KEY, username); } catch (e) {}
      return { ok: true };
    },

    logout() {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    },
  };

  App.Auth = Auth;
})();
