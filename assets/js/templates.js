/* =====================================================================
 * templates.js — 离线智能体模板库
 * 每个模板生成一个完整、真实可交互的单文件 HTML 应用。
 * 约定：主题色用 CSS 变量 --accent；支持 data-theme="dark"。
 * 生成的应用脚本内不使用反引号与 ${}，避免与外层模板字面量冲突。
 * ===================================================================== */
(function () {
  const App = (window.App = window.App || {});

  // ---------- 主题基础样式 ----------
  function theme(accent, dark) {
    const t = dark ? "dark" : "light";
    return (
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<style>" +
      ":root{--accent:" + accent + ";}" +
      '[data-theme="dark"]{--bg:#0f1117;--surface:#171b24;--surface2:#1f2530;--text:#e8ecf4;--muted:#9aa4b6;--border:#2a3140;--shadow:0 10px 30px rgba(0,0,0,.5);}' +
      '[data-theme="light"]{--bg:#f6f7fb;--surface:#ffffff;--surface2:#eef1f7;--text:#1a1d24;--muted:#5b6472;--border:#e4e8f0;--shadow:0 10px 30px rgba(20,30,60,.08);}' +
      "*{box-sizing:border-box;margin:0;padding:0;}" +
      "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;line-height:1.6;}" +
      ".wrap{max-width:760px;margin:0 auto;padding:28px 20px;}" +
      "h1,h2,h3{line-height:1.25;}" +
      ".btn{background:var(--accent);color:#fff;border:none;padding:10px 16px;border-radius:10px;font-size:14px;cursor:pointer;font-weight:600;transition:.15s;}" +
      ".btn:hover{filter:brightness(1.07);transform:translateY(-1px);}" +
      ".btn.ghost{background:var(--surface2);color:var(--text);border:1px solid var(--border);}" +
      "input,select,textarea{font-family:inherit;font-size:14px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 12px;outline:none;}" +
      "input:focus,textarea:focus,select:focus{border-color:var(--accent);}" +
      ".card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:var(--shadow);}" +
      ".muted{color:var(--muted);}" +
      "</style>"
    );
  }

  // 安全 localStorage 包装（沙箱/无痕下不崩溃）
  const SAFE_STORE = (
    "var SK='atoms_app';" +
    "function load(){try{return JSON.parse(localStorage.getItem(SK)||'null');}catch(e){return null;}}" +
    "function save(v){try{localStorage.setItem(SK,JSON.stringify(v));}catch(e){}}"
  );

  // ===================== 1. 待办清单 =====================
  function todo(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><div class='card'>" +
      "<h1 style='font-size:22px;margin-bottom:4px'>" + esc(o.name) + "</h1>" +
      "<p class='muted' style='margin-bottom:16px'>添加任务、标记完成、随时清理。</p>" +
      "<div style='display:flex;gap:8px;margin-bottom:14px'>" +
      "<input id='t' placeholder='要做点什么？' style='flex:1'> " +
      "<button class='btn' onclick='add()'>添加</button></div>" +
      "<div style='display:flex;gap:6px;margin-bottom:12px;font-size:12px'>" +
      "<button class='btn ghost' onclick='filter(\"all\")'>全部</button>" +
      "<button class='btn ghost' onclick='filter(\"active\")'>进行中</button>" +
      "<button class='btn ghost' onclick='filter(\"done\")'>已完成</button>" +
      "<span id='prog' class='muted' style='margin-left:auto;align-self:center'></span></div>" +
      "<div id='list' style='display:flex;flex-direction:column;gap:8px'></div>" +
      "</div></div>" +
      "<script>" + SAFE_STORE +
      "var items=load()||[];var f='all';" +
      "function render(){var el=document.getElementById('list');el.innerHTML='';" +
      "var view=items.filter(function(i){return f==='all'||(f==='done')===i.done;});" +
      "view.forEach(function(it){var d=document.createElement('div');" +
      "d.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px';" +
      "var cb=document.createElement('input');cb.type='checkbox';cb.checked=it.done;cb.onchange=function(){it.done=cb.checked;persist();};" +
      "var sp=document.createElement('span');sp.textContent=it.text;sp.style.cssText='flex:1;'+(it.done?'text-decoration:line-through;color:var(--muted)':'');" +
      "var del=document.createElement('button');del.textContent='✕';del.className='btn ghost';del.style.cssText='padding:4px 9px';del.onclick=function(){items=items.filter(function(x){return x!==it;});persist();};" +
      "d.appendChild(cb);d.appendChild(sp);d.appendChild(del);el.appendChild(d);});" +
      "var done=items.filter(function(i){return i.done;}).length;" +
      "document.getElementById('prog').textContent=items.length+' 项 · 完成 '+done;}" +
      "function add(){var i=document.getElementById('t');var v=i.value.trim();if(!v)return;items.push({text:v,done:false});i.value='';persist();}" +
      "function persist(){save(items);render();}" +
      "function filter(x){f=x;render();}" +
      "document.getElementById('t').addEventListener('keydown',function(e){if(e.key==='Enter')add();});" +
      "render();" +
      "</script></body></html>"
    );
  }

  // ===================== 2. 计算器 =====================
  function calculator(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><div class='card' style='max-width:320px;margin:0 auto'>" +
      "<h1 style='font-size:18px;text-align:center;margin-bottom:14px'>" + esc(o.name) + "</h1>" +
      "<input id='disp' readonly style='width:100%;text-align:right;font-size:26px;margin-bottom:12px;font-family:monospace' value='0'>" +
      "<div id='pad' style='display:grid;grid-template-columns:repeat(4,1fr);gap:8px'></div>" +
      "</div></div>" +
      "<script>" +
      "var keys=['C','±','%','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','='];var expr='';" +
      "var pad=document.getElementById('pad');" +
      "keys.forEach(function(k){var b=document.createElement('button');b.textContent=k;" +
      "var bg=k==='='?'var(--accent)':((isNaN(k)&&k!=='.')?'var(--surface2)':'var(--surface)');" +
      "var col=k==='='?'#fff':'var(--text)';" +
      "b.style.cssText='padding:14px;font-size:17px;border-radius:10px;border:1px solid var(--border);background:'+bg+';color:'+col;'" +
      "b.onclick=function(){press(k);};pad.appendChild(b);});" +
      "function press(k){if(k==='C'){expr='';}else if(k==='±'){expr=expr.charAt(0)==='-'?expr.slice(1):'-'+expr;}else if(k==='%'){expr=expr?'('+expr+')/100':'';}else if(k==='='){try{var e=expr.replace(/[^0-9+\\-*/.%() ]/g,'');if(e){var r=Function('return ('+e+')')();expr=String(Math.round(r*1e10)/1e10);}}catch(err){expr='Error';}}else{expr+=k;}" +
      "document.getElementById('disp').value=expr||'0';}" +
      "document.addEventListener('keydown',function(e){var m={'Enter':'=','Backspace':'C','+':'+','-':'-','*':'*','/':'/','%':'%','.':'.'};if(m[e.key])press(m[e.key]);else if(/[0-9]/.test(e.key))press(e.key);});" +
      "</script></body></html>"
    );
  }

  // ===================== 3. 计数器 =====================
  function counter(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><div class='card' style='text-align:center;max-width:360px;margin:0 auto'>" +
      "<h1 style='font-size:18px;margin-bottom:18px'>" + esc(o.name) + "</h1>" +
      "<div id='num' style='font-size:72px;font-weight:800;color:var(--accent);line-height:1;margin:10px 0'>0</div>" +
      "<div style='display:flex;gap:8px;justify-content:center;margin:16px 0'>" +
      "<button class='btn ghost' onclick='dec()'>－</button>" +
      "<button class='btn' onclick='inc()'>＋</button></div>" +
      "<div style='display:flex;gap:8px;justify-content:center;align-items:center'>" +
      "<span class='muted'>步长</span><input id='step' type='number' value='1' style='width:70px'>" +
      "<button class='btn ghost' onclick='reset()'>重置</button></div>" +
      "</div></div>" +
      "<script>" + SAFE_STORE +
      "var n=load()||0;function show(){document.getElementById('num').textContent=n;save(n);}" +
      "function inc(){var s=parseInt(document.getElementById('step').value)||1;n+=s;show();}" +
      "function dec(){var s=parseInt(document.getElementById('step').value)||1;n-=s;show();}" +
      "function reset(){n=0;show();}show();" +
      "</script></body></html>"
    );
  }

  // ===================== 4. 番茄钟 =====================
  function pomodoro(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><div class='card' style='text-align:center;max-width:360px;margin:0 auto'>" +
      "<h1 style='font-size:18px;margin-bottom:8px'>" + esc(o.name) + "</h1>" +
      "<div style='display:flex;gap:6px;justify-content:center;margin-bottom:16px'>" +
      "<button class='btn ghost' id='m1' onclick='mode(25)'>专注 25</button>" +
      "<button class='btn ghost' id='m2' onclick='mode(5)'>休息 5</button></div>" +
      "<div id='ring' style='width:200px;height:200px;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--accent) 0deg,var(--surface2) 0deg)'>" +
      "<div style='width:160px;height:160px;border-radius:50%;background:var(--surface);display:grid;place-items:center'>" +
      "<div id='time' style='font-size:42px;font-weight:800'>25:00</div></div></div>" +
      "<div style='display:flex;gap:8px;justify-content:center;margin-top:18px'>" +
      "<button class='btn' id='toggle' onclick='toggle()'>开始</button>" +
      "<button class='btn ghost' onclick='reset()'>重置</button></div>" +
      "<p id='sess' class='muted' style='margin-top:12px'>已完成 0 个专注</p>" +
      "</div></div>" +
      "<script>" +
      "var total=25*60,left=total,timer=null,running=false,done=0;" +
      "function fmt(s){var m=Math.floor(s/60),x=s%60;return (m<10?'0':'')+m+':'+(x<10?'0':'')+x;}" +
      "function paint(){document.getElementById('time').textContent=fmt(left);var p=(1-left/total)*360;document.getElementById('ring').style.background='conic-gradient(var(--accent) '+p+'deg,var(--surface2) '+p+'deg)';}" +
      "function tick(){if(left>0){left--;paint();}else{finish();}}" +
      "function finish(){stop();done++;document.getElementById('sess').textContent='已完成 '+done+' 个专注';left=total;paint();}" +
      "function toggle(){if(running){stop();}else{running=true;document.getElementById('toggle').textContent='暂停';timer=setInterval(tick,1000);}}" +
      "function stop(){running=false;clearInterval(timer);document.getElementById('toggle').textContent='开始';}" +
      "function reset(){stop();left=total;paint();}" +
      "function mode(m){stop();total=m*60;left=total;paint();document.getElementById('m1').className='btn ghost';document.getElementById('m2').className='btn ghost';}" +
      "paint();" +
      "</script></body></html>"
    );
  }

  // ===================== 5. 落地页 =====================
  function landing(o) {
    const name = esc(o.name || "你的产品");
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body>" +
      "<header style='display:flex;justify-content:space-between;align-items:center;padding:18px 28px;max-width:980px;margin:0 auto'>" +
      "<strong style='font-size:18px'>" + name + "</strong>" +
      "<a class='btn' href='#cta'>开始使用</a></header>" +
      "<section class='wrap' style='text-align:center;padding-top:48px'>" +
      "<div style='display:inline-block;padding:6px 14px;border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--accent);background:var(--surface);margin-bottom:18px'>✨ 由 Atoms Demo 智能体生成</div>" +
      "<h1 style='font-size:40px;font-weight:800;max-width:640px;margin:0 auto 16px'>用 " + name + " 重新定义你的工作流</h1>" +
      "<p class='muted' style='font-size:16px;max-width:520px;margin:0 auto 26px'>一句话描述，即可生成可交互的网页应用。快速验证想法，专注创造价值。</p>" +
      "<div style='display:flex;gap:12px;justify-content:center'>" +
      "<a class='btn' href='#cta' id='cta'>免费开始 →</a>" +
      "<button class='btn ghost' onclick='alert(\"感谢体验 \"+document.title)'>了解更多</button></div>" +
      "<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:48px;text-align:left'>" +
      feat("⚡ 极速生成", "自然语言驱动，分钟级产出可运行应用。") +
      feat("🧩 真实交互", "生成的不是静态图，而是可点击、可用的产品。") +
      feat("🚀 一键部署", "导出单文件 HTML，任意环境直接运行。") +
      "</div></div>" +
      "<footer class='muted' style='text-align:center;padding:40px;font-size:13px'>© " + name + " · Powered by Atoms Demo</footer>" +
      "<script>document.title='" + name + "';</script>" +
      "</body></html>"
    );
  }
  function feat(t, d) {
    return "<div class='card'><div style='font-size:15px;font-weight:600;margin-bottom:6px'>" + t + "</div><div class='muted' style='font-size:13px'>" + d + "</div></div>";
  }

  // ===================== 6. 数据仪表盘 =====================
  function dashboard(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'>" +
      "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:18px'>" +
      "<h1 style='font-size:22px'>" + esc(o.name) + "</h1>" +
      "<div style='display:flex;gap:6px'>" +
      "<button class='btn ghost' onclick='range(7)'>7天</button>" +
      "<button class='btn ghost' onclick='range(30)'>30天</button>" +
      "<button class='btn ghost' onclick='range(90)'>90天</button></div></div>" +
      "<div id='kpis' style='display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px'></div>" +
      "<div class='card'><h3 style='margin-bottom:12px'>趋势</h3><canvas id='cv' height='220' style='width:100%'></canvas></div>" +
      "<script>" +
      "var data={7:[12,18,15,22,19,25,28],30:[10,14,12,18,22,20,26,24,30,28,33,31,29,35,38,34,40,42,39,45,48,44,50,52,49,55,58,60,57,63],90:[8,12,15,18,22,25,28,30,33,36,40,42,38,45,48,52,55,50,58,62,60,66,70,68,72,75,78,74,80,82,85,88,90,86,92,95,98,94,100,96,102,105,108,110,106,112,115,118,120,116,122,125,128,130,126,132,135,138,140,136,142,145,148,150]};" +
      "function rnd(a){return a[Math.floor(Math.random()*a.length)];}" +
      "function range(n){var a=data[n];" +
      "var kpis=[['营收',(rnd(a)*1234).toFixed(0)+' 元'],['活跃用户',(rnd(a)*89).toFixed(0)],['增长率',(rnd(a)/3).toFixed(1)+'%']];" +
      "var k=document.getElementById('kpis');k.innerHTML='';kpis.forEach(function(p){var d=document.createElement('div');d.className='card';d.innerHTML=\"<div class='muted' style='font-size:12px'>\"+p[0]+\"</div><div style='font-size:26px;font-weight:800;color:var(--accent)'>\"+p[1]+\"</div>\";k.appendChild(d);});" +
      "draw(a);}" +
      "function draw(a){var c=document.getElementById('cv');var w=c.clientWidth,h=220;c.width=w;c.height=h;var ctx=c.getContext('2d');ctx.clearRect(0,0,w,h);" +
      "var max=Math.max.apply(null,a),min=Math.min.apply(null,a);" +
      "ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#7c5cff';ctx.lineWidth=3;ctx.beginPath();" +
      "a.forEach(function(v,i){var x=i/(a.length-1)*w;var y=h-((v-min)/(max-min||1))*(h-30)-15;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();" +
      "a.forEach(function(v,i){var x=i/(a.length-1)*w;var y=h-((v-min)/(max-min||1))*(h-30)-15;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill();});}" +
      "range(30);window.addEventListener('resize',function(){range(document.querySelector('.btn.ghost')?30:30);});" +
      "</script></div></body></html>"
    );
  }

  // ===================== 7. 笔记 / Markdown =====================
  function notes(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><h1 style='font-size:20px;margin-bottom:12px'>" + esc(o.name) + "</h1>" +
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>" +
      "<textarea id='md' style='min-height:360px;resize:vertical' placeholder='# 标题&#10;**加粗**&#10;- 列表项'></textarea>" +
      "<div id='pv' class='card' style='min-height:360px;overflow:auto'></div></div>" +
      "<div style='margin-top:12px;display:flex;gap:8px'>" +
      "<button class='btn' onclick='saveNote()'>保存</button>" +
      "<button class='btn ghost' onclick='dl()'>下载 .md</button></div>" +
      "<script>" + SAFE_STORE +
      "var ta=document.getElementById('md'),pv=document.getElementById('pv');" +
      "function md(s){return s.replace(/^# (.*)$/gm,'<h2>$1</h2>').replace(/^## (.*)$/gm,'<h3>$1</h3>').replace(/\\*\\*(.*?)\\*\\*/g,'<b>$1</b>').replace(/^- (.*)$/gm,'<li>$1</li>').replace(/\\n/g,'<br>');}" +
      "function render(){pv.innerHTML=md(ta.value);}ta.addEventListener('input',render);" +
      "function saveNote(){try{localStorage.setItem('note',ta.value);}catch(e){}toast('已保存');}" +
      "function dl(){var b=new Blob([ta.value],{type:'text/markdown'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='note.md';a.click();}" +
      "function toast(m){var t=document.createElement('div');t.textContent=m;t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:8px 16px;border-radius:8px';document.body.appendChild(t);setTimeout(function(){t.remove();},1500);}" +
      "try{var s=localStorage.getItem('note');if(s)ta.value=s;}catch(e){}render();" +
      "</script></div></body></html>"
    );
  }

  // ===================== 8. 问答测验 =====================
  function quiz(o) {
    var qs = [
      ["Atoms Demo 的核心能力是什么？", ["静态图片生成", "自然语言生成可交互网页", "视频剪辑", "音乐制作"], 1],
      ["生成的应用以什么形式展示？", ["PDF", "可视化网页(iframe 预览)", "Excel", "Word"], 1],
      ["本项目默认是否需要 API Key？", ["必须付费", "不需要，内置离线智能体", "需要显卡", "需要服务器"], 1]
    ];
    var qjson = JSON.stringify(qs).replace(/</g, "&lt;");
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><div class='card' style='max-width:520px;margin:0 auto'>" +
      "<h1 style='font-size:20px;margin-bottom:14px'>" + esc(o.name) + "</h1>" +
      "<div id='box'></div></div></div>" +
      "<script>var QS=" + qjson + ";var i=0,score=0;" +
      "function show(){if(i>=QS.length){var b=document.getElementById('box');b.innerHTML='<h2>完成！得分 '+score+' / '+QS.length+'</h2><button class=\"btn\" onclick=\"i=0;score=0;show()\">再来一次</button>';return;}" +
      "var q=QS[i];var h='<p class=muted>第 '+(i+1)+' / '+QS.length+' 题</p><h3 style=\"margin:6px 0 14px\">'+q[0]+'</h3>';" +
      "q[1].forEach(function(opt,idx){h+='<button class=\"btn ghost\" style=\"display:block;width:100%;text-align:left;margin-bottom:8px\" onclick=\"ans('+idx+')\">'+opt+'</button>';});" +
      "document.getElementById('box').innerHTML=h;}" +
      "function ans(idx){if(idx===QS[i][2])score++;i++;show();}show();" +
      "</script></div></body></html>"
    );
  }

  // ===================== 9. 猜数字游戏 =====================
  function game(o) {
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><div class='card' style='text-align:center;max-width:380px;margin:0 auto'>" +
      "<h1 style='font-size:20px;margin-bottom:8px'>" + esc(o.name) + "</h1>" +
      "<p class='muted' style='margin-bottom:14px'>我想了一个 1-100 的数字，猜猜看？</p>" +
      "<div id='msg' style='font-size:16px;margin-bottom:12px;min-height:24px'>开始吧！</div>" +
      "<div style='display:flex;gap:8px;justify-content:center'>" +
      "<input id='g' type='number' style='width:110px' placeholder='你的猜测'>" +
      "<button class='btn' onclick='guess()'>猜</button></div>" +
      "<p id='tries' class='muted' style='margin-top:12px'>尝试次数：0</p>" +
      "<button class='btn ghost' style='margin-top:10px' onclick='restart()'>重新开始</button>" +
      "</div></div>" +
      "<script>var ans,tries;function restart(){ans=Math.floor(Math.random()*100)+1;tries=0;document.getElementById('tries').textContent='尝试次数：0';document.getElementById('msg').textContent='开始吧！';}" +
      "function guess(){var v=parseInt(document.getElementById('g').value);if(isNaN(v))return;trys();if(v===ans){document.getElementById('msg').textContent='🎉 猜对了！答案是 '+ans;}else if(v<ans){document.getElementById('msg').textContent='⬆ 再大一点';}else{document.getElementById('msg').textContent='⬇ 再小一点';}document.getElementById('g').value='';}" +
      "function trys(){tries++;document.getElementById('tries').textContent='尝试次数：'+tries;}restart();" +
      "</script></body></html>"
    );
  }

  // ===================== 10. 天气（模拟） =====================
  function weather(o) {
    var cities = {
      "北京": [26, "晴", [22, 26, 24, 21, 25]],
      "上海": [29, "多云", [27, 29, 28, 30, 27]],
      "广州": [33, "雷阵雨", [31, 33, 32, 30, 34]],
      "成都": [24, "阴", [22, 24, 23, 21, 25]]
    };
    var cj = JSON.stringify(cities).replace(/</g, "&lt;");
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap'><h1 style='font-size:20px;margin-bottom:14px'>" + esc(o.name) + "</h1>" +
      "<div id='cities' style='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px'></div>" +
      "<div id='panel'></div>" +
      "<script>var C=" + cj + ";var cur='北京';" +
      "function bar(){var h='';for(var k in C){h+='<button class=\"btn '+(k===cur?'':'ghost')+'\" onclick=\"sel(\\''+k+'\\')\">'+k+'</button>';}document.getElementById('cities').innerHTML=h;}" +
      "function sel(k){cur=k;bar();paint();}" +
      "function paint(){var c=C[cur];var f='';c[2].forEach(function(t){f+='<div class=\"card\" style=\"text-align:center;padding:12px\"><div class=\"muted\" style=\"font-size:12px\">'+t+'°</div></div>';});" +
      "document.getElementById('panel').innerHTML='<div class=\"card\" style=\"display:flex;align-items:center;gap:20px;margin-bottom:14px\"><div style=\"font-size:44px;font-weight:800;color:var(--accent)\">'+c[0]+'°</div><div><div style=\"font-size:18px;font-weight:600\">'+cur+'</div><div class=muted>'+c[1]+'</div></div></div><h3 style=\"margin:6px 0 10px\">未来几天</h3><div style=\"display:grid;grid-template-columns:repeat(5,1fr);gap:10px\">'+f+'</div>';}" +
      "bar();paint();" +
      "</script></div></body></html>"
    );
  }

  // ===================== 11. 通用应用（兜底） =====================
  function generic(o) {
    var name = esc(o.name || "我的应用");
    var sub = esc(o.subtitle || (o.prompt ? "基于需求：" + o.prompt : "由 Atoms Demo 智能体生成"));
    return (
      "<!DOCTYPE html><html data-theme=\"light\"><head>" + theme(o.accent, o.dark) +
      "</head><body><div class='wrap' style='text-align:center;padding-top:56px'>" +
      "<div class='card' style='max-width:520px;margin:0 auto'>" +
      "<div style='font-size:40px;margin-bottom:10px'>🛠️</div>" +
      "<h1 style='font-size:26px;margin-bottom:8px'>" + name + "</h1>" +
      "<p class='muted' style='margin-bottom:20px'>" + sub + "</p>" +
      "<div style='display:flex;gap:10px;justify-content:center;margin-bottom:18px'>" +
      "<input id='item' placeholder='输入一条内容' style='flex:1'>" +
      "<button class='btn' onclick='add()'>添加</button></div>" +
      "<ul id='list' style='list-style:none;text-align:left;display:flex;flex-direction:column;gap:8px'></ul>" +
      "</div></div>" +
      "<script>" + SAFE_STORE +
      "var items=load()||[];function render(){var el=document.getElementById('list');el.innerHTML='';items.forEach(function(t){var li=document.createElement('li');li.textContent='• '+t;li.style.cssText='padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px';el.appendChild(li);});}" +
      "function add(){var i=document.getElementById('item');var v=i.value.trim();if(!v)return;items.push(v);i.value='';save(items);render();}render();" +
      "</script></body></html>"
    );
  }

  // 转义，防止 name 破坏属性
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  App.Templates = { todo, calculator, counter, pomodoro, landing, dashboard, notes, quiz, game, weather, generic, _esc: esc };
})();
