// v2.0: all articles; title read aloud like a sentence; article list at the end; always opens on the first article's first line.
// usage: node test-v20.mjs REPO [--no-audio]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const REPO = process.argv[2];
const NO_AUDIO = process.argv.includes('--no-audio');
const DOCS = path.join(REPO, 'docs');
const BRIDGE = path.join(REPO, 'android/app/src/main/assets/android-bridge.js');
const TYPES = { html: 'text/html', js: 'text/javascript', png: 'image/png', mp3: 'audio/mpeg', webmanifest: 'application/manifest+json' };
const server = inject => http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = p === '/android-bridge.js' && inject ? BRIDGE : path.join(DOCS, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (inject && p === '/index.html') body = body.toString('utf8').replace(/<head[^>]*>/i, m => m + '\n<script src="android-bridge.js"></script>');
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' });
  res.end(body);
}).listen(0);

let failures = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const appSrv = server(true), webSrv = server(false);
async function open(port, app, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(new URL(r.url()).pathname));
  if (app) await page.addInitScript(() => { window.AndroidShell = { getInsets: () => '{"top":24,"bottom":16}' }; });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForLoadState('load');
  await page.evaluate(() => __reader.ready);
  return { ctx, page, errors, requests };
}
const playing = page => page.waitForFunction(() => !__reader.player.paused && __reader.player.currentTime > 0.05, null, { timeout: 5000 });

