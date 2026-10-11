// 打开 docs/index.html，输出要录音的文本（JSON）：
//   sentences：每句的朗读文本；words：{ 单词键（小写）: 这个词的读法 }
// 录音必须用网页自己算出来的这份文本生成，逐词高亮的字符位置和点词查找才对得上。
// 用法：node tools/audio/dump-speech.cjs > speech.json   （需要 npm i playwright）
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, '../../docs/index.html'));
  const data = await page.evaluate(() => {
    const { SENTS, wordSay, wordKey } = window.__reader, words = {};
    for (const s of SENTS) for (const t of s.toks) if (t.core && !(wordKey(t) in words)) words[wordKey(t)] = wordSay(t);
    return { sentences: SENTS.map(s => s.speech), words };
  });
  await browser.close();
  process.stdout.write(JSON.stringify(data, null, 1) + '\n');
})();
