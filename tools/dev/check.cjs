// 检查文章数据：词义对不上的、覆盖率、可疑标点。用法：node check.cjs [id ...] [--miss]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const DOCS = path.resolve(__dirname, '../../docs');
(async () => {
  const args = process.argv.slice(2), showMiss = args.includes('--miss');
  let ids = args.filter(a => !a.startsWith('--'));
  if (!ids.length) ids = fs.readdirSync(DOCS + '/articles').filter(f => f !== 'index.js').map(f => f.replace(/\.js$/, ''));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(require('url').pathToFileURL(path.join(DOCS, 'index.html')).href);
  const res = await page.evaluate(async ids => {
    const R = window.__reader; await R.ready;
    const out = [];
    for (const id of ids) {
      try {
        const a = await R.ensure(id);
        let words = 0, glossed = 0; const miss = [], warn = [];
        a.units.forEach((u, i) => {
          const m = [];
          for (const t of u.toks) if (t.core) { words++; if (t.gloss) glossed++; else m.push(t.core); }
          if (m.length) miss.push(`${i}: ${m.join(' ')}`);
          if (!u.zh) warn.push(`${i}: 没有中文`);
          if (/[一-鿿][,;:?!]|[,;:?!][一-鿿]/.test(u.zh)) warn.push(`${i}: 中文里有英文标点 ${u.zh}`);
          if (/\s{2,}|^\s|\s$/.test(u.en)) warn.push(`${i}: 英文多余空格`);
          if (/['"]/.test(u.en)) warn.push(`${i}: 英文直引号 ${u.en}`);
        });
        out.push({ id, n: a.units.length, words, glossed, errors: a.errors, miss, warn, timings: !!(R.store[id].timings) });
      } catch (e) { out.push({ id, err: String(e) }); }
    }
    return out;
  }, ids);
  for (const r of res) {
    if (r.err) { console.log(r.id, 'ERROR', r.err); continue; }
    console.log(`${r.id}: ${r.n} units, words ${r.words}, glossed ${r.glossed} (${(100 * r.glossed / r.words).toFixed(0)}%), timings ${r.timings}`);
    for (const e of r.errors) console.log('  GLOSS', e);
    for (const w of r.warn) console.log('  WARN', w);
    if (showMiss) for (const m of r.miss) console.log('  miss', m);
  }
  await browser.close();
})();