try {
  console.log('startup');
  {
    const { ctx, page, errors } = await open(appSrv.address().port, true);
    const st = await page.evaluate(() => ({
      id: __reader.state.id, first: __reader.LIST[0].id, y: scrollY,
      heroWords: document.querySelectorAll('#u0 .w .u').length, heroSpk: !!document.querySelector('#u0 .spk'),
      heroZh: document.querySelector('#u0 .zh').textContent, end: document.body.innerText.includes('全文完'),
      toc: document.querySelectorAll('.toc .toc-i').length, n: __reader.LIST.length,
      cur: [...document.querySelectorAll('.toc-i.cur')].map(b => b.dataset.id),
      lastIsToc: document.querySelector('main').lastElementChild.classList.contains('toc'),
    }));
    ok(st.id === st.first && st.y === 0, `opens on the first article (${st.id}) at the top`);
    ok(st.heroWords > 0 && st.heroSpk && st.heroZh, `title has dotted words (${st.heroWords}), Chinese (${st.heroZh}) and a speaker`);
    ok(!st.end, 'no “全文完” line');
    ok(st.lastIsToc && st.toc === st.n && st.cur.join() === st.first, `article list at the end: ${st.toc} articles, current one marked`);
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  console.log('data (every article)');
  {
    const { ctx, page } = await open(webSrv.address().port, false);
    const d = await page.evaluate(async () => {
      const R = __reader, arts = await R.loadAll(), out = [];
      for (const a of arts) {
        const tm = R.store[a.id].timings || [];
        out.push({
          id: a.id, n: a.units.length, errors: a.errors,
          outside: a.units.flatMap((u, i) => u.toks.filter(t => t.gloss && !u.zh.includes(t.gloss)).map(t => `${i}:${t.core}`)),
          noZh: a.units.filter(u => !u.zh).length,
          timings: tm.length, stale: a.units.filter((u, i) => !tm[i] || tm[i].text !== u.speech).length,
          files: tm.map(t => `audio/${a.id}/${t.file}`),
          words: [...new Set(a.units.flatMap(u => u.toks.filter(t => t.core).map(t => R.wordKey(t, a.say))))],
          glossed: a.units.reduce((s, u) => s + u.toks.filter(t => t.gloss).length, 0),
          tokens: a.units.reduce((s, u) => s + u.toks.filter(t => t.core).length, 0),
          title: a.units[0].en, listTitle: R.LIST.find(x => x.id === a.id).title,
        });
      }
      return { out, WORDS: R.WORDS };
    });
    let units = 0, glossed = 0, tokens = 0;
    for (const a of d.out) {
      units += a.n; glossed += a.glossed; tokens += a.tokens;
      const bad = [...a.errors, ...a.outside];
      if (bad.length || a.noZh) ok(false, `${a.id}: gloss problems ${bad.join(', ')} / ${a.noZh} without Chinese`);
      if (!NO_AUDIO) {
        const missing = a.files.filter(f => !fs.existsSync(path.join(DOCS, f)));
        const noWord = a.words.filter(w => !d.WORDS[w] || !fs.existsSync(path.join(DOCS, 'audio/words', d.WORDS[w])));
        if (a.timings !== a.n || a.stale || missing.length || noWord.length)
          ok(false, `${a.id}: recordings ${a.timings}/${a.n}, ${a.stale} out of date, missing ${missing.join(' ')} ${noWord.length} words without audio (${noWord.slice(0, 5).join(' ')})`);
      }
      if (a.title.replace(/_/g, '') !== a.listTitle) ok(false, `${a.id}: list title “${a.listTitle}” ≠ “${a.title}”`);
    }
    ok(failures === 0, `${d.out.length} articles, ${units} units (titles included), ${glossed}/${tokens} words with a meaning (${(100 * glossed / tokens).toFixed(0)}%)` +
      (NO_AUDIO ? '' : ', every unit and word has its recording'));
    await ctx.close();
  }

  console.log('title read aloud');
  {
    const { ctx, page, requests } = await open(appSrv.address().port, true);
    await page.click('#u0 .spk');
    await playing(page);
    await page.waitForFunction(() => document.querySelector('#u0 .w.on'), null, { timeout: 5000 });
    const st = await page.evaluate(() => ({ rate: __reader.player.playbackRate, spk: document.querySelector('#u0 .spk').classList.contains('playing') }));
    ok(requests.includes(`/audio/${'t1p1'}/00.mp3`) && st.rate === 0.8 && st.spk, 'title speaker plays the title recording at 0.8× and highlights words as they are read');
    await page.click('#u0 .spk');
    ok(await page.evaluate(() => __reader.player.paused), 'tapping the speaker again stops');
    const w = '#u0 .w:has(.u:text-is("Dictionary"))';
    await page.click(w);
    await playing(page);
    const t = await page.evaluate(() => ({ tip: __reader.state.tip, dur: __reader.player.duration }));
    ok(t.tip === '词典' && t.dur < 2 && requests.some(r => r.startsWith('/audio/words/dictionary')), `title word “Dictionary”: plays only the word, bubble “${t.tip}”`);
    const ul = await page.evaluate(() => getComputedStyle(document.querySelector('#u0 .w .u')).textDecorationStyle);
    ok(ul === 'dotted', 'title words have the dotted underline');
    await ctx.close();
  }

  console.log('sentences');
  {
    const { ctx, page, requests } = await open(appSrv.address().port, true);
    await page.click('#u2 .w:has(.u:text-is("agreement"))');
    await playing(page);
    ok(await page.evaluate(() => __reader.state.tip) === '共识', 'sentence word: bubble with its meaning from that sentence');
    await page.click('#u2 .spk');
    await playing(page);
    ok(requests.includes('/audio/t1p1/02.mp3'), 'sentence speaker plays that sentence');
    const cards = await page.evaluate(() => [...document.querySelectorAll('.s')].every(a => getComputedStyle(a).boxShadow !== 'none' && a.querySelector('.zh').offsetHeight > 0));
    ok(cards, 'every sentence is a white card with its Chinese underneath');
    await ctx.close();
  }

  console.log('article list');
  {
    const { ctx, page, errors } = await open(appSrv.address().port, true);
    const list = await page.evaluate(() => __reader.LIST.map(a => a.id));
    await page.locator('.toc').scrollIntoViewIfNeeded();
    const target = list[1];
    await page.click(`.toc-i[data-id="${target}"]`);
    await page.waitForFunction(id => __reader.state.id === id, target);
    const st = await page.evaluate(() => ({ y: scrollY, title: document.querySelector('#u0 .ttl').textContent.trim(), bar: document.getElementById('barTitle').textContent,
      cur: [...document.querySelectorAll('.toc-i.cur')].map(b => b.dataset.id), sents: document.querySelectorAll('.s').length }));
    ok(st.y === 0 && st.cur.join() === target && st.sents > 0, `tapping “${st.title}” opens it at the top (${st.sents} sentences), list marks it`);
    // every article opens
    const bad = [];
    for (const id of list) {
      await page.evaluate(id => __reader.openArticle(id), id);
      const n = await page.evaluate(id => __reader.state.id === id ? document.querySelectorAll('.s').length : -1, id);
      if (n <= 0) bad.push(id);
    }
    ok(bad.length === 0, `all ${list.length} articles open from the list` + (bad.length ? ' — failed: ' + bad : ''));
    ok(errors.filter(e => !NO_AUDIO || !/404|Failed to load/.test(e)).length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    // reopen: always the first article at the top
    await page.evaluate(id => __reader.openArticle(id), list[2] || list[1]);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.reload();
    await page.evaluate(() => __reader.ready);
    const re = await page.evaluate(() => ({ id: __reader.state.id, y: scrollY }));
    ok(re.id === list[0] && re.y === 0, `reopening shows the first article's first line (${re.id}, y=${re.y})`);
    // back from the background after more than 5 minutes
    await page.evaluate(id => __reader.openArticle(id), list[1]);
    await page.evaluate(() => scrollTo(0, 2000));
    const back = await page.evaluate(async () => {
      const set = h => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
      set(true);
      const now = Date.now; Date.now = () => now() + 6 * 60 * 1000;
      set(false);
      await new Promise(r => setTimeout(r, 300));
      Date.now = now;
      return { id: __reader.state.id, y: scrollY };
    });
    ok(back.id === list[0] && back.y === 0, 'back after more than 5 minutes in the background: first article, top');
    await ctx.close();
  }

  console.log('web version offline cache');
  {
    const { ctx, page, errors } = await open(webSrv.address().port, false);
    const sw = await page.evaluate(async () => {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r({}), 8000))]);
      if (!reg.active) return { active: false, n: 0 };
      const keys = await caches.keys(), c = await caches.open(keys[0]);
      return { active: !!reg.active, key: keys[0], n: (await c.keys()).length };
    });
    ok(sw.active && sw.n > 10, `service worker active, ${sw.n} files cached up front (${sw.key})`);
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
} finally {
  await browser.close();
  appSrv.close(); webSrv.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
