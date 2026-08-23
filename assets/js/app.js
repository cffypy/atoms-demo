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

  // ---------- 登录 / 注册门面 ----------
  let authMode = "login";
  function showAuthGate() {
    $("authModal").classList.remove("hidden");
    $("authError").classList.add("hidden");
    setTimeout(() => { const i = $("authUser"); if (i) i.focus(); }, 60);
  }
  function showAuthError(msg) {
    const e = $("authError"); e.textContent = msg; e.classList.remove("hidden");
  }
  function bindAuthEvents() {
    const submit = async () => {
      const user = $("authUser").value.trim();
      const pass = $("authPass").value;
      if (!user || !pass) { showAuthError("请输入用户名和密码"); return; }
      const res = authMode === "register"
        ? await App.Auth.register(user, pass)
        : await App.Auth.login(user, pass);
      if (res.ok) {
        $("authUser").value = ""; $("authPass").value = "";
        enterApp();
        toast(authMode === "register" ? "注册成功，已登录" : "登录成功");
      } else {
        showAuthError(res.error);
      }
    };
    $("authSubmit").onclick = submit;
    $("authPass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    $("authUser").addEventListener("keydown", (e) => { if (e.key === "Enter") $("authPass").focus(); });
    document.querySelectorAll(".auth-tab").forEach((t) => {
      t.onclick = () => {
        authMode = t.dataset.auth;
        document.querySelectorAll(".auth-tab").forEach((x) => x.classList.toggle("active", x === t));
        $("authSubmit").textContent = authMode === "register" ? "注册并进入" : "登录";
        $("authError").classList.add("hidden");
        $("authPass").value = "";
      };
    });
    $("btnLogout").onclick = () => {
      App.Auth.logout();
      currentId = null;
      $("userBadge").classList.add("hidden");
      $("btnLogout").classList.add("hidden");
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
        const note = info.fallback
          ? "⚠ 在线大模型调用失败（" + (info.reason || "未知原因") + "），已自动回退到内置离线引擎生成。可在「智能体」设置中检查 Key / 余额，或切回离线模式。"
          : "已生成「" + (info.intent === "edit" ? "增量修改" : "新应用") + "」，可在右侧预览并进一步迭代。";
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
    $("btnResetSettings").onclick = () => { $("setMode").value = "llm"; $("llmFields").classList.remove("hidden"); toast("已恢复默认"); };

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
