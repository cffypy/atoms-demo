/*
 * secrets.js — 公开部署时的 DeepSeek 接入配置
 * =====================================================================
 * 本 Demo 默认接入「在线 DeepSeek（deepseek-chat）」。
 *
 * 为什么 Key 在这里（前端）？
 *   本站点是纯静态应用（零后端、零构建，直接由 GitHub Pages 提供），
 *   而 DeepSeek 官方接口支持浏览器跨域直连（CORS），因此要让“默认在线
 *   大模型”在公网开箱即用，Key 必须存在于客户端才能发起请求。
 *
 * ⚠️ 安全说明（演示用途）：
 *   把 API Key 放进公开前端仅适合演示。正式环境请改为：
 *     ① 自建后端代理转发（Key 不落地前端）；或
 *     ② GitHub 仓库 Secret + Actions 注入（Key 不进代码与 git 历史）。
 *   如需重置密钥：https://platform.deepseek.com
 */
window.ATOMS_SECRETS = { apiKey: "sk-40d9568f7ad14ed097e9ee4ec828f1b5" };
