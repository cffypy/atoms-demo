# ⚛ Atoms Demo

> 对标 [atoms.dev](https://atoms.dev/) 的 **AI 智能体原型**：用自然语言驱动智能体生成**真实可交互**的单文件网页应用，并实时可视化预览。
> 纯静态、零后端、零构建 —— 一份 `index.html` 即可跑，天然适配 GitHub Pages。
>
> 🔗 **在线演示（公网可访问）**：https://cffypy.github.io/atoms-demo/

## 这是什么

一个「自然语言 → 可交互网页」的 AI 智能体工作台。你在左侧描述想法，智能体会：

1. **需求分析 → 方案规划 → 代码生成 → 渲染预览**（带状态卡片与流式打字机效果）
2. 生成**完整、可运行的单文件 HTML 应用**，右侧 iframe 实时预览
3. 支持**多轮迭代**：把上一版代码作为上下文做增量修改（而非每次重生成）
4. 把生成的应用以**可视化网页形式**展示，并可一键导出 / 分享

## 核心特性

| 特性 | 说明 |
|:---|:---|
| 🤖 智能体驱动 | 意图识别 + 模板引擎 + 可选真实大模型，自动规划并生成应用 |
| 🖥 真实交互 | 生成的不是静态图，而是可点击、有状态的网页（待办/计算器/仪表盘/游戏…） |
| 🔁 多轮迭代 | 支持“改成深色模式”“把主题色换成红色”等增量编辑 |
| 💾 本地持久化 | 项目 / 对话 / 版本（V1、V2…）存入 localStorage，刷新不丢失 |
| 🔗 分享快照 | 把应用打包进 URL，任何人打开即可直接运行（无需服务器） |
| 🔌 可选真实 LLM | 设置中粘贴任意 OpenAI 兼容 Key（DeepSeek / OpenAI 等）即用真实模型流式生成 |

## 内置模板（离线即可生成）

待办清单 · 计算器 · 计数器 · 番茄钟 · 落地页 · 数据仪表盘 · 笔记(Markdown) · 问答测验 · 猜数字游戏 · 天气 · 通用应用

## 快速开始

本项目是纯静态站点，**无需安装任何依赖**：

```bash
# 方式一：直接双击 index.html 在浏览器打开
# 方式二：本地起一个静态服务器（推荐，分享快照链接更稳）
cd atoms-demo
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

打开后即可在左侧输入需求开始生成。示例：

- “生成一个待办事项清单网页，支持添加、完成和删除”
- “做一个支持加减乘除的计算器”
- “生成一个 SaaS 产品落地页”
- “做一个数据可视化仪表盘”
- “把背景改成深色模式”（多轮迭代示例）

## 智能体（默认在线 DeepSeek）

应用**默认接入在线 DeepSeek 大模型**（`deepseek-chat`，SSE 流式生成）。

- **API Key 的安全性**：公开部署时 Key **不进代码仓库**——通过 GitHub 仓库 Secret `DEEPSEEK_KEY` 注入，由 `.github/workflows/deploy.yml` 在构建期写入 `assets/js/secrets.js`（该文件已被 `.gitignore` 忽略）。本地调试则复制 `secrets.example.js` 为 `secrets.js` 填入 Key。
- **离线兜底**：当在线调用失败（如余额不足、网络异常、Key 无效）时，智能体会**自动回退**到内置离线模板引擎生成，保证演示始终可交互。你也可以在 **⚙ 智能体** 中手动切回离线模式。
- 点击右上角 **⚙ 智能体** 可查看 / 修改 Base URL、模型名，或粘贴自己的 Key。

## 部署到 GitHub Pages（Actions 自动部署 + 安全注入 Key）

推送到 `main` 即自动构建并部署，DeepSeek Key 经仓库 Secret 注入，不进源码：

```bash
# 1) 在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：
#    DEEPSEEK_KEY = 你的 DeepSeek API Key
#    （或用 CLI：gh secret set DEEPSEEK_KEY）
# 2) 推送 main 分支，Actions 会自动部署到 GitHub Pages
git push origin main
# Pages 设置：Source = GitHub Actions（首次 Actions 成功运行后会自动启用）
```

如需纯静态（无 Actions）部署，把 Key 填入 `assets/js/secrets.js` 后从 `main` 分支 root 部署即可（注意该文件会被提交，密钥将公开）。

## 技术栈

| 层级 | 选型 |
|:--|:--|
| 前端 | 原生 HTML5 + Vanilla JS（经典 `<script>` 加载，兼容 `file://` 与 GitHub Pages） |
| 智能体 | **默认在线 DeepSeek**（OpenAI 兼容 / SSE 流式）+ 离线模板引擎兜底（意图识别 + 增量编辑） |
| 持久化 | 浏览器 localStorage |
| 分享 | URL hash 快照（base64 编码单文件 HTML） |
| 部署 | 任意静态托管（GitHub Pages / CloudStudio / Vercel 静态） |

## 对应笔试「完成要求」

- ✅ **具备真实交互**（而非纯静态展示）：生成应用均有按钮、输入、状态变化
- ✅ **智能体驱动**完成代码（应用）生成
- ✅ 将生成应用以**可视化网页形式**展示（iframe 实时预览）
- ✅ **可持久化**：项目 / 版本刷新不丢
- ✅ **可公网部署**：纯静态，GitHub Pages 一行命令上线
