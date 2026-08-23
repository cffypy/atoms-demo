/* =====================================================================
 * app.js — 主控制器：UI 联动 / 流式生成 / 版本管理 / 分享 / 设置
 * ===================================================================== */
(function () {
  const App = window.App;
  const S = App.Store;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    sessionList: $("sessionList"), searchSessions: $("searchSessions"), sessionCount: $("sessionCount"),
    chatTitle: $("chatTitle"), chatMeta: $("chatMeta"), messageList: $("messageList"),
    promptInput: $("promptInput"), btnSend: $("btnSend"), stepBar: $("stepBar"),
    previewFrame: $("previewFrame"), previewEmpty: $("previewEmpty"), previewUrl: $("previewUrl"),
    codeEditor: $("codeEditor"), versionBar: $("versionBar"),
    modeHint: $("modeHint"), welcome: $("welcome"), exampleChips: $("exampleChips"),
    settingsModal: $("settingsModal"),
  };

  let currentId = null;
  let generating = false;

  // ---------- 初始化 ----------
  function init() {
    const shared = App.Share.getSharedFromHash();
    if (shared) { App.Share.renderShared(shared); return; }

    bindEvents();
    bindAuthEvents();

    if (App.Auth.isLoggedIn()) enterApp();
    else showAuthGate();
  }

  // 已登录后进入主应用
  function enterApp() {
    S.reload(); // 载入当前登录用户的数据
    const u = App.Auth.current();
    $("userBadge").textContent = "👤 " + u;
    $("userBadge").classList.remove("hidden");
    $("btnLogout").classList.remove("hidden");
    $("authModal").classList.add("hidden");

    // 若构建时已注入 DeepSeek Key（secrets.js），确保默认走在线模式并填充 Key
    const sec = window.ATOMS_SECRETS;
    if (sec && sec.apiKey && !S.getSettings().apiKey) {
      S.setSettings({ apiKey: sec.apiKey, mode: "llm" });
    }

    renderSessions();
    const projects = S.getProjects();
    if (projects.length) selectProject(projects[0].id);
    else { const p = S.createProject("我的第一个 Atoms 项目"); renderSessions(); selectProject(p.id); }
    updateModeHint();
    buildExampleChips();
  }

  // ---------- 登录 / 注册 / 找回密码 门面 ----------
  let authMode = "login";
  function showAuthGate() {
    $("authModal").classList.remove("hidden");
    $("authError").classList.add("hidden");
    applyAuthMode();
    setTimeout(() => { const i = $("authUser"); if (i) i.focus(); }, 60);
  }
  function showAuthError(msg) {
    const e = $("authError"); e.textContent = msg; e.classList.remove("hidden");
  }
  // 根据当前模式（login/register/reset）切换可见字段与按钮文案
  function applyAuthMode() {
    const isReset = authMode === "reset";
    const isReg = authMode === "register";
    document.querySelectorAll(".auth-tab").forEach((x) => x.classList.toggle("active", x.dataset.auth === authMode));
    $("authTabs").classList.toggle("hidden", isReset);
    $("authEmailField").classList.toggle("hidden", !(isReg || isReset));
    $("authEmailLabel").textContent = isReset ? "注册邮箱" : "邮箱（可选，用于找回密码）";
    $("authPassLabel").textContent = isReset ? "新密码" : "密码";
    $("authRememberField").classList.toggle("hidden", authMode !== "login");
    $("authLinks").classList.toggle("hidden", authMode !== "login");
    $("authBack").classList.toggle("hidden", !isReset);
    $("authSubmit").textContent = isReset ? "重置密码" : isReg ? "注册并进入" : "登录";
    $("authError").classList.add("hidden");
    $("authPass").value = "";
    $("authEmail").value = "";
    $("authRemember").checked = true;
  }
  function bindAuthEvents() {
    const submit = async () => {
      const user = $("authUser").value.trim();
      const pass = $("authPass").value;
      const email = $("authEmail").value.trim();
      if (!user) { showAuthError("请输入用户名"); return; }

      let res;
      if (authMode === "register") {
        if (!pass) { showAuthError("请设置密码"); return; }
        res = await App.Auth.register(user, pass, email);
      } else if (authMode === "reset") {
        if (!email) { showAuthError("请输入注册邮箱"); return; }
        if (!pass) { showAuthError("请输入新密码"); return; }
        res = await App.Auth.resetPassword(user, email, pass);
      } else {
        if (!pass) { showAuthError("请输入密码"); return; }
        res = await App.Auth.login(user, pass, $("authRemember").checked);
      }

      if (res.ok) {
        $("authUser").value = ""; $("authPass").value = ""; $("authEmail").value = "";
        if (authMode === "reset") {
          toast("密码已重置，请使用新密码登录");
          authMode = "login"; applyAuthMode();
        } else {
          enterApp();
          toast(authMode === "register" ? "注册成功，已登录" : "登录成功");
        }
      } else {
        showAuthError(res.error);
      }
    };
    $("authSubmit").onclick = submit;
    $("authPass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    $("authUser").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if ($("authEmail").offsetParent !== null) $("authEmail").focus();
        else $("authPass").focus();
      }
    });
    document.querySelectorAll(".auth-tab").forEach((t) => {
      t.onclick = () => {
        authMode = t.dataset.auth;
        applyAuthMode();
        const i = authMode === "register" ? $("authEmail") : $("authPass");
        i.focus();
      };
    });
    $("authForgot").onclick = (e) => { e.preventDefault(); authMode = "reset"; applyAuthMode(); $("authUser").focus(); };
    $("authBack").onclick = (e) => { e.preventDefault(); authMode = "login"; applyAuthMode(); $("authUser").focus(); };
    $("btnLogout").onclick = () => {
      App.Auth.logout();
      currentId = null;
      $("userBadge").classList.add("hidden");
      $("btnLogout").classList.add("hidden");
      authMode = "login";
      showAuthGate();
      toast("已退出登录");
    };
  }

  // ---------- 示例 chips ----------
  const EXAMPLES = [
    "生成一个待办事项清单网页，支持添加、完成和删除",
    "做一个支持加减乘除的计算器",
    "生成一个 SaaS 产品落地页",
    "做一个数据可视化仪表盘",
    "写一个番茄钟专注计时器",
    "生成一个猜数字小游戏",
  ];
  function buildExampleChips() {
    el.exampleChips.innerHTML = "";
    EXAMPLES.forEach((p) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = p;
      b.onclick = () => { el.promptInput.value = p; sendPrompt(); };
      el.exampleChips.appendChild(b);
    });
  }

  // ---------- 会话列表 ----------
  function renderSessions(filter) {
    const list = S.getProjects().filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
    el.sessionList.innerHTML = "";
    list.forEach((p) => {
      const li = document.createElement("li");
      li.className = "session-item" + (p.id === currentId ? " active" : "");
      const last = p.versions.length ? p.versions[p.versions.length - 1].prompt : "暂无生成";
      li.innerHTML =
        "<span class='si-title'>" + escapeHtml(p.name) + "</span>" +
        "<span class='si-meta'>" + p.versions.length + " 个版本 · " + escapeHtml(last.slice(0, 18)) + "</span>";
      li.onclick = () => selectProject(p.id);
      const del = document.createElement("span");
      del.className = "si-del";
      del.textContent = "🗑";
      del.onclick = (e) => { e.stopPropagation(); deleteProject(p.id); };
      li.appendChild(del);
      el.sessionList.appendChild(li);
    });
    el.sessionCount.textContent = S.getProjects().length + " 个项目";
  }

  function selectProject(id) {
    currentId = id;
    const p = S.getProject(id);
    if (!p) return;
    el.chatTitle.textContent = p.name;
    el.chatMeta.textContent = p.versions.length ? p.versions.length + " 个版本" : "智能体就绪";
    renderChat(p);
    renderVersions(p);
    const v = p.versions[p.current];
    if (v) { setPreview(v.code); setCode(v.code); el.previewUrl.textContent = "app://preview/V" + (p.current + 1); }
    else { clearPreview(); }
    renderSessions(el.searchSessions.value);
  }

  // ---------- 对话渲染 ----------
  function renderChat(p) {
    el.messageList.innerHTML = "";
    if (!p.messages.length) { el.messageList.appendChild(el.welcome); el.welcome.classList.remove("hidden"); return; }
    el.welcome.classList.add("hidden");
    p.messages.forEach((m) => el.messageList.appendChild(renderMessage(m)));
    scrollChat();
  }

  function renderMessage(m) {
    if (m.role === "user") {
      const wrap = document.createElement("div");
      wrap.className = "msg user";
      wrap.innerHTML = "<div class='avatar'>🧑</div><div class='bubble'>" + escapeHtml(m.text) + "</div>";
      return wrap;
    }
    // assistant
    const wrap = document.createElement("div");
    wrap.className = "msg assistant";
    let inner = "<div class='avatar'>⚛</div><div class='bubble'>";
    inner += "<div>" + escapeHtml(m.text) + "</div>";
    if (m.versionIndex != null) {
      inner +=
        "<div class='version-card'><div class='vc-info'><div class='vc-title'>版本 V" + (m.versionIndex + 1) + "</div>" +
        "<div class='vc-sub'>" + escapeHtml(m.prompt || "") + " · " + new Date(m.ts).toLocaleTimeString() + "</div></div>" +
        "<div class='vc-actions'><button class='mini-btn' data-act='view' data-v='" + m.versionIndex + "'>预览</button>" +
        "<button class='mini-btn' data-act='copy' data-v='" + m.versionIndex + "'>复制</button>" +
        "<button class='mini-btn' data-act='dl' data-v='" + m.versionIndex + "'>下载</button></div></div>";
    }
    inner += "</div>";
    wrap.innerHTML = inner;
    wrap.querySelectorAll("[data-act]").forEach((btn) => {
      btn.onclick = () => handleVersionAction(btn.getAttribute("data-act"), parseInt(btn.getAttribute("data-v")));
    });
    return wrap;
  }

  // ---------- 发送 ----------
  function sendPrompt() {
    if (generating) return;
    const text = el.promptInput.value.trim();
    if (!text) return;
    const p = S.getProject(currentId);
    if (!p) return;

    // 隐藏欢迎
    el.welcome.classList.add("hidden");
    S.addMessage(currentId, { role: "user", text });
    el.messageList.appendChild(renderMessage({ role: "user", text }));
    el.promptInput.value = "";
    autoGrow();
    scrollChat();

    generating = true;
    el.btnSend.disabled = true;
    el.chatMeta.textContent = "智能体生成中…";

    const prevCode = p.versions.length ? p.versions[p.current].code : null;

    // 助手占位
    const card = document.createElement("div");
    card.className = "msg assistant";
    card.innerHTML = "<div class='avatar'>⚛</div><div class='bubble'><div class='agent-card'>" +
      "<div class='agent-head'>⚛ 智能体正在工作</div><div class='agent-steps' id='steps_" + Date.now() + "'></div>" +
      "<pre class='stream-code cursor-blink' id='stream_" + Date.now() + "'></pre></div></div>";
    el.messageList.appendChild(card);
    const stepsBox = card.querySelector(".agent-steps");
    const streamBox = card.querySelector(".stream-code");
    scrollChat();

    const steps = ["需求分析", "方案规划", "代码生成", "渲染预览"];
    renderSteps(stepsBox, steps, 0);

    let full = "";
    App.Generator.run({
      prompt: text,
      prevCode,
      settings: S.getSettings(),
      onStep: (idx) => renderSteps(stepsBox, steps, idx),
      onToken: (t) => { full += t; streamBox.textContent = full; scrollChat(); },
      onDone: (code, info) => {
        const v = S.addVersion(currentId, { code, prompt: text, ts: Date.now(), intent: info.intent });
        const idx = S.getProject(currentId).versions.length - 1;
        let note = "已生成「" + (info.intent === "edit" ? "增量修改" : "新应用") + "」，可在右侧预览并进一步迭代。";
        if (info.fallback) {
          note = "⚠ 在线大模型调用失败（" + (info.reason || "未知原因") + "），已自动回退到内置离线引擎生成。";
          if (info.isNetwork) {
            note += "\n排查建议：① 刷新页面重试；② 切换网络/开启代理；③ 关闭广告拦截等浏览器扩展；④ 在「智能体」设置中填入可访问的 API 中转地址。";
          } else {
            note += "\n请在「智能体」设置中检查 API Key / 余额 / Base URL，或切回离线模式。";
          }
        }
        S.addMessage(currentId, { role: "assistant", text: note, versionIndex: idx, prompt: text });
        streamBox.classList.remove("cursor-blink");
        renderChat(S.getProject(currentId));
        renderVersions(S.getProject(currentId));
        setPreview(code);
        setCode(code);
        el.previewUrl.textContent = "app://preview/V" + (idx + 1);
        el.chatMeta.textContent = S.getProject(currentId).versions.length + " 个版本";
        generating = false;
        el.btnSend.disabled = false;
        scrollChat();
      },
      onError: (err) => {
        streamBox.classList.remove("cursor-blink");
        const msg = (err && err.message) ? err.message : "生成失败";
        streamBox.textContent = "⚠ 调用大模型失败：" + msg + "\n（请检查 API Key / Base URL，或在「智能体」设置中切回离线模式）";
        el.chatMeta.textContent = "生成失败";
        generating = false;
        el.btnSend.disabled = false;
      },
    });
  }

  function renderSteps(box, steps, active) {
    box.innerHTML = "";
    steps.forEach((s, i) => {
      const d = document.createElement("div");
      let cls = "step";
      let ico = (i + 1);
      if (i < active) { cls += " done"; ico = "✓"; }
      else if (i === active) { cls += " active"; }
      d.className = cls;
      d.innerHTML = "<span class='step-ico'>" + ico + "</span><span>" + s + "</span>";
      box.appendChild(d);
    });
  }

  // ---------- 预览 / 代码 ----------
  function setPreview(code) {
    el.previewFrame.srcdoc = code;
    el.previewEmpty.classList.add("hidden");
  }
  function clearPreview() {
    el.previewFrame.srcdoc = "";
    el.previewEmpty.classList.remove("hidden");
  }
  function setCode(code) { el.codeEditor.value = code || ""; }

  // ---------- 版本 ----------
  function renderVersions(p) {
    el.versionBar.innerHTML = "";
    p.versions.forEach((v, i) => {
      const b = document.createElement("button");
      b.className = "vtag" + (i === p.current ? " active" : "");
      b.textContent = "V" + (i + 1);
      b.title = v.prompt;
      b.onclick = () => { S.setCurrent(p.id, i); const vv = S.getProject(p.id).versions[i]; setPreview(vv.code); setCode(vv.code); el.previewUrl.textContent = "app://preview/V" + (i + 1); renderVersions(S.getProject(p.id)); };
      el.versionBar.appendChild(b);
    });
  }
  function handleVersionAction(act, v) {
    const p = S.getProject(currentId);
    const ver = p.versions[v];
    if (!ver) return;
    if (act === "view") { S.setCurrent(p.id, v); setPreview(ver.code); setCode(ver.code); el.previewUrl.textContent = "app://preview/V" + (v + 1); switchStage("preview"); renderVersions(p); }
    else if (act === "copy") { copyText(ver.code); toast("已复制代码"); }
    else if (act === "dl") { downloadHtml("index.html", ver.code); }
  }

  // ---------- 工具 ----------
  function copyText(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
    else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {} ta.remove();
  }
  function downloadHtml(name, code) {
    const b = new Blob([code], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(msg, type) {
    const t = el.toast || $("toast");
    t.textContent = msg; t.className = "toast " + (type || "");
    setTimeout(() => t.classList.add("hidden"), 2200);
    t.classList.remove("hidden");
  }
  function scrollChat() { el.messageList.scrollTop = el.messageList.scrollHeight; }
  function switchStage(name) {
    document.querySelectorAll(".stage-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".stage-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
  }
  function autoGrow() {
    el.promptInput.style.height = "auto";
    el.promptInput.style.height = Math.min(el.promptInput.scrollHeight, 140) + "px";
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    el.btnSend.onclick = sendPrompt;
    el.promptInput.addEventListener("input", autoGrow);
    el.promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
    });

    $("btnNewProject").onclick = () => {
      const p = S.createProject("新项目 " + (S.getProjects().length + 1));
      renderSessions(); selectProject(p.id);
    };
    $("btnNewSession").onclick = $("btnNewProject").onclick;
    el.searchSessions.addEventListener("input", () => renderSessions(el.searchSessions.value));

    $("btnRename").onclick = () => {
      const p = S.getProject(currentId); if (!p) return;
      const n = prompt("项目名称", p.name); if (n) { S.renameProject(currentId, n); el.chatTitle.textContent = n; renderSessions(el.searchSessions.value); }
    };
    $("btnDelete").onclick = () => deleteProject(currentId);

    // 版本/代码/分享 tab
    document.querySelectorAll(".stage-tab").forEach((t) => (t.onclick = () => switchStage(t.dataset.tab)));
    $("btnRefresh").onclick = () => { const p = S.getProject(currentId); if (p && p.versions[p.current]) setPreview(p.versions[p.current].code); };
    $("btnSaveCode").onclick = () => {
      const p = S.getProject(currentId); if (!p || !p.versions.length) return toast("暂无可保存的版本");
      const idx = p.current; p.versions[idx].code = el.codeEditor.value; S.save();
      setPreview(el.codeEditor.value); toast("已保存并刷新预览");
    };
    $("btnCopyCode").onclick = () => { copyText(el.codeEditor.value); toast("已复制代码"); };
    $("btnDownload").onclick = () => { const p = S.getProject(currentId); const n = (p ? p.name : "app") + ".html"; downloadHtml(n, el.codeEditor.value); };

    // 分享
    $("btnGenShare").onclick = () => {
      const p = S.getProject(currentId); if (!p || !p.versions.length) { toast("请先生成一个应用", "err"); return; }
      const code = p.versions[p.current].code;
      const url = App.Share.buildShareUrl(code);
      $("shareUrl").value = url; $("shareResult").classList.remove("hidden");
      $("shareNote").textContent = "链接已打包当前应用，任何人打开即可直接运行（无需服务器）。";
    };
    $("btnCopyShare").onclick = () => { copyText($("shareUrl").value); toast("已复制分享链接"); };

    // 设置
    $("btnSettings").onclick = openSettings;
    $("btnCloseSettings").onclick = () => el.settingsModal.classList.add("hidden");
    el.settingsModal.onclick = (e) => { if (e.target === el.settingsModal) el.settingsModal.classList.add("hidden"); };
    $("setMode").onchange = () => { $("llmFields").classList.toggle("hidden", $("setMode").value !== "llm"); };
    $("btnSaveSettings").onclick = saveSettings;
    $("btnResetSettings").onclick = () => {
      $("setMode").value = "llm";
      $("setBaseUrl").value = "https://api.deepseek.com/v1";
      $("setApiKey").value = window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey ? window.ATOMS_SECRETS.apiKey : "";
      $("setModel").value = "deepseek-chat";
      $("llmFields").classList.remove("hidden");
      toast("已恢复默认");
    };
    $("btnTestConn").onclick = testConnection;

    // 拖拽分隔
    setupResizer();
  }

  function deleteProject(id) {
    if (!confirm("确定删除该项目？此操作不可撤销。")) return;
    S.deleteProject(id);
    if (currentId === id) { const ps = S.getProjects(); currentId = ps.length ? ps[0].id : null; }
    renderSessions();
    if (currentId) selectProject(currentId);
    else { const p = S.createProject("新项目 1"); renderSessions(); selectProject(p.id); }
  }

  function openSettings() {
    const s = S.getSettings();
    $("setMode").value = s.mode || "llm";
    $("setBaseUrl").value = s.baseUrl || "https://api.deepseek.com/v1";
    $("setApiKey").value = s.apiKey || "";
    $("setModel").value = s.model || "deepseek-chat";
    $("llmFields").classList.toggle("hidden", s.mode !== "llm");
    el.settingsModal.classList.remove("hidden");
    testConnection(true);
  }

  async function testConnection(silent) {
    const status = $("connStatus");
    if (!status) return;
    const mode = $("setMode").value;
    if (mode !== "llm") {
      status.textContent = "当前为离线模式，不连接大模型。";
      status.className = "modal-tip";
      return;
    }
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) {
      status.textContent = "尚未填写 API Key，无法连接在线模型。";
      status.className = "modal-tip err";
      return;
    }
    status.textContent = "正在测试连接…";
    status.className = "modal-tip";
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接异常：HTTP " + res.status + " " + (t ? t.slice(0, 120) : "");
        status.className = "modal-tip err";
        return;
      }
      await res.json();
      status.textContent = "连接正常，当前 Key 可正常调用。";
      status.className = "modal-tip ok";
    } catch (err) {
      status.textContent = "连接失败：" + (err && err.message ? err.message : "无法访问 API") + "；建议切换网络、开启代理，或更换 API Base URL。";
      status.className = "modal-tip err";
    }
    if (!silent) toast(status.textContent, status.classList.contains("ok") ? "ok" : "err");
  }
  async function testConnection() {
    const s = S.getSettings();
    const box = $("connStatus");
    if (box) { box.className = "modal-tip"; box.textContent = "连接状态：检测中…"; }
    if (!s.apiKey) {
      if (box) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key，无法测试。"; }
      return;
    }
    const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
      });
      if (res.ok) {
        if (box) { box.className = "modal-tip ok"; box.textContent = "连接状态：✅ 成功（HTTP " + res.status + "），模型可调用。"; }
      } else {
        let t = "";
        try { t = (await res.text()).slice(0, 140); } catch (e) {}
        if (box) { box.className = "modal-tip err"; box.textContent = "连接状态：❌ HTTP " + res.status + " " + t; }
      }
    } catch (err) {
      let msg = (err && err.message) || "未知网络错误";
      const low = msg.toLowerCase();
      if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) {
        msg = "网络连接失败（浏览器无法连接到 API 服务器，可能被网络/防火墙/广告拦截扩展拦截）";
      }
      if (box) { box.className = "modal-tip err"; box.textContent = "连接状态：❌ " + msg; }
    }
  }
  function saveSettings() {
    S.setSettings({
      mode: $("setMode").value,
      baseUrl: $("setBaseUrl").value,
      apiKey: $("setApiKey").value,
      model: $("setModel").value,
    });
    el.settingsModal.classList.add("hidden");
    updateModeHint();
    toast("设置已保存");
  }
  function updateModeHint() {
    const s = S.getSettings();
    el.modeHint.textContent = s.mode === "llm" && s.apiKey ? "🌐 在线大模型（DeepSeek：" + (s.model || "deepseek-chat") + "）" : "离线智能体（无需 Key）";
    $("btnGithub").href = "https://github.com/cffypy/atoms-demo";
    // 打开设置弹窗时顺手测一下连接状态
    if (!$("settingsModal").classList.contains("hidden")) testConnection();
  }

  async function testConnection() {
    const statusEl = $("connStatus");
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      statusEl.textContent = "连接状态：当前为离线模式或未填写 Key";
      statusEl.className = "modal-tip";
      return;
    }
    statusEl.textContent = "连接状态：检测中…";
    statusEl.className = "modal-tip";
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/models";
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + s.apiKey },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        statusEl.textContent = "连接状态：可正常访问 API ✓";
        statusEl.className = "modal-tip ok";
      } else {
        const t = await res.text().catch(() => "");
        statusEl.textContent = "连接状态：API 返回 " + res.status + "（" + t.slice(0, 120) + "）";
        statusEl.className = "modal-tip err";
      }
    } catch (err) {
      let msg = err && err.message ? err.message : "网络连接失败";
      statusEl.textContent = "连接状态：" + msg + "；建议切换网络/开启代理/检查 Base URL";
      statusEl.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：未填写 API Key";
      return;
    }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/models", {
        method: "GET",
        headers: { Authorization: "Bearer " + apiKey },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络连接失败 · " + (err && err.message ? err.message : "未知错误") + "（请检查网络/代理/浏览器扩展）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（HTTP 200）";
    } catch (err) {
      status.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      msg += "；建议切换网络、开启代理，或填写可用的 API 中转地址。";
      status.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通（" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + (err && err.message ? err.message : "请求失败") + " · 建议切换网络或开启代理";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✅（模型响应正常）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接 ❌（" + ((err && err.message) || "网络错误") + "）。建议切换网络、开启代理，或改用 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络连接失败 · " + ((err && err.message) || "未知错误") + "\n建议切换网络/开启代理，或改用可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请先在上方选择「在线大模型」并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是测试助手，只回复 ok。",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 可正常访问 DeepSeek API（" + (s.baseUrl || "https://api.deepseek.com/v1") + "）";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "连接失败") + "；建议切换网络/开启代理或使用中继地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "连接失败");
    }
  }

  function checkConnectionOnOpen() {
    const box = $("connStatus");
    if (!box) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip";
      box.textContent = "连接状态：当前为离线模式（无需 Key）";
      return;
    }
    box.className = "modal-tip";
    box.textContent = "连接状态：在线模式，点击「测试当前连接」检查能否到达 DeepSeek。";
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：未填写 API Key，无法测试在线连接。";
      return;
    }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：在线 API 可正常访问 ✓";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接到 API（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + (t ? t.slice(0, 160) : "请检查 Key / 余额 / Base URL");
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（HTTP 200），可以在线生成";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + " · 建议切换网络/开启代理或使用中转转址";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可连通 ✓（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络不通 ✗（" + (err && err.message) + "）。建议切换网络、开启代理，或填写国内可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：可正常连接（HTTP 200）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + ((err && err.message) || "未知错误") + "（建议切换网络/开启代理/检查 Base URL）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const text = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + text.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（HTTP 200，可在线生成）";
    } catch (err) {
      let msg = (err && err.message) || "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时（15 秒未响应）";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) {
        msg = "网络连接失败（浏览器无法到达 API 服务器），建议切换网络/开启代理或使用中继地址";
      }
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { "Authorization": "Bearer " + apiKey } });
      if (!res.ok) {
        const t = await res.text().catch(()=>"");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + "（" + t.slice(0,120) + "）。建议检查 Key、Base URL 或网络/代理。";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✓ 。当前 Key 能正常访问 " + baseUrl + "，可保存设置后使用。";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) ? err.message : "网络错误";
      box.textContent = "连接状态：" + msg + "。常见原因：网络不通、浏览器扩展拦截、CORS 限制。可切换网络/代理，或改为离线模式。";
    }
  }

  function diagnoseSettingsOnOpen() {
    const box = $("connStatus");
    if (!box) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip";
      box.textContent = "当前为离线模式。如需在线大模型，请选择「在线大模型」模式并填写 Key。";
      return;
    }
    box.className = "modal-tip";
    box.textContent = "当前已启用在线模式，点击「测试当前连接」可验证浏览器能否直接访问 API。";
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：正常（HTTP " + res.status + "）。当前网络可直达该 API。";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：异常（HTTP " + res.status + "）。" + (t ? t.slice(0, 120) : "请检查 Key / 余额 / 模型名。");
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理，或改用 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    const t0 = performance.now();
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：正常（" + ms + "ms）。可保存并使用在线大模型。";
      } else {
        const txt = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + "（" + ms + "ms）。" + txt.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 — " + (err && err.message ? err.message : "未知错误") + "。建议切换网络、开启代理或更换 API Base URL。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：未填写 API Key，无法测试。";
      return;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + txt.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通（HTTP 200）。当前网络能访问该 API。";
    } catch (err) {
      box.className = "modal-tip err";
      const msg = (err && err.message) || String(err);
      const isNetwork = /Failed to fetch|NetworkError|network error|无法连接|aborted|timeout/i.test(msg);
      box.textContent = isNetwork
        ? "连接状态：网络不通 · " + msg + "\n建议切换网络、开启代理，或换一个可访问的 API Base URL。"
        : "连接状态：异常 · " + msg;
    }
  }

  // 在设置面板做一次轻量连接探测（只发 1 token，快速失败）
  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：检测中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：当前为离线模式或未填写 Key，无法测试在线连接。";
      return;
    }
    let ok = false, detail = "";
    try {
      const base = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "");
      const res = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      });
      if (res.ok) {
        ok = true;
        detail = "HTTP " + res.status;
      } else {
        const t = await res.text().catch(() => "");
        detail = "HTTP " + res.status + (t ? " · " + t.slice(0, 120) : "");
      }
    } catch (err) {
      detail = (err && err.message) || "网络错误";
    }
    status.className = ok ? "modal-tip ok" : "modal-tip err";
    status.textContent = ok ? "连接状态：在线 API 可正常访问（" + detail + "）" : "连接状态：在线 API 访问失败（" + detail + "）。建议切换网络、开启代理或填写中转地址。";
  }

  // 打开设置时同步一次连接状态提示
  const _origOpenSettings = openSettings;
  function openSettings() {
    _origOpenSettings();
    testConnection();
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
      } else {
        status.textContent = "连接状态：可正常连接（HTTP 200），当前设置可用";
        status.classList.add("ok");
      }
    } catch (err) {
      status.textContent = "连接状态：连接失败 · " + (err && err.message ? err.message : "未知错误") + "\n建议：切换网络、开启代理，或更换可访问的 API Base URL。";
      status.classList.add("err");
    }
  }

  // 在设置面板做一次轻量连接探测（短请求，不消耗太多 token）
  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或 Key 为空，请先切换到在线模式并填写 Key。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET", headers: { Authorization: "Bearer " + s.apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 DeepSeek API（" + res.status + "）。";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 160).replace(/\s+/g, " ") + "。";
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：浏览器无法连接到 API（" + (err && err.message) + "）。建议切换网络/开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：检测中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问（" + res.status + "）。当前网络能直连该 API。";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络连接失败（" + (err && err.message) + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  function openSettings() {
    const s = S.getSettings();
    $("setMode").value = s.mode || "llm";
    $("setBaseUrl").value = s.baseUrl || "https://api.deepseek.com/v1";
    $("setApiKey").value = s.apiKey || "";
    $("setModel").value = s.model || "deepseek-chat";
    $("llmFields").classList.toggle("hidden", s.mode !== "llm");
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：点击「测试当前连接」检查能否访问 API";
    el.settingsModal.classList.remove("hidden");
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || ((window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "");
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：API Key 为空，无法测试"; return; }
    const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: $("setModel").value.trim() || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
      } else {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 DeepSeek API ✓";
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接（" + ((err && err.message) || "网络错误") + "）。建议切换网络/开启代理，或更换 API Base URL。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，无法测试在线连接。";
      return;
    }
    App.LLM.generate({
      baseUrl: s.baseUrl,
      apiKey: s.apiKey,
      model: s.model,
      system: "你是一个测试助手。",
      user: "回复 OK 两个字，不要多余内容。",
      onToken: () => {},
      onDone: () => {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：在线连接正常 ✅";
      },
      onError: (err) => {
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败 ❌ " + (err && err.message ? err.message : "未知错误") + "；建议切换网络/开启代理或填写中转地址。";
      },
    });
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误 · " + (err && err.message ? err.message : "无法连接到 API 服务器") + "（建议切换网络/开启代理/填中转地址）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在探测…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：❌ 请先填写 API Key"; status.classList.add("err"); return; }
    try {
      const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        status.textContent = "连接状态：❌ HTTP " + res.status + " · " + txt.slice(0, 160);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：✅ 可正常连接（" + model + "）";
      status.classList.add("ok");
    } catch (err) {
      let msg = err && err.message ? err.message : "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时（12s）";
      else if (low.includes("fetch") || low.includes("network")) msg = "网络连接失败，建议切换网络/开启代理，或使用中继 Base URL";
      status.textContent = "连接状态：❌ " + msg;
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 DeepSeek API ✓";
      } else {
        const text = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + text.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理，或填 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key，无法测试"; status.className = "modal-tip err"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 120);
        status.className = "modal-tip err";
      } else {
        status.textContent = "连接状态：正常（HTTP 200）";
        status.className = "modal-tip ok";
      }
    } catch (err) {
      status.textContent = "连接状态：失败 · " + ((err && err.message) || "未知错误") + "（建议切换网络/开启代理/关闭浏览器扩展）";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim().replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.className = "modal-tip err"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.textContent = "连接状态：✅ 可连通（" + res.status + "）";
        status.className = "modal-tip ok";
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：❌ API 返回错误 " + res.status + (t ? " · " + t.slice(0, 120) : "");
        status.className = "modal-tip err";
      }
    } catch (err) {
      status.textContent = "连接状态：❌ 无法连接（" + (err && err.message ? err.message : "网络错误") + "）—— 建议切换网络或开启代理";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + (t ? t.slice(0, 160) : "请求失败");
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 " + baseUrl + "（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误 · " + (err && err.message ? err.message : "无法连接") + "（建议切换网络/开启代理/检查 Base URL）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok"; box.textContent = "连接状态：可正常访问（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err"; box.textContent = "连接状态：服务器返回 " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接（" + (err && err.message ? err.message : "未知错误") + "）。建议切换网络、开启代理或填 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，请先切换到在线模式。";
      status.className = "modal-tip err";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        status.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + txt.slice(0, 160);
        status.className = "modal-tip err";
        return;
      }
      status.textContent = "连接状态：✅ 可正常连接到 DeepSeek API（" + (s.model || "deepseek-chat") + "）。";
      status.className = "modal-tip ok";
    } catch (err) {
      status.textContent = "连接状态：❌ 浏览器无法连接到 API（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理，或填写可用的 API 中转地址。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：可正常访问 API（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：无法访问 API（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理或填中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接 DeepSeek API ✅";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "连接失败";
      msg += "；若在中国大陆访问，建议开启代理或填写 API 中转地址。";
      box.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key";
      return;
    }
    const t0 = performance.now();
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        signal: undefined,
        onToken: () => {},
        onDone: () => {
          const ms = Math.round(performance.now() - t0);
          box.className = "modal-tip ok";
          box.textContent = "连接状态：在线大模型可连通（" + ms + " ms）";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：" + (err && err.message ? err.message : "测试失败") + "；建议切换网络/开启代理或填写中转地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + (e && e.message ? e.message : "测试异常");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key，请先切到在线模式并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是一个帮助测试 API 连通性的助手。",
        user: "reply ONLY the word pong",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 在线模型可正常访问（已收到响应）。";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "连接失败") + "；请检查网络、代理或浏览器扩展。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "连接失败");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 HTTP " + res.status + " " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 DeepSeek API ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络或开启代理。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在探测…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.className = "modal-tip err"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.textContent = "连接状态：可正常连接（" + res.status + "）";
        status.className = "modal-tip ok";
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：服务端返回错误 " + res.status + " " + t.slice(0, 120);
        status.className = "modal-tip err";
      }
    } catch (err) {
      status.textContent = "连接状态：网络连接失败 — " + (err && err.message) + "（建议切换网络/开启代理/使用 API 中转）";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测 api.deepseek.com …";
    const s = S.getSettings();
    const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 160) + "\n提示：请检查 Key 是否有效或余额是否充足。";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：✅ 可正常访问 DeepSeek API（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      box.textContent = "连接状态：❌ " + msg + "\n排查建议：① 刷新页面重试；② 切换网络或开启代理；③ 关闭广告拦截/隐私扩展；④ 在上方填入可用的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接 DeepSeek API ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请切换到在线模式并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onDone: (text) => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 在线模型可正常访问（已收到响应）。";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "请求失败") + "；请检查网络、代理或 Base URL。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "请求失败");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：访问失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络或开启代理）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：可正常连接 DeepSeek ✅";
    } catch (err) {
      status.className = "modal-tip err";
      let msg = (err && err.message) || "未知网络错误";
      if (/Failed to fetch|NetworkError|network error|无法连接/i.test(msg)) msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展";
      status.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，请切换到在线模式并保存后重试。";
      status.className = "modal-tip err";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET", headers: { Authorization: "Bearer " + s.apiKey } });
      if (res.ok) {
        status.textContent = "连接状态：✅ 可正常访问 DeepSeek API（" + res.status + "）。";
        status.className = "modal-tip ok";
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：❌ API 返回 " + res.status + " · " + t.slice(0, 120);
        status.className = "modal-tip err";
      }
    } catch (err) {
      let msg = (err && err.message) || "未知网络错误";
      status.textContent = "连接状态：❌ " + msg + "；建议切换网络、开启代理，或在中转地址栏填入可访问的 API 代理。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：检测中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问（HTTP " + res.status + "）";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络连接失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/使用 API 中转）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const base = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const key = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!key) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: $("setModel").value.trim() || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通（" + ((await res.json()).model || "ok") + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接 — " + (err && err.message) + "（可尝试切换网络/代理/中转地址）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + "（" + t.slice(0, 160) + "）";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接 DeepSeek ✓";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      box.textContent = "连接状态：" + msg + "；建议切换网络/开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：可连通 ✓（当前 Key 可用）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络失败 · " + ((err && err.message) || "未知错误") + "\n建议：切换网络、开启代理，或填写可用的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：请求失败 HTTP " + res.status + " " + t.slice(0, 120);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：可正常连接（" + model + "）";
      status.classList.add("ok");
    } catch (err) {
      status.textContent = "连接状态：连接失败 — " + (err && err.message ? err.message : "未知错误") + "（请检查网络/代理/浏览器扩展）";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || ((window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "");
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 API ✓";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + "（" + t.slice(0, 120) + "）";
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法访问 API（" + (err && err.message) + "）。建议切换网络/开启代理，或填写中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，无法测试在线连接。";
      status.className = "modal-tip err";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你只会回复 OK",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          status.textContent = "连接状态：✅ 在线 API 可正常访问";
          status.className = "modal-tip ok";
        },
        onError: (err) => {
          status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "测试失败") + "；可尝试切换网络或开启代理。";
          status.className = "modal-tip err";
        },
      });
    } catch (e) {
      status.textContent = "连接状态：❌ " + (e && e.message ? e.message : "测试失败");
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key";
      return;
    }
    const started = Date.now();
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是测试助手，只回复 ok。",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：在线大模型可正常访问（耗时 " + (Date.now() - started) + "ms）";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：访问失败 — " + ((err && err.message) || "未知错误") + "\n建议：切换网络、开启代理，或在 Base URL 填入可用的中转地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：访问失败 — " + ((e && e.message) || "未知错误");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或 Key 为空，请先在上方选择「在线大模型」并填写 Key。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：请求失败 HTTP " + res.status + " · " + txt.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：✅ 可正常访问 DeepSeek API（" + (s.model || "deepseek-chat") + "）。";
    } catch (err) {
      let msg = (err && err.message) || "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "连接超时（15 秒无响应）";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) msg = "网络连接失败，请检查网络/代理/浏览器扩展";
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + msg + "。如在中国大陆，可尝试开启全局代理或填写 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通（" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接 · " + (err && err.message ? err.message : "未知错误") + "\n建议：切换网络、开启代理，或在中转地址输入可访问的 API 代理。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请切到在线大模型模式并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 可正常访问 DeepSeek API";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + ((err && err.message) || "测试失败") + "（可尝试切换网络/开启代理/填中转地址）";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + ((e && e.message) || "测试失败");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请先切换到在线模式并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 在线大模型可正常访问";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "测试失败") + "；建议切换网络/开启代理，或填写中转 API 地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "测试失败");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接（" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理）";
    }
  }

  function updateConnStatusOnOpen() {
    const box = $("connStatus");
    if (!box) return;
    box.className = "modal-tip";
    box.textContent = "连接状态：点击「测试当前连接」可检测浏览器能否到达 API 服务器";
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 180);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（HTTP 200，可正常使用在线大模型）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + ((err && err.message) || "未知错误") + "（请检查网络/代理/浏览器扩展）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok"; box.textContent = "连接状态：可连通 ✓（" + model + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err"; box.textContent = "连接状态：HTTP " + res.status + " " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + (err && err.message ? err.message : "无法连接") + " \n建议：检查网络、关闭扩展、开启代理或更换 API Base URL。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.textContent = "连接状态：可正常连接（HTTP " + res.status + "）";
        status.classList.add("ok");
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：服务端返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
        status.classList.add("err");
      }
    } catch (err) {
      let msg = (err && err.message) || "网络请求失败";
      const low = msg.toLowerCase();
      if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展";
      status.textContent = "连接状态：" + msg;
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，无法测试在线连接。";
      status.className = "modal-tip err";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        status.textContent = "连接状态：HTTP " + res.status + " · " + txt.slice(0, 160);
        status.className = "modal-tip err";
        return;
      }
      status.textContent = "连接状态：在线连接正常 ✓（" + (s.model || "deepseek-chat") + "）";
      status.className = "modal-tip ok";
    } catch (err) {
      status.textContent = "连接状态：" + ((err && err.message) || "测试失败") + " · 建议切换网络/开启代理或填入中转地址";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请切换为在线模式并保存。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：✅ 可正常访问 DeepSeek API（HTTP " + res.status + "）。";
      } else {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：❌ API 返回错误 HTTP " + res.status + " · " + txt.slice(0, 180);
      }
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "未知网络错误";
      const low = msg.toLowerCase();
      if (low.includes("abort") || low.includes("timeout")) msg = "请求超时，网络较慢或被中断。";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展。";
      box.textContent = "连接状态：❌ " + msg;
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
        return;
      }
      const j = await res.json();
      status.textContent = "连接状态：✅ 可连通（模型：" + (j.model || model) + "）";
      status.classList.add("ok");
    } catch (err) {
      status.textContent = "连接状态：❌ 无法连接 API（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理或填写中转地址。";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) {
      status.textContent = "连接状态：未填写 API Key，无法测试在线连接。";
      status.className = "modal-tip err";
      return;
    }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + (t ? t.slice(0, 160) : "") + "\n建议：检查 Key / 余额 / 模型名，或切换网络/代理。";
        status.className = "modal-tip err";
        return;
      }
      const data = await res.json();
      const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      status.textContent = "连接状态：在线大模型可正常访问（模型返回：" + (reply || "ok").slice(0, 40).replace(/\n/g, " ") + "）。";
      status.className = "modal-tip ok";
    } catch (err) {
      let msg = (err && err.message) || "未知网络错误";
      const low = msg.toLowerCase();
      if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) {
        msg = "浏览器无法连接到 API 服务器（network error）。";
      }
      status.textContent = "连接状态：" + msg + "\n排查建议：① 切换网络；② 开启代理；③ 关闭广告拦截扩展；④ 使用可访问的 API 中转地址。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（请检查网络、代理或浏览器扩展）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或 Key 为空，请先切换到在线模式并保存 Key。";
      return;
    }
    try {
      const base = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "");
      const res = await fetch(base + "/models", { method: "GET", headers: { Authorization: "Bearer " + s.apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可连通 ✓（HTTP " + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回错误 HTTP " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接到 API（" + ((err && err.message) || "网络错误") + "）。建议切换网络、开启代理，或填一个可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：浏览器无法连接到 API（" + (err && err.message) + "）。建议切换网络或开启代理。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✓（当前网络能访问该 API）";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      box.textContent = "连接状态：失败 · " + msg + " · 建议切换网络/开启代理，或改用 API 中转地址";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或 Key 为空，无法测试在线连接。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是一个帮助测试 API 连通性的助手。",
        user: "只回复一个字：通",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：在线连接正常 ✅";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：失败 ❌ " + (err && err.message ? err.message : "未知错误") + "；建议切换网络/开启代理，或填入可访问的中转地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：异常 ❌ " + (e && e.message ? e.message : "未知错误");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问（HTTP " + res.status + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/使用 API 中转）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    if (!apiKey) { status.classList.add("err"); status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { "Authorization": "Bearer " + apiKey } });
      if (res.ok) {
        status.classList.add("ok"); status.textContent = "连接状态：可正常连接（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.classList.add("err"); status.textContent = "连接状态：服务端返回 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      status.classList.add("err");
      status.textContent = "连接状态：浏览器无法连接（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理或更换 Base URL。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接（" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + ((err && err.message) || "未知错误") + "\n建议切换网络、开启代理，或改用 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请切换到在线模式并保存后再试。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 " + res.status + " · " + t.slice(0, 160) + "\n提示：请检查 Key / 余额 / 模型名是否正确。";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：✅ 在线模型可正常访问（" + (s.model || "deepseek-chat") + "）。";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ 浏览器无法连接到 API（" + (err && err.message) + "）\n排查：切换网络、开启代理、关闭广告拦截，或填入国内可访问的中转地址。";
    }
  }

  // 设置面板：测试当前 Base URL + Key 是否能通
  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接（" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接 · " + (err && err.message ? err.message : "网络错误") + "（建议切换网络/开启代理/使用 API 中转）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：正常（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络错误（" + (err && err.message ? err.message : "无法连接") + "）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + "（" + t.slice(0, 120) + "）";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✓（" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接（" + (err && err.message ? err.message : "网络错误") + "）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（可到达 API 服务器）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "网络错误") + "（建议切换网络或开启代理）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（HTTP 200）。当前网络可访问该 API，请保存设置后重试生成。";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "。建议切换网络/开启代理，或改用可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：正常（HTTP " + res.status + "）。当前设置可调用在线模型。";
      } else {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回错误 HTTP " + res.status + " · " + txt.slice(0, 160);
      }
    } catch (err) {
      clearTimeout(t);
      box.className = "modal-tip err";
      let msg = (err && err.message) || String(err);
      if (/aborterror/i.test(msg)) msg = "请求超时（12 秒无响应）";
      box.textContent = "连接状态：请求失败 · " + msg + "\n排查：切换网络、开启代理、检查 Base URL 或关闭浏览器扩展。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：正常（" + res.status + "），当前配置可在线调用。";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + ((err && err.message) || "未知错误") + "（建议切换网络、开启代理或更换 API 中转地址）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + (err && err.message ? err.message : "连接失败") + "（建议切换网络或开启代理）";
    }
  }

  function updateConnStatusOnOpen() {
    const box = $("connStatus");
    if (!box) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip";
      box.textContent = "连接状态：当前为离线模式";
      return;
    }
    box.className = "modal-tip";
    box.textContent = "连接状态：点击「测试当前连接」检查浏览器能否连到 API";
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const base = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const key = $("setApiKey").value.trim();
    if (!key) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：未填写 API Key，无法测试";
      return;
    }
    const url = base.replace(/\/$/, "") + "/chat/completions";
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: $("setModel").value.trim() || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + txt.slice(0, 180);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 DeepSeek API ✓";
    } catch (err) {
      let msg = err && err.message ? err.message : "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时（12 秒无响应）";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) msg = "网络连接失败，建议切换网络或开启代理";
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + msg;
    }
  }

  // 在设置面板做一次轻量连接探测（只发一个极短请求）
  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：检测中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，不会调用在线模型。";
      status.className = "modal-tip";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onDone: () => {
          status.textContent = "连接状态：✅ 可正常访问 DeepSeek API（" + (s.model || "deepseek-chat") + "）";
          status.className = "modal-tip ok";
        },
        onError: (err) => {
          status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "连接失败") + "；可尝试切换网络/代理或在 Base URL 处填中转地址。";
          status.className = "modal-tip err";
        },
      });
    } catch (e) {
      status.textContent = "连接状态：❌ " + (e && e.message ? e.message : "连接失败");
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，无法测试在线连接。";
      status.className = "modal-tip err";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        status.textContent = "连接状态：服务器返回 " + res.status + " · " + txt.slice(0, 160);
        status.className = "modal-tip err";
        return;
      }
      status.textContent = "连接状态：✓ 可正常连接 DeepSeek API";
      status.className = "modal-tip ok";
    } catch (err) {
      let msg = (err && err.message) ? err.message : "未知错误";
      if (/abort/i.test(msg)) msg = "连接超时（15 秒无响应）";
      status.textContent = "连接状态：✗ " + msg + "。建议切换网络、开启代理，或在中转地址填写可访问的 API 代理。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      const j = await res.json().catch(() => ({}));
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（模型：" + (j.model || model) + "）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "\n建议：切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const url = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
    const key = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!key) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：可连通（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络不通 · " + ((err && err.message) || "未知错误") + "\n建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：❌ 请先填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.textContent = "连接状态：✅ 可正常连接（" + res.status + "）";
        status.classList.add("ok");
      } else {
        const t = await res.text();
        status.textContent = "连接状态：❌ HTTP " + res.status + " · " + t.slice(0, 160);
        status.classList.add("err");
      }
    } catch (err) {
      let msg = (err && err.message) || "网络错误";
      status.textContent = "连接状态：❌ " + msg + " · 建议切换网络、开启代理或更换 API Base URL";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：API Key 为空，请先填写 Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：✅ 可正常连接到 " + baseUrl.replace(/^https:\/\//, "");
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：❌ HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：❌ 网络错误（" + (err && err.message) + "）。建议切换网络、开启代理，或在中转地址填入可访问的 API 代理。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：API Key 为空，请先填写 Key"; return; }
    try {
      const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      const j = await res.json();
      const reply = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（模型：" + (j.model || model) + "，响应：" + (reply || "ok").slice(0, 30) + "…）";
    } catch (err) {
      status.className = "modal-tip err";
      let msg = (err && err.message) || "未知网络错误";
      if (/failed to fetch|networkerror|network error|无法连接/i.test(msg.toLowerCase())) {
        msg = "浏览器无法连接到 API 服务器。若在中国大陆，请尝试开启代理，或在 Base URL 填入可访问的中转地址。";
      }
      status.textContent = "连接状态：失败 · " + msg;
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 DeepSeek API ✅";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接 API（" + (err && err.message || "网络错误") + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：✅ 可正常访问（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：❌ API 返回错误（" + res.status + "）" + (t ? " · " + t.slice(0, 160) : "");
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ 浏览器无法连接到 API（" + (err && err.message ? err.message : "未知错误") + "）。建议切换网络、开启代理，或在中转地址输入可用的 API 代理。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 API（" + res.status + "）";
      } else {
        box.className = "modal-tip err";
        const t = await res.text().catch(() => "");
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      const msg = (err && err.message) || "";
      box.textContent = "连接状态：无法访问 API（" + msg + "）。若在中国大陆，可尝试开启代理或填写中转 Base URL。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，请先切换到在线模式并保存。";
      status.className = "modal-tip err";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "say ok",
        onToken: () => {},
        onDone: () => {
          status.textContent = "连接状态：✅ 可正常连接到 " + (s.baseUrl || "https://api.deepseek.com/v1");
          status.className = "modal-tip ok";
        },
        onError: (err) => {
          status.textContent = "连接状态：❌ " + ((err && err.message) || "测试失败") + "；建议切换网络、开启代理或配置 API 中转地址。";
          status.className = "modal-tip err";
        },
      });
    } catch (err) {
      status.textContent = "连接状态：❌ " + ((err && err.message) || "测试失败") + "；建议切换网络、开启代理或配置 API 中转地址。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(()=>"");
        status.textContent = "连接状态：服务器返回 " + res.status + "（" + t.slice(0,120) + "）";
        status.classList.add("err");
      } else {
        status.textContent = "连接状态：✓ 可正常连接 DeepSeek API";
        status.classList.add("ok");
      }
    } catch (err) {
      status.textContent = "连接状态：✗ 浏览器无法连接 API（" + (err && err.message) + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (!res.ok) {
        const t = await res.text().catch(()=>"");
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（" + baseUrl + " 可访问）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误（" + (err && err.message) + "）。若在中国大陆，请尝试切换网络/开启代理，或填写 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 DeepSeek API ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接 API（" + (err && err.message ? err.message : "网络错误") + "）。建议切换网络、开启代理，或填写国内可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：可正常连接（HTTP 200）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + ((err && err.message) || "网络错误") + "（建议切换网络/开启代理/使用 API 中转地址）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    const t0 = performance.now();
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：正常（" + ms + " ms）。模型可响应。";
      } else {
        const txt = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + "（" + ms + " ms）。" + txt.slice(0, 160);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 — " + (err && err.message ? err.message : "未知错误") + "。建议切换网络、开启代理，或更换 API Base URL。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（HTTP 200，当前 Key 可正常调用）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/使用 API 中转地址）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：当前为离线模式或 Key 为空，请先在上方选择「在线大模型」并填写 Key。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + txt.slice(0, 220);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：可正常访问 DeepSeek API（HTTP 200）。如果之前生成时仍报 network error，说明是当时浏览器网络瞬时问题，刷新重试即可。";
    } catch (err) {
      let msg = (err && err.message) || String(err);
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时（15 秒无响应）";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) {
        msg = "浏览器无法连接到 API 服务器（网络/CORS/代理/扩展拦截）。建议开启代理或换网络。";
      }
      status.className = "modal-tip err";
      status.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（HTTP 200，当前 Key 可用）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "网络错误") + "（建议切换网络/开启代理/关闭浏览器扩展）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是测试助手，只回复 ok。",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 可正常访问 DeepSeek API";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "连接失败") + "；建议切换网络或开启代理。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "连接失败");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160) + "\n建议：检查 Key / 余额 / Base URL，或在可访问的网络环境下使用。";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：✅ 可正常访问 DeepSeek API";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "无法连接") + "\n建议：切换网络、开启代理，或填写国内可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接 DeepSeek ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/关闭扩展）";
    }
  }

  function initConnStatus() {
    const box = $("connStatus");
    if (!box) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.textContent = "连接状态：当前为离线模式";
      return;
    }
    testConnection();
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：可正常访问（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络连接失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/关闭浏览器扩展）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + txt.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（HTTP 200，可在线生成）";
    } catch (err) {
      box.className = "modal-tip err";
      const msg = (err && err.message) || String(err);
      box.textContent = "连接状态：失败 · " + msg + "（请检查网络/代理/浏览器扩展）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：未填写 API Key";
      return;
    }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接 DeepSeek ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误（" + (err && err.message) + "）。建议切换网络/开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请切换到在线模式并保存后再试。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        signal: undefined,
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 在线大模型可正常访问，充值已生效。";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "测试失败") + "；建议切换网络/开启代理，或填写可访问的中转 Base URL。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "测试异常");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    if ($("setMode").value !== "llm") { box.className = "modal-tip err"; box.textContent = "连接状态：当前为离线模式，请切换到「在线大模型」后再测试"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 180);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接 DeepSeek API ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连接到 API（" + (err && err.message) + "）。建议切换网络、开启代理，或更换可访问的 API Base URL。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✓（模型：" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "\n建议：切换网络、开启代理，或在 Base URL 填入可访问的中转地址。";
    }
  }

  // 在设置面板做一次轻量级连接探测（非流式、max_tokens 极小）
  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：探测中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 " + res.status + "（" + t.slice(0, 120) + "）";
        return;
      }
      const j = await res.json();
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问（模型：" + (j.model || s.model) + "）";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "未知错误";
      if (/failed to fetch|networkerror|network error|无法连接/i.test(msg)) msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展";
      box.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（HTTP 200，可在线生成）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络或开启代理）";
    }
  }

  function updateConnStatusOnOpen() {
    const status = $("connStatus");
    if (!status) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.className = "modal-tip";
      status.textContent = "连接状态：当前为离线模式，无需检测";
      return;
    }
    status.className = "modal-tip";
    status.textContent = "连接状态：点击「测试当前连接」检查你的网络能否到达 API";
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请先切换到在线模式并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 在线大模型可正常访问";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "未知错误");
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ " + (e && e.message ? e.message : "未知错误");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const url = (($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "")) + "/chat/completions";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败（HTTP " + res.status + "）" + (t ? " · " + t.slice(0, 160) : "") + "\n建议：检查 Key / 余额 / Base URL。";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 DeepSeek API ✓";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      if (/Failed to fetch|NetworkError|network error|无法连接/i.test(msg)) {
        msg = "浏览器无法连接到 API 服务器（网络/CORS/代理问题）";
      }
      box.textContent = "连接状态：失败（" + msg + "）\n建议：切换网络、开启代理、关闭广告拦截，或填写可用的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：API Key 为空，无法测试"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：可正常连接（" + res.status + "）";
      } else {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：服务器返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络连接失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/使用 API 中转）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：检测中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.className = "modal-tip err"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 120);
        status.className = "modal-tip err";
        return;
      }
      status.textContent = "连接状态：正常（可访问 API）";
      status.className = "modal-tip ok";
    } catch (err) {
      let msg = (err && err.message) || "网络错误";
      if (/failed to fetch|networkerror|network error|无法连接/i.test(msg.toLowerCase())) {
        msg = "浏览器无法连接到 API（network error）。建议切换网络、开启代理，或填写国内可访问的 API 中转地址。";
      }
      status.textContent = "连接状态：" + msg;
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const url = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
    const key = $("setApiKey").value;
    if (!key) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: $("setModel").value || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：✓ 可连通（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：✗ HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：✗ " + (err && err.message ? err.message : "无法连接") + "（建议切换网络/开启代理/使用 API 中转地址）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：❌ 请先填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：❌ HTTP " + res.status + " · " + t.slice(0, 160);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：✅ 可正常访问（" + model + "）";
      status.classList.add("ok");
    } catch (err) {
      status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "网络错误") + "（建议切换网络/开启代理/检查 Base URL）";
      status.classList.add("err");
    }
  }

  // 在设置面板实时探测当前浏览器能否连到 DeepSeek API
  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：探测中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前未启用在线模式，请先将模式设为「在线大模型」并填写 API Key。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你只会回复 OK",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：✅ 可正常访问 DeepSeek API（当前网络通畅）。";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：❌ " + (err && err.message ? err.message : "无法连接") + "；建议切换网络/开启代理，或改用可访问的 API 中转地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ 探测异常" + (e && e.message ? "：" + e.message : "。");
    }
  }

  // 设置面板里一键测试当前 BaseURL + Key 是否通
  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.trim().replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：API Key 为空"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：可正常访问（HTTP " + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：服务器返回错误 HTTP " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络连接失败 · " + (err && err.message ? err.message : "未知错误") + "（请检查网络/代理/扩展）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 160);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：可正常连接 DeepSeek ✓";
      status.classList.add("ok");
    } catch (err) {
      let msg = (err && err.message) || "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) {
        msg = "浏览器无法连接到 API 服务器（网络/CORS/代理问题）。可尝试切换网络或开启代理。";
      }
      status.textContent = "连接状态：失败 · " + msg;
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.textContent = "连接状态：可正常连接（" + res.status + "）";
        status.classList.add("ok");
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：服务端返回错误 " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
      }
    } catch (err) {
      status.textContent = "连接状态：网络连接失败 · " + ((err && err.message) || "未知错误") + "\n建议：切换网络、开启代理，或更换 API Base URL。";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 API Key";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：在线大模型可正常访问 ✓";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：失败 — " + (err && err.message ? err.message : "未知错误");
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 — " + (e && e.message ? e.message : "未知错误");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：成功（HTTP " + res.status + "）。当前网络可以访问该 API。";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败（HTTP " + res.status + "）。" + (t ? t.slice(0, 160) : "请检查 Key / 余额 / 模型名。");
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误（" + (err && err.message) + "）。建议切换网络、开启代理，或换一个可访问的 API Base URL。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：可正常连接（HTTP 200）";
      status.classList.add("ok");
    } catch (err) {
      let msg = (err && err.message) || "未知错误";
      if (/failed to fetch|networkerror|network error|无法连接/i.test(msg)) msg = "网络连接失败，请检查网络/代理/浏览器扩展";
      status.textContent = "连接状态：" + msg;
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请切换到在线模式并保存。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是测试助手，只回复 ok。",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          box.className = "modal-tip ok";
          box.textContent = "连接状态：在线大模型可正常访问 ✓";
        },
        onError: (err) => {
          box.className = "modal-tip err";
          box.textContent = "连接状态：访问失败 — " + (err && err.message ? err.message : "未知错误") + "；建议切换网络/代理或填中转地址。";
        },
      });
    } catch (e) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：访问失败 — " + (e && e.message ? e.message : "未知错误");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160) + "\n建议：检查 Key / 余额 / 模型名 / Base URL。";
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接（HTTP 200）。如果生成时仍失败，请检查当前网络是否稳定。";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message) + "\n建议：切换网络、开启代理，或填一个可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：正常（" + res.status + "）";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败（HTTP " + res.status + "）" + (t ? " · " + t.slice(0, 120) : "");
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误 · " + (err && err.message ? err.message : "无法连接到 API 服务器") + "（请检查网络/代理/浏览器扩展）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const base = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const key = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!key) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: $("setModel").value.trim() || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 120);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常连接（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：浏览器无法连接 API — " + (err && err.message ? err.message : "网络错误") + "；建议切换网络或开启代理。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim() || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    let ok = false, detail = "";
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      const text = await res.text();
      if (res.ok) { ok = true; detail = "HTTP " + res.status; }
      else { detail = "HTTP " + res.status + " · " + text.slice(0, 160); }
    } catch (err) {
      detail = (err && err.message) || "未知网络错误";
    }
    if (ok) { box.className = "modal-tip ok"; box.textContent = "连接状态：可连通（" + detail + "）"; }
    else { box.className = "modal-tip err"; box.textContent = "连接状态：失败（" + detail + "）。若在中国大陆，可尝试开启代理或填写 API 中转地址。"; }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：正常（HTTP " + res.status + "）";
      } else {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：失败（HTTP " + res.status + "）" + (t ? " · " + t.slice(0, 120) : "");
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：网络错误（" + (err && err.message ? err.message : "无法连接") + "）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✓（当前 Key 有效）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：无法连通 ✗（" + ((err && err.message) || "网络错误") + "）。建议切换网络、开启代理，或填入可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：当前为离线模式或未填写 Key，请切到在线模式并保存。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + text.slice(0, 160) + "\n请检查 Key / 余额 / Base URL。";
        return;
      }
      const data = await res.json().catch(() => ({}));
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常 ✓（模型：" + (data.model || s.model) + "）。当前网络可以访问 DeepSeek API。";
    } catch (err) {
      status.className = "modal-tip err";
      let msg = (err && err.message) || "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时";
      else if (low.includes("failed to fetch") || low.includes("network") || low.includes("无法连接")) msg = "网络连接失败";
      status.textContent = "连接状态：失败 · " + msg + "\n建议：切换网络、开启代理，或在中转地址填入可访问的 API 代理。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或 Key 为空，请先切换到在线模式并填写 Key。";
      status.className = "modal-tip err";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          status.textContent = "连接状态：✅ 可正常连接 DeepSeek API";
          status.className = "modal-tip ok";
        },
        onError: (err) => {
          status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "连接失败") + "；可尝试切换网络/代理或在 Base URL 填中转地址。";
          status.className = "modal-tip err";
        },
      });
    } catch (e) {
      status.textContent = "连接状态：❌ " + (e && e.message ? e.message : "连接失败");
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hello" }], max_tokens: 3 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const txt = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + txt.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 API ✓";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + ((err && err.message) || "请求失败") + "（建议切换网络/开启代理/检查 Base URL）";
    }
  }

  // 在设置面板实时检测浏览器能否连上当前配置的 API
  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：检测中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：当前为离线模式或未填写 API Key，无法测试在线连接。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onDone: () => {
          status.className = "modal-tip ok";
          status.textContent = "连接状态：✅ 可正常访问 API（" + (s.baseUrl || "https://api.deepseek.com/v1") + "）";
        },
        onError: (err) => {
          status.className = "modal-tip err";
          status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "无法连接") + "\n建议：切换网络、开启代理，或在 Base URL 填入可访问的中转地址。";
        },
      });
    } catch (e) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：❌ " + (e && e.message ? e.message : "未知错误");
    }
  }

  // 打开设置时同步一次连接状态
  const _origOpenSettings = openSettings;
  openSettings = function () {
    _origOpenSettings();
    const status = $("connStatus");
    if (status) { status.className = "modal-tip"; status.textContent = "连接状态：点击「测试当前连接」可检测浏览器到 API 的网络连通性。"; }
  };

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（HTTP 200），可以调用在线模型";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + ((err && err.message) || "未知错误") + "。建议切换网络或开启代理。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    if (!apiKey) {
      status.textContent = "连接状态：未填写 API Key";
      status.classList.add("err");
      return;
    }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: $("setModel").value || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：API 返回 " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：可正常连接（" + (new Date().toLocaleTimeString()) + "）";
      status.classList.add("ok");
    } catch (err) {
      status.textContent = "连接状态：无法连接 — " + (err && err.message) + "（建议切换网络/开启代理/使用 API 中转地址）";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const url = (($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions");
    const key = $("setApiKey").value;
    if (!key) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: $("setModel").value || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问（HTTP " + res.status + "）";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      if (/failed to fetch|networkerror|network error|无法连接/i.test(msg)) msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展";
      box.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：检测中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key";
      status.className = "modal-tip err";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        status.textContent = "连接状态：✅ 可正常访问 DeepSeek API";
        status.className = "modal-tip ok";
      } else {
        const text = await res.text();
        status.textContent = "连接状态：❌ HTTP " + res.status + " · " + text.slice(0, 120);
        status.className = "modal-tip err";
      }
    } catch (err) {
      let msg = (err && err.message) || "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时（12s 无响应）";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) {
        msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展。";
      }
      status.textContent = "连接状态：❌ " + msg;
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：当前未启用在线模式，或 API Key 为空。";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "You are a helpful assistant.",
        user: "ping",
        onToken: () => {},
        onDone: () => {
          status.className = "modal-tip ok";
          status.textContent = "连接状态：可正常访问 DeepSeek API ✅";
        },
        onError: (err) => {
          status.className = "modal-tip err";
          status.textContent = "连接状态：无法访问 API — " + (err && err.message ? err.message : "未知错误");
        },
      });
    } catch (e) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：无法访问 API — " + (e && e.message ? e.message : "未知错误");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可正常访问 API ✅（模型：" + model + "）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：" + ((err && err.message) || "连接失败") + " ❌（建议切换网络、开启代理或更换 API 中转地址）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key";
      status.classList.add("err");
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/models";
      const res = await fetch(url, { headers: { Authorization: "Bearer " + s.apiKey }, method: "GET" });
      if (res.ok) {
        status.textContent = "连接状态：可正常连接（" + res.status + "）";
        status.classList.add("ok");
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
      }
    } catch (err) {
      status.textContent = "连接状态：网络错误 · " + (err && err.message ? err.message : "无法连接到 API");
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: $("setModel").value || "deepseek-chat", messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：✅ 可连通（HTTP " + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：❌ API 返回错误（HTTP " + res.status + "）" + (t ? " · " + t.slice(0, 120) : "") + "。请检查 Key / 余额 / Base URL。";
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ 网络连接失败（" + (err && err.message) + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：❌ 请先填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：❌ HTTP " + res.status + " " + t.slice(0, 120);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：✅ 可正常访问 API（可保存设置后使用）";
      status.classList.add("ok");
    } catch (err) {
      status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "无法连接") + "（建议切换网络/开启代理/使用 API 中转）";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，请先切换到在线大模型模式并保存。";
      return;
    }
    let ok = false, detail = "";
    await App.LLM.generate({
      baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model,
      system: "你是测试助手，只回复 OK。", user: "ping",
      onToken: () => {},
      onDone: () => { ok = true; },
      onError: (err) => { detail = (err && err.message) || "未知错误"; },
    });
    if (ok) {
      box.className = "modal-tip ok";
      box.textContent = "连接状态：✅ 可正常访问 DeepSeek API，可以在线生成。";
    } else {
      box.className = "modal-tip err";
      box.textContent = "连接状态：❌ 无法访问 API — " + detail + "\n建议：切换网络、开启代理、关闭浏览器扩展，或在 Base URL 填可访问的中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: "hello" }], max_tokens: 3 })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回 HTTP " + res.status + (t ? " · " + t.slice(0, 160) : "");
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（API 可访问）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络或开启代理）";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败（HTTP " + res.status + "）" + (t ? " · " + t.slice(0, 120) : "");
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（" + model + " 可访问）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络错误（" + (err && err.message ? err.message : "无法连接") + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：请先填写 API Key"; return; }
    const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通 ✓（当前网络能访问该 API）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/使用 API 中转）";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 200);
        return;
      }
      status.className = "modal-tip ok";
      status.textContent = "连接状态：正常（" + model + " 已响应）";
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "\n建议：检查网络/代理/浏览器扩展，或尝试可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.className = "modal-tip err"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        status.className = "modal-tip err";
        return;
      }
      status.textContent = "连接状态：可正常连接 DeepSeek API ✓";
      status.className = "modal-tip ok";
    } catch (err) {
      status.textContent = "连接状态：失败 · " + (err && err.message) + "（建议切换网络/开启代理/使用 API 中转）";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，请先切换到在线模式并保存。";
      status.className = "modal-tip err";
      return;
    }
    try {
      await App.LLM.generate({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        model: s.model,
        system: "你是一个助手。",
        user: "ping",
        onDone: (text) => {
          status.textContent = "连接状态：✅ 可正常访问 API（模型已响应）。";
          status.className = "modal-tip ok";
        },
        onError: (err) => {
          const msg = (err && err.message) || "未知错误";
          status.textContent = "连接状态：❌ " + msg + "；建议切换网络/开启代理，或填写可用的 API 中转地址。";
          status.className = "modal-tip err";
        },
      });
    } catch (e) {
      status.textContent = "连接状态：❌ " + ((e && e.message) || "测试异常") + "；建议切换网络/开启代理。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：可连通（HTTP 200）";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "未知网络错误";
      if (/Failed to fetch|NetworkError|network error/i.test(msg)) msg = "网络连接失败（浏览器无法到达 API 服务器），建议切换网络或开启代理。";
      box.textContent = "连接状态：" + msg;
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在探测…";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：当前为离线模式或未填写 Key，无法测试在线连接。";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET", headers: { Authorization: "Bearer " + s.apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常连接到 API（" + res.status + "）。如果生成时仍报 network error，多为本地网络/扩展拦截，请尝试换网络或开启代理。";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 " + res.status + " " + t.slice(0, 120) + "。请检查 Key / 余额 / Base URL。";
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：探测失败（" + (err && err.message) + "）。请检查网络、代理或浏览器扩展拦截。";
    }
  }

  // 设置面板里测试当前填写的 Base URL + Key 是否通
  async function testConnection() {
    const box = $("connStatus");
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || (window.ATOMS_SECRETS && window.ATOMS_SECRETS.apiKey) || "";
    const model = $("setModel").value || "deepseek-chat";
    box.className = "modal-tip";
    box.textContent = "正在测试连接…";
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 2 }),
      });
      if (!res.ok) {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接失败：HTTP " + res.status + " " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接正常，可以在线生成。";
    } catch (err) {
      box.className = "modal-tip err";
      let msg = (err && err.message) || "网络错误";
      if (/failed to fetch|network|无法连接/i.test(msg.toLowerCase())) {
        msg = "浏览器无法连接到 API 服务器，请检查网络/代理/浏览器扩展。";
      }
      box.textContent = "连接失败：" + msg;
    }
  }

  // 打开设置时更新连接状态提示
  function updateConnStatus() {
    const box = $("connStatus");
    if (!box) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      box.className = "modal-tip";
      box.textContent = "当前为离线模式，无需联网。";
      return;
    }
    box.className = "modal-tip";
    box.textContent = "当前配置：" + s.baseUrl + " · 打开后点击「测试当前连接」检查网络是否可达。";
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：正在测试…";
    status.className = "modal-tip";
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) {
      status.textContent = "连接状态：当前为离线模式或未填写 Key，请切换为在线模式并保存。";
      status.className = "modal-tip err";
      return;
    }
    try {
      const url = (s.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
        body: JSON.stringify({ model: s.model || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        status.textContent = "连接状态：✅ 可正常访问 DeepSeek API（HTTP " + res.status + "）。";
        status.className = "modal-tip ok";
      } else {
        const txt = await res.text();
        status.textContent = "连接状态：❌ API 返回错误 HTTP " + res.status + " · " + txt.slice(0, 160);
        status.className = "modal-tip err";
      }
    } catch (err) {
      let msg = (err && err.message) || "未知错误";
      const low = msg.toLowerCase();
      if (low.includes("abort")) msg = "请求超时（15 秒未响应）";
      else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network error")) msg = "网络连接失败，建议切换网络或开启代理";
      status.textContent = "连接状态：❌ " + msg + "。";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：检测中…";
    const base = $("setBaseUrl").value || "https://api.deepseek.com/v1";
    const key = $("setApiKey").value || "";
    if (!key) { box.className = "modal-tip err"; box.textContent = "连接状态：API Key 为空，无法测试"; return; }
    try {
      const url = base.replace(/\/$/, "") + "/chat/completions";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: $("setModel").value || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 DeepSeek API（HTTP " + res.status + "）";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：浏览器无法连接到 API（" + (err && err.message) + "）。建议切换网络/开启代理，或填入可访问的中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：检测中…";
    status.className = "modal-tip";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.className = "modal-tip err"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        status.textContent = "连接状态：可正常访问（" + res.status + "）";
        status.className = "modal-tip ok";
      } else {
        const t = await res.text().catch(() => "");
        status.textContent = "连接状态：访问失败（" + res.status + "）" + (t ? " · " + t.slice(0, 120) : "");
        status.className = "modal-tip err";
      }
    } catch (err) {
      status.textContent = "连接状态：网络错误（" + (err && err.message ? err.message : "无法连接") + "）";
      status.className = "modal-tip err";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：失败 HTTP " + res.status + " · " + t.slice(0, 160);
        return;
      }
      box.className = "modal-tip ok";
      box.textContent = "连接状态：正常（可访问 API 并返回 200）";
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "\n建议：切换网络、开启代理，或更换可访问的 API Base URL。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.trim() || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value.trim();
    const model = $("setModel").value.trim() || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：❌ 请先填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：❌ HTTP " + res.status + " " + t.slice(0, 160);
        status.classList.add("err");
      } else {
        status.textContent = "连接状态：✅ 可正常连接到 API（" + baseUrl + "）";
        status.classList.add("ok");
      }
    } catch (err) {
      status.textContent = "连接状态：❌ " + (err && err.message ? err.message : "无法连接") + "（建议切换网络/开启代理/使用 API 中转地址）";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (!res.ok) {
        const t = await res.text();
        status.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
        return;
      }
      status.textContent = "连接状态：✅ 可连通（" + model + "）";
      status.classList.add("ok");
    } catch (err) {
      status.textContent = "连接状态：❌ 无法连接 — " + (err && err.message ? err.message : "网络错误") + "（请检查网络/代理/扩展拦截）";
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.textContent = "连接状态：测试中…";
    status.className = "modal-tip";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { status.textContent = "连接状态：未填写 API Key"; status.classList.add("err"); return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.textContent = "连接状态：可正常连接（" + res.status + "）";
        status.classList.add("ok");
      } else {
        const t = await res.text();
        status.textContent = "连接状态：服务端返回错误 " + res.status + " · " + t.slice(0, 120);
        status.classList.add("err");
      }
    } catch (err) {
      const msg = (err && err.message) || "";
      const isNetwork = /Failed to fetch|NetworkError|network error|无法连接/i.test(msg);
      status.textContent = "连接状态：失败 · " + (isNetwork ? "浏览器无法连接到 API 服务器，请检查网络/代理/扩展拦截" : msg);
      status.classList.add("err");
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const baseUrl = ($("setBaseUrl").value || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const apiKey = $("setApiKey").value || "";
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：✅ 可正常访问 API（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        status.className = "modal-tip err";
        status.textContent = "连接状态：❌ API 返回错误 " + res.status + (t ? " · " + t.slice(0, 160) : "") + "。请检查 Key / 余额 / Base URL。";
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：❌ 网络连接失败（" + (err && err.message) + "）。建议切换网络、开启代理，或填写可访问的 API 中转地址。";
    }
  }

  async function testConnection() {
    const status = $("connStatus");
    status.className = "modal-tip";
    status.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "");
    const apiKey = $("setApiKey").value;
    if (!apiKey) { status.className = "modal-tip err"; status.textContent = "连接状态：请先填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model: $("setModel").value || "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 3 }),
      });
      if (res.ok) {
        status.className = "modal-tip ok";
        status.textContent = "连接状态：可正常访问（HTTP " + res.status + "）";
      } else {
        const t = await res.text();
        status.className = "modal-tip err";
        status.textContent = "连接状态：API 返回错误 HTTP " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      status.className = "modal-tip err";
      status.textContent = "连接状态：无法连接（" + (err && err.message ? err.message : "网络错误") + "）。若在中国大陆，请尝试切换网络或开启代理。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：正在测试…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常连接（" + res.status + "）";
      } else {
        const t = await res.text().catch(() => "");
        box.className = "modal-tip err";
        box.textContent = "连接状态：服务器返回 " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：浏览器无法连接到 API（" + (err && err.message ? err.message : "网络错误") + "），建议切换网络或开启代理。";
    }
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value || "";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：未填写 API Key"; return; }
    try {
      const res = await fetch(baseUrl + "/models", { method: "GET", headers: { Authorization: "Bearer " + apiKey } });
      if (res.ok) {
        box.className = "modal-tip ok";
        box.textContent = "连接状态：可正常访问 API（" + res.status + "）";
      } else {
        box.className = "modal-tip err";
        const t = await res.text().catch(() => "");
        box.textContent = "连接状态：API 返回错误 " + res.status + " · " + t.slice(0, 120);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：网络连接失败（" + (err && err.message) + "）。建议切换网络、开启代理，或填写国内可访问的 API 中转地址。";
    }
  }

  function checkConnectionOnOpen() {
    const box = $("connStatus");
    if (!box) return;
    const s = S.getSettings();
    if (s.mode !== "llm" || !s.apiKey) { box.className = "modal-tip"; box.textContent = "当前为离线模式，无需连接 API。"; return; }
    box.className = "modal-tip";
    box.textContent = "连接状态：打开后自动检测中…";
    testConnection();
  }

  async function testConnection() {
    const box = $("connStatus");
    box.className = "modal-tip";
    box.textContent = "连接状态：测试中…";
    const baseUrl = $("setBaseUrl").value.replace(/\/$/, "") || "https://api.deepseek.com/v1";
    const apiKey = $("setApiKey").value;
    const model = $("setModel").value || "deepseek-chat";
    if (!apiKey) { box.className = "modal-tip err"; box.textContent = "连接状态：API Key 为空，无法测试"; return; }
    try {
      const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 3 }),
      });
      if (res.ok) {
        const j = await res.json();
        const m = j.model || model;
        box.className = "modal-tip ok";
        box.textContent = "连接状态：正常 ✓（模型：" + m + "）";
      } else {
        const t = await res.text();
        box.className = "modal-tip err";
        box.textContent = "连接状态：HTTP " + res.status + " · " + t.slice(0, 160);
      }
    } catch (err) {
      box.className = "modal-tip err";
      box.textContent = "连接状态：失败 · " + (err && err.message ? err.message : "未知错误") + "（建议切换网络/开启代理/使用 API 中转地址）";
    }
  }

  function setupResizer() {
    document.querySelectorAll(".resizer").forEach((r) => {
      r.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const target = $(r.dataset.target);
        const startX = e.clientX;
        const startW = target.offsetWidth;
        function move(ev) {
          const w = Math.max(180, Math.min(460, startW + ev.clientX - startX));
          target.style.flex = "0 0 " + w + "px";
        }
        function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    });
  }

  // ---------- 启动 ----------
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
