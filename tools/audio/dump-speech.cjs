// 打开 docs/index.html，加载全部文章，输出要录音的文本（JSON）：
//   articles：[{ id, units: [标题, 第 1 句, …] }]（朗读文本）
//   words：{ 单词键（小写）: 这个词的读法 }（全书共用一套单词录音）
// 录音必须用网页自己算出来的这份文本生成，逐词高亮的字符位置和点词查找才对得上。
// 用法：node tools/audio/dump-speech.cjs > speech.json   （需要 npm i playwright）
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(require('url').pathToFileURL(path.resolve(__dirname, '../../docs/index.html')).href);
  const data = await page.evaluate(async () => {
    const R = window.__reader, words = {};
    const arts = await R.loadAll();
    for (const a of arts) for (const u of a.units) for (const t of u.toks) {
      if (t.core && !(R.wordKey(t, a.say) in words)) words[R.wordKey(t, a.say)] = R.wordSay(t, a.say);
    }
    return { articles: arts.map(a => ({ id: a.id, units: a.units.map(u => u.speech) })), words };
  });
  await browser.close();
  process.stdout.write(JSON.stringify(data, null, 1) + '\n');
})();
