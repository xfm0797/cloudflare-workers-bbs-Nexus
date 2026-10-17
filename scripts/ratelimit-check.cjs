#!/usr/bin/env node
/**
 * 用真实浏览器（CDP）验证限流：在页面内连续 fetch 目标路径，统计状态码分布。
 * 比 curl 可信 —— curl 的 TLS/UA 指纹会被 Bot Fight Mode 先拦掉。
 *
 *   node scripts/ratelimit-check.cjs https://forum.lovou.pw/search?q= 30 800
 */
const { spawn } = require('node:child_process');
const http = require('node:http');

const BASE = process.argv[2] || 'https://forum.lovou.pw/search?q=';
const COUNT = Number(process.argv[3] || 30);
const GAP = Number(process.argv[4] || 800);
const PORT = 9333;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const fs = require('node:fs');
const bin = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!bin) {
  console.error('找不到 Chrome');
  process.exit(1);
}

const chrome = spawn(bin, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + require('node:os').tmpdir() + '/rl-check-profile',
  'about:blank',
]);
chrome.stderr.on('data', () => {});

const getJson = (path) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });

(async () => {
  let targets;
  for (let i = 0; i < 30; i += 1) {
    try {
      targets = await getJson('/json/list');
      if (targets.length) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  await new Promise((resolve) => (ws.onopen = resolve));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // headless 的 UA 含 HeadlessChrome，会被站点自身的 botguard 拦掉，这里伪装成普通 Chrome
  await send('Network.setUserAgentOverride', {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    acceptLanguage: 'zh-CN,zh;q=0.9',
    platform: 'Win32',
  });
  // 先打开首页拿到 cookie，避免首访重定向
  await send('Page.navigate', { url: new URL(BASE).origin + '/' });
  await new Promise((r) => setTimeout(r, 2500));

  const ck = await send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  console.log('cookie:', JSON.stringify(ck.result.result.value || ''));

  const expr = `(async () => {
    const out = [];
    for (let i = 0; i < ${COUNT}; i++) {
      try {
        const r = await fetch(${JSON.stringify(BASE)} + 'rl' + Date.now() + i, { cache: 'no-store' });
        out.push(r.status);
      } catch (e) { out.push('ERR'); }
      await new Promise(r => setTimeout(r, ${GAP}));
    }
    return JSON.stringify(out);
  })()`;

  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const codes = JSON.parse(res.result.result.value);
  const tally = {};
  for (const c of codes) tally[c] = (tally[c] || 0) + 1;
  console.log('请求次数', codes.length);
  console.log('状态码分布', JSON.stringify(tally));
  console.log('序列', codes.join(' '));
  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(1);
});
