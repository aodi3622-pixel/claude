// v2.0 screenshots, served the way MainActivity serves the page (bridge injected), laid out as numbered phone frames.
// usage: node ui-shots7.mjs REPO OUTDIR
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const REPO = process.argv[2], OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const DOCS = path.join(REPO, 'docs');
const BRIDGE = path.join(REPO, 'android/app/src/main/assets/android-bridge.js');
const W = 390, H = 844, TOP = 32, BOTTOM = 20;   // typical phone, status bar + gesture bar insets (dp)
const TYPES = { html: 'text/html', js: 'text/javascript', png: 'image/png', mp3: 'audio/mpeg' };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = p === '/android-bridge.js' ? BRIDGE : path.join(DOCS, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (p === '/index.html') body = body.toString('utf8').replace(/<head[^>]*>/i, m => m + '\n<script src="android-bridge.js"></script>');
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' });
  res.end(body);
}).listen(0);
const URL0 = `http://127.0.0.1:${srv.address().port}/`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
async function shot(name, act) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(insets => { window.AndroidShell = { getInsets: () => JSON.stringify(insets) }; }, { top: TOP, bottom: BOTTOM });
  await page.goto(URL0);
  await page.waitForLoadState('load');
  await page.evaluate(() => __reader.ready);
  await page.waitForTimeout(300);
  if (act) await act(page);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  await ctx.close();
}

const word = (i, w) => `#u${i} .w:has(.u:text-is("${w}"))`;
const open = id => p => p.evaluate(id => __reader.openArticle(id), id);
const toEl = (sel, pad = 0) => p => p.evaluate(([sel, pad]) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  scrollBy(0, r.top - document.getElementById('bar').getBoundingClientRect().bottom - pad);
}, [sel, pad]);
const S = JSON.parse(process.env.SHOTS || '{}');   // per-shot overrides: { essay: 't1w1', gt: 'tbs1b', gtWord: [2, 'detective'], other: 't2p1' }

await shot('1-home');
await shot('2-title-word', async p => { await p.click(word(0, 'Dictionary')); await p.waitForTimeout(500); });
await shot('3-title-read', async p => { await p.click('#u0 .spk'); await p.waitForTimeout(900); });
await shot('4-list', async p => { await toEl('.toc', 12)(p); await p.waitForTimeout(300); });
await shot('5-list-more', async p => { await toEl(`.toc-i[data-id="${S.listFrom || 'tas1a'}"]`, 40)(p); await p.waitForTimeout(300); });
await shot('6-other', async p => { await toEl('.toc', 12)(p); await p.click(`.toc-i[data-id="${S.other || 't2p1'}"]`); await p.waitForTimeout(600); });
await shot('7-essay', async p => { await open(S.essay || 't4w2')(p); await p.waitForTimeout(400);
  if (S.essayWord) { await p.click(word(...S.essayWord)); await p.waitForTimeout(500); } });
await shot('8-gt', async p => { await open(S.gt || 'tbs1b')(p); await p.waitForTimeout(400);
  if (S.gtWord) { await p.click(word(...S.gtWord)); await p.waitForTimeout(500); } });

// ---- gallery: two sheets of four phones ----
const CAP = JSON.parse(process.env.CAPS || 'null') || {
  '1-home': ['打开 app', '总是第一篇的第一行：标题也有虚线、中文和小喇叭'],
  '2-title-word': ['点标题里的词', '只读这个词，小气泡显示标题译文里对应的中文'],
  '3-title-read': ['点标题的小喇叭', '读标题，正在读的词黄色高亮'],
  '4-list': ['文章结尾', '没有“全文完”，接着就是文章列表'],
  '5-list-more': ['文章列表', '全书阅读文章和写作范文，当前这篇有蓝色标记'],
  '6-other': ['点列表里的文章', '跳到那一篇，从标题开始'],
  '7-essay': ['写作范文', '范文也一样逐句跟读'],
  '8-gt': ['培训类阅读', ''],
};
const names = Object.keys(CAP);
const img = n => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, n + '.png')).toString('base64');
const phone = (n, i) => {
  const ink = '#1b1c21';
  return `<figure><div class="ph"><img src="${img(n)}"><div class="sb" style="color:${ink}"><b>9:41</b><span>
  <svg width="17" height="12" viewBox="0 0 17 12" fill="${ink}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
  <svg width="24" height="12" viewBox="0 0 24 12"><rect x=".5" y=".5" width="20" height="11" rx="3" fill="none" stroke="${ink}" opacity=".5"/><rect x="2" y="2" width="15" height="8" rx="1.5" fill="${ink}"/><rect x="21.5" y="4" width="1.5" height="4" rx=".7" fill="${ink}" opacity=".5"/></svg></span></div>
  <div class="pill" style="background:${ink}"></div></div>
  <figcaption><i>${i + 1}</i><b>${CAP[n][0]}</b><span>${CAP[n][1]}</span></figcaption></figure>`;
};
const page = await (await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 })).newPage();
for (const [k, list] of [[1, names.slice(0, 4)], [2, names.slice(4, 8)]]) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px 24px 8px;background:#e9e7e1;font:14px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;color:#1b1c21}
    .g{display:grid;grid-template-columns:repeat(2,${W}px);gap:28px 40px;justify-content:center}
    .ph{position:relative;width:${W}px;height:${H}px;border-radius:34px;overflow:hidden;box-shadow:0 0 0 9px #16171c,0 12px 30px rgba(0,0,0,.35)}
    .ph img{display:block;width:100%;height:100%}
    .sb{position:absolute;left:0;right:0;top:0;height:${TOP}px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font-size:14px}
    .sb span{display:flex;gap:6px;align-items:center}
    .pill{position:absolute;left:50%;bottom:7px;width:120px;height:4px;margin-left:-60px;border-radius:2px;opacity:.75}
    figure{margin:0}
    figcaption{margin:22px 4px 0;display:grid;grid-template-columns:30px 1fr;column-gap:8px;align-items:baseline}
    figcaption i{grid-row:span 2;font:italic 700 26px/1 Georgia,serif;color:#4a50c6}
    figcaption b{font-size:17px} figcaption span{color:#555864;font-size:14px}
  </style><div class="g">${list.map(n => phone(n, names.indexOf(n))).join('')}</div>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `v20-ui-${k}.png`), fullPage: true });
}
await browser.close(); srv.close();
console.log('done');
