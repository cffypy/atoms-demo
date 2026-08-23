/*
 * secrets.js — 本地开发用（已被 .gitignore 忽略，不会提交到公开仓库）
 * =====================================================================
 * 公开部署请改用 GitHub 仓库 Secret（DEEPSEEK_KEY），
 * 由 .github/workflows/deploy.yml 在构建时自动注入到本文件，
 * 密钥因此【不进入任何代码 / git 历史】。
 *
 * 仅本地调试时：复制本文件为 secrets.js 并填入你的 DeepSeek API Key：
 *   window.ATOMS_SECRETS = { apiKey: "sk-..." };
 */
window.ATOMS_SECRETS = { apiKey: "" };
