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

## 智能体设置

点击右上角 **⚙ 智能体**：

- **离线智能体（默认）**：内置模板引擎，无需任何 Key，开箱即用、保证评审时可完整体验。
- **真实大模型**：填入 API Base URL / Key / 模型名（如 DeepSeek：`https://api.deepseek.com/v1`，模型 `deepseek-chat`）。智能体将改为调用真实模型流式生成。
  - Key 仅保存在你本机浏览器（localStorage），不会上传任何服务器。

## 部署到 GitHub Pages

仓库根目录即为站点根，推送到 GitHub 后开启 Pages 即可：

```bash
git init
git add -A && git commit -m "feat: Atoms Demo"
gh repo create atoms-demo --public --source=. --push   # 或手动在 GitHub 新建仓库后 git push
# Settings → Pages → Source: Deploy from a branch → main / root → Save
```

## 技术栈

| 层级 | 选型 |
|:--|:--|
| 前端 | 原生 HTML5 + Vanilla JS（经典 `<script>` 加载，兼容 `file://` 与 GitHub Pages） |
| 智能体 | 离线模板引擎（意图识别 + 增量编辑）+ 可选 OpenAI 兼容 LLM（SSE 流式） |
| 持久化 | 浏览器 localStorage |
| 分享 | URL hash 快照（base64 编码单文件 HTML） |
| 部署 | 任意静态托管（GitHub Pages / CloudStudio / Vercel 静态） |

## 对应笔试「完成要求」

- ✅ **具备真实交互**（而非纯静态展示）：生成应用均有按钮、输入、状态变化
- ✅ **智能体驱动**完成代码（应用）生成
- ✅ 将生成应用以**可视化网页形式**展示（iframe 实时预览）
- ✅ **可持久化**：项目 / 版本刷新不丢
- ✅ **可公网部署**：纯静态，GitHub Pages 一行命令上线
