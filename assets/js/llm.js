/* =====================================================================
 * llm.js — 可选真实大模型客户端（OpenAI 兼容接口，支持 SSE 流式）
 * 仅当用户在设置中填入 API Key 时启用；否则由离线引擎兜底。
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});

  async function generate(opts) {
    const { baseUrl, apiKey, model, system, user, onToken, onDone, onError, signal } = opts;
    const url = (baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "") + "/chat/completions";

    const body = {
      model: model || "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      stream: true,
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        let msg = "HTTP " + res.status;
        try {
          const t = await res.text();
          if (t) msg += " · " + t.slice(0, 200);
        } catch (e) {}
        throw new Error(msg);
      }

      // 服务端不支持流或返回 JSON 时降级
      const ct = res.headers.get("content-type") || "";
      if (!res.body || ct.indexOf("text/event-stream") === -1) {
        const j = await res.json();
        const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
        onToken && onToken(text);
        onDone && onDone(text);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s || s.indexOf("data:") !== 0) continue;
          const data = s.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices && json.choices[0] && json.choices[0].delta;
            if (delta && delta.content) {
              full += delta.content;
              onToken && onToken(delta.content);
            }
          } catch (e) {}
        }
      }
      onDone && onDone(full);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      onError && onError(err);
    }
  }

  App.LLM = { generate };
})();
