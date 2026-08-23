/* =====================================================================
 * generator.js — 智能体生成引擎（离线兜底 + 真实 LLM 路由）
 * 对外：App.Generator.run({prompt, prevCode, settings, onStep, onToken, onDone, onError})
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});
  const T = () => App.Templates;

  // ---------- 意图识别 ----------
  const RULES = [
    ["todo", /待办|todo|任务|清单|事项|打卡|计划表|todolist/i],
    ["calculator", /计算器|calculator|计算|加减乘除|算一算|算式/i],
    ["counter", /计数器|counter|计数|点击次数|步数/i],
    ["pomodoro", /番茄|pomodoro|计时|定时器|专注|倒计时|计时器/i],
    ["landing", /落地页|landing|官网|主页|首页|产品页|宣传|介绍页|网站|品牌/i],
    ["dashboard", /仪表盘|dashboard|数据|报表|图表|看板|统计|分析面板|数据大屏/i],
    ["notes", /笔记|notes|便签|markdown|备忘|日记|记录本/i],
    ["quiz", /问答|quiz|测验|测试题|答题|问卷|考试|小测/i],
    ["game", /游戏|game|猜数字|贪吃蛇|2048|小游戏|猜谜/i],
    ["weather", /天气|weather|气温|预报|气象/i],
  ];

  function classify(prompt) {
    for (const [name, re] of RULES) if (re.test(prompt)) return name;
    return "generic";
  }

  const EDIT_RE = /改|换|变|调|加|增|添|删|去|移除|去掉|深色|暗色|夜间|dark|浅色|亮色|light|颜色|colour|color|主题|背景|字体|布局|移动端|手机|响应式|圆角|动画|样式/i;

  // ---------- 解析名称 / 副标题 ----------
  function parseName(prompt) {
    let m = prompt.match(/[“"'].*?[”"']/);
    if (m) return m[0].slice(1, -1).trim();
    const cut = prompt.split(/[，。、,.!?；;\n（）()]/)[0].trim();
    return cut.slice(0, 16) || "";
  }

  // ---------- 颜色词 -> hex ----------
  function colorWord(prompt) {
    const map = {
      红: "#ef4444", 蓝: "#3b82f6", 绿: "#22c55e", 紫: "#7c5cff", 橙: "#f97316",
      粉: "#ec4899", 青: "#06b6d4", 黄: "#eab308", 黑: "#111111", 白: "#ffffff",
      灰: "#6b7280", 靛: "#6366f1", 翠: "#10b981",
    };
    for (const k in map) if (prompt.indexOf(k) !== -1) return map[k];
    const hex = prompt.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/);
    if (hex) return "#" + hex[1];
    return null;
  }

  // ---------- 离线增量编辑 ----------
  function incrementalEdit(prevCode, prompt, opts) {
    let code = prevCode;
    let changed = false;

    if (/深色|暗色|夜间|dark/i.test(prompt)) {
      code = code.replace(/data-theme="[^"]*"/i, 'data-theme="dark"');
      changed = true;
    }
    if (/浅色|亮色|light/i.test(prompt) && !/深色|暗色|夜间|dark/i.test(prompt)) {
      code = code.replace(/data-theme="[^"]*"/i, 'data-theme="light"');
      changed = true;
    }
    const col = colorWord(prompt);
    if (col && /颜色|colour|color|主题|换|改|变/i.test(prompt)) {
      code = code.replace(/--accent:[^;]+;/i, "--accent:" + col + ";");
      changed = true;
    }
    // 标题替换
    const nm = parseName(prompt);
    if (nm && /标题|名字|名称|改名|叫/.test(prompt)) {
      // 尝试替换第一个 <h1 ...>...</h1>
      code = code.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "<h1>$1</h1>".replace("$1", T()._esc(nm)));
      changed = true;
    }
    return changed ? code : null;
  }

  // ---------- 离线生成 ----------
  function offlineGenerate(prompt, prevCode, opts) {
    const name = parseName(prompt);
    const o = { name: name, subtitle: prompt, prompt: prompt, accent: opts.accent || "#7c5cff", dark: !!opts.dark };

    // 多轮编辑
    if (prevCode && EDIT_RE.test(prompt)) {
      const edited = incrementalEdit(prevCode, prompt, o);
      if (edited) return { code: edited, intent: "edit", name: name };
    }
    const intent = classify(prompt);
    const code = T()[intent](o);
    return { code: code, intent: intent, name: name };
  }

  // ---------- 真实 LLM 系统提示 ----------
  const SYSTEM = [
    "你是一个前端智能体，根据用户需求生成一个【完整、可直接运行的单文件 HTML 网页应用】。",
    "要求：",
    "1. 只输出一个 HTML 文档（含 <!DOCTYPE html>），所有 CSS/JS 内联在文件内，不要使用外部依赖（除非是通用的 CDN，如字体）。",
    "2. 应用必须是【真实可交互】的（有按钮、输入、状态变化），而不是静态展示。",
    "3. 在 <head> 中用 CSS 变量定义 --accent 主题色，并支持 data-theme=\"dark\" / \"light\" 两套主题。",
    "4. 适配移动端（viewport + 响应式）。",
    "5. 不要输出任何解释、markdown 代码块标记或额外文字，只输出 HTML 本身。",
    "如果用户是在已有版本上做修改，会提供上一版完整代码（history_code），请在其基础上增量修改，保持整体风格一致。",
  ].join("\n");

  // ---------- 对外 run ----------
  function run(params) {
    const { prompt, prevCode, settings, onStep, onToken, onDone, onError } = params;
    const steps = ["需求分析", "方案规划", "代码生成", "渲染预览"];
    let stepIdx = 0;
    const tick = () => { stepIdx++; onStep && onStep(stepIdx, steps); };

    onStep && onStep(0, steps);

    const useLLM = settings && settings.mode === "llm" && settings.apiKey;
    if (useLLM) {
      // 真实大模型
      let userMsg = prompt;
      if (prevCode) {
        userMsg = "【上一版代码 history_code】\n" + prevCode + "\n\n【本次需求】\n" + prompt;
      }
      tick(); tick();
      App.LLM.generate({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        system: SYSTEM,
        user: userMsg,
        onToken: (t) => onToken && onToken(t),
        onDone: (full) => {
          tick();
          const code = extractHtml(full);
          onDone && onDone(code, { intent: "llm" });
        },
        onError: (err) => {
          // 在线调用失败（如余额不足 / 网络错误 / Key 无效）→ 优雅降级到内置离线引擎，保证演示始终可交互
          console.warn("在线大模型调用失败，回退离线引擎：", err);
          const reason = (err && err.message) || "调用失败";
          const isNetwork = /网络连接失败|Failed to fetch|NetworkError|network error|无法连接/i.test(reason);
          const fb = offlineGenerate(prompt, prevCode, { accent: settings && settings.accent, dark: settings && settings.dark });
          setTimeout(() => tick(), 120);
          streamCode(fb.code, onToken, () => {
            tick();
            onDone && onDone(fb.code, { intent: fb.intent, fallback: true, reason, isNetwork });
          });
        },
      });
    } else {
      // 离线引擎（模拟流式）
      const result = offlineGenerate(prompt, prevCode, { accent: settings && settings.accent, dark: settings && settings.dark });
      // 步骤推进
      setTimeout(() => tick(), 120);
      setTimeout(() => tick(), 260);
      streamCode(result.code, onToken, () => {
        tick();
        onDone && onDone(result.code, { intent: result.intent });
      });
    }
  }

  // 把大模型可能包裹的代码块还原为纯 HTML
  function extractHtml(text) {
    if (/<!DOCTYPE html/i.test(text)) {
      const m = text.match(/<!DOCTYPE html[\s\S]*/i);
      return m ? m[0].replace(/<\/?(html|body|head)>?/gi, (s) => s).trim() : text;
    }
    const m = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (m) return m[1].trim();
    return text.trim();
  }

  // 模拟打字机流式输出
  function streamCode(code, onToken, done) {
    let i = 0;
    const chunk = 48;
    function next() {
      if (i >= code.length) { done(); return; }
      const part = code.slice(i, i + chunk);
      i += chunk;
      onToken && onToken(part);
      setTimeout(next, 12);
    }
    next();
  }

  App.Generator = { run, classify, parseName };
})();
