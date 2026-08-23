/* =====================================================================
 * share.js — 分享快照
 * 将生成的单文件 HTML 编码进 URL hash，任何人打开链接即可直接运行
 * （无需服务器，适配 GitHub Pages 等静态托管）。
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});

  function encode(code) {
    try {
      return btoa(unescape(encodeURIComponent(code)));
    } catch (e) {
      return btoa(code);
    }
  }
  function decode(str) {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      try {
        return atob(str);
      } catch (e2) {
        return "";
      }
    }
  }

  function buildShareUrl(code) {
    const base = location.origin + location.pathname;
    return base + "#app=" + encode(code);
  }

  function getSharedFromHash() {
    const h = location.hash || "";
    if (h.indexOf("#app=") === 0) {
      return decode(h.slice(5));
    }
    return null;
  }

  // 分享视图：全屏运行生成的应用
  function renderShared(code) {
    document.body.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;flex-direction:column">' +
      '<div style="height:40px;display:flex;align-items:center;gap:10px;padding:0 14px;background:#0b0d12;color:#9aa4b6;font:13px -apple-system,sans-serif;border-bottom:1px solid #232a38">' +
      '⚛ <span>Atoms Demo · 分享的应用</span>' +
      '<a href="./" style="margin-left:auto;color:#7c5cff;text-decoration:none">在编辑器中打开 ↗</a></div>' +
      '<iframe style="flex:1;width:100%;border:none;background:#fff" sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"></iframe></div>';
    document.querySelector("iframe").srcdoc = code;
  }

  App.Share = { encode, decode, buildShareUrl, getSharedFromHash, renderShared };
})();
