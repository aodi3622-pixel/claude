// 打开 docs/index.html，输出每句的朗读文本（JSON 数组）。
// 录音必须用网页自己算出来的这份文本生成，逐词高亮的字符位置才对得上。
// 用法：node tools/audio/dump-speech.cjs > speech.json   （需要 npm i playwright）
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, '../../docs/index.html'));
  const speech = await page.evaluate(() => window.__reader.SENTS.map(s => s.speech));
  await browser.close();
  process.stdout.write(JSON.stringify(speech, null, 1) + '\n');
})();
