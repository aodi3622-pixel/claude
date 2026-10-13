# 项目记忆文件（交接说明）

> 这份文件是给在你自己电脑上继续这个项目的人（或你电脑上的 Claude Code）看的。
> Claude Code 打开这个仓库时会自动读取根目录的 `CLAUDE.md`。
> 继续工作时可以直接说：**“按 CLAUDE.md 继续完成剩下的工作”**。
> 和用户交流一律用**中文**。

## 1. 这个 app 是什么

“雅思跟读”：把《剑桥雅思 5》（仓库根目录 `剑桥雅思5-全书扫描版.pdf`）里的
**学术类阅读 12 篇 + 培训类阅读 Test A、B 全部文章 + 6 篇考官写作范文**做成逐句跟读的 app。
不包括：考生作文样例、听力原文（用户明确不要）。

- 网页版在 `docs/`（纯静态，GitHub Pages 也能用），Android 应用 `android/` 只是一个 WebView 外壳，
  把 `docs/` 原样打包进 APK 的 assets（`android/app/build.gradle.kts` 里 `assets.srcDir("../../docs")`）。
- 发音全部是预先生成的美式英语录音（Kokoro-82M，声音 `af_heart`），不用手机自带 TTS。

### 用户已经确定的界面要求（全部已实现，不要改回去）
1. 只有浅色模式；没有设置按钮、提示卡、说明文字、底部播放条、“全文完 · N 句”这类结尾文字（**永远不要再加**）。
2. 每个句子一张白色卡片：英文，下面是这句的中文翻译（一直显示），右下角小喇叭。
3. 点小喇叭 = 读整句英文（速度固定 0.8×，正在读的词黄色高亮）；再点一次停止。
4. 每个英文单词下面有虚线；点单词 = 只读这个单词，并弹出小气泡，气泡里的中文**只能从这一句的中文译文里原样摘取**（不是词典释义）。
5. **标题也一样**：虚线、点词气泡、中文翻译、小喇叭朗读。
6. 每篇文章结尾是“文章列表”，点哪篇就跳到哪篇（从标题开始）。
7. 每次打开 app 都显示**第一篇的第一行**（顶部）；切到后台超过 5 分钟再回来也回到第一篇顶部。

## 2. 代码结构

| 位置 | 作用 |
|---|---|
| `docs/index.html` | 阅读器（全部逻辑和样式）。数据格式说明在文件里的注释和 `tools/dev/SPEC.md` |
| `docs/articles/index.js` | 文章目录 `self.ARTICLES`，顺序 = 文章列表顺序；第一项就是打开 app 时显示的文章 |
| `docs/articles/<id>.js` | 每篇文章：`ARTICLE({ id, say, title, paras })`，每句 `[英文, 中文, 词义, 读法替换(可选)]` |
| `docs/audio/<id>/00.mp3…` | 00 = 标题，01… = 各句；`timings.js` = 每个词开始的时间（高亮用） |
| `docs/audio/words/*.mp3` + `words.js` | 全书每个不同的单词一个录音 |
| `docs/sw.js` | 网页版离线缓存；**每次改动 docs 后把 `CACHE` 版本号 +1**（现在是 `yasi-gendu-v6`） |
| `tools/audio/` | 录音生成：`dump-speech.cjs`（导出要读的文本）+ `make_audio.py`（生成 mp3，增量，未变的不重做） |
| `tools/dev/SPEC.md` | **制作一篇文章的完整规范**（英文校对、翻译、词义、读法），做新文章前必读 |
| `tools/dev/check.cjs` | 校验文章数据：`node tools/dev/check.cjs <id> --miss` |
| `tools/dev/test-app.mjs` | 整个 app 的自动测试（打开第一篇、标题朗读、文章列表、录音齐全…） |
| `tools/dev/ui-shots.mjs` | 生成给用户看的手机界面截图 |
| `tools/dev/ocr/txt/pNNN.txt` | 全书 OCR 文本（PDF 第 NNN 页）；`ocr/essay/` 是范文页重新识别的结果 |
| `tools/dev/ocrtool.py` | 从 OCR 里切出一篇文章并标出可疑词 |
| `android/` | Android 外壳；`app/build.gradle.kts` 里 versionCode 5 / versionName "2.0"（已改好，还没发布） |
| `.github/workflows/android-apk.yml` | 推送到 GitHub 后自动构建 APK（在 Actions 运行页面的 Artifacts 里下载） |

## 3. 进度（28 篇）

状态说明：✅ 完成并检查过 ｜ 🟡 已写好且 `check.cjs` 通过，但还没逐句对照扫描页复核 ｜ ⬜ 还没做
“录音”一列：🎧 已生成录音。

| id | 内容 | PDF 页 | 文字 | 录音 |
|---|---|---|---|---|
| t1p1 | Test 1 P1 Johnson’s Dictionary | 17–18 | ✅ | 🎧 |
| t1p2 | Test 1 P2 Nature or Nurture? | 21–22 | ✅ | 🎧 |
| t1p3 | Test 1 P3 The Truth about the Environment | 25–26 | ✅ | ⬜ |
| t1w1 | Test 1 Writing Task 1 范文（人口老龄化线图） | 163 | ✅ | ⬜ |
| t2p1 | Test 2 P1 Bakelite | 39–40 | ⬜ | ⬜ |
| t2p2 | Test 2 P2 What’s so funny? | 44–45 | ⬜ | ⬜ |
| t2p3 | Test 2 P3 The Birth of Scientific English | 49–50 | 🟡 | ⬜ |
| t2w2 | Test 2 Writing Task 2 范文（毕业后休学一年） | 166 | 🟡 | ⬜ |
| t3p1 | Test 3 P1 Early Childhood Education | 63–64 | ⬜ | ⬜ |
| t3p2 | Test 3 P2 Disappearing Delta | 68–69 | ⬜ | ⬜ |
| t3p3 | Test 3 P3 The Return of Artificial Intelligence | 72–73 | 🟡 | ⬜ |
| t3w1 | Test 3 Writing Task 1 范文（超市选址地图） | 167 | 🟡 | ⬜ |
| t4p1 | Test 4 P1 The Impact of Wilderness Tourism | 87–88 | ⬜ | ⬜ |
| t4p2 | Test 4 P2 Flawed Beauty: the problem with toughened glass | 90–91 | ⬜ | ⬜ |
| t4p3 | Test 4 P3 The effects of light on plant and animal species | 95–96 | 🟡 | ⬜ |
| t4w2 | Test 4 Writing Task 2 范文（先天与后天） | 170 | 🟡 | ⬜ |
| tas1a | 培训类 Test A S1 Mail Order Brochure | 102 | 🟡 | ⬜ |
| tas1b | 培训类 Test A S1 New Book Releases | 105 | 🟡 | ⬜ |
| tas2a | 培训类 Test A S2 Work & Travel USA | 106 | ⬜ | ⬜ |
| tas2b | 培训类 Test A S2 Arthur Phillip College | 108–109 | ⬜ | ⬜ |
| tas3 | 培训类 Test A S3 Lack of Sleep | 110–111 | ⬜ | ⬜ |
| taw1 | 培训类 Test A Writing Task 1 范文（给邻居的道歉信） | 171 | ⬜ | ⬜ |
| tbs1a | 培训类 Test B S1 Walk for Charity | 115–116 | ⬜ | ⬜ |
| tbs1b | 培训类 Test B S1 The Week’s Best | 118 | ⬜ | ⬜ |
| tbs2a | 培训类 Test B S2 Bingham Regional College | 120 | ⬜ | ⬜ |
| tbs2b | 培训类 Test B S2 Student Accommodation | 122 | ⬜ | ⬜ |
| tbs3 | 培训类 Test B S3 Glow-worms | 124–125 | ⬜ | ⬜ |
| tbw2 | 培训类 Test B Writing Task 2 范文（家庭垃圾） | 174 | ⬜ | ⬜ |

（PDF 页码 = PDF 阅读器里的页码，比书上印的页码大 1。）
`docs/articles/index.js` 现在只列了 t1p1、t1p2、t1p3、t1w1；其余文章做完一篇就加一行（见第 5 节）。

### 各篇的特别处理（已和用户约定或已决定）
- 段落字母（A、B…）和 “Section A” 之类的标签去掉，保留分段。题目、说明、页眉页码、地图图例不要。
- 版面上全大写的标题/引导词改成正常大小写（TTS 会把全大写单词逐个字母念）；真正的缩写（USA、EU、TAFE）保留。
- 范文没有标题，统一用 `['Writing Task 1: Model Answer', '写作任务1：范文', 'Writing=写作 Task=任务 1=1 Model=范文 Answer=范文']`（Task 2 同理）；只要范文正文，不要 “This model has been prepared…” 那句说明。
- tas1a Mail Order Brochure：去掉每件商品后面的 M/W/C 代码，也去掉 “Our key for clothing specials…” 那一行，其余（价格档标题、商品、礼券、月度优惠、邮费说明）都保留。
- tas1b New Book Releases：只要第 105 页的 9 段书籍简介；第 104 页的书名列表属于题目，不要。
- tas2a Work & Travel USA：整个广告（列表每条一行），电话 `1800 678 738` 要念成数字组（第 4 个元素：`1800`→`one eight hundred`，`678`→`six seven eight`，`738`→`seven three eight`）；页底乱码条不要。
- tas2b Arthur Phillip College：只用第 109 页那 7 个短段落（题号 21–27 的那些，按印刷顺序，不带题号）；第 108 页的网站目录不要。
- tbs1a Walk for Charity：信（Dear Friend … V Jessop, Walk Co-ordinator, P.S.）+ 第 116 页的说明（出发时间、服装、路线图、停车、巴士）；地图和图例不要。时间要念对（`10.30`→`ten thirty`）。
- tbs1b The Week’s Best：7 个节目，每个节目一段：先一行 “Wild Rose (Tuesday 19.00)”，再是介绍；24 小时制时间念法：`19.00`→`nineteen hundred`，`21.30`→`twenty-one thirty`；中文里节目名用《》。
- tbs2a Bingham Regional College：全部，包括副标题 “International Students’ Orientation Programme” 和问句小标题（“What is it?”…）各自成行。
- tbs2b Student Accommodation：引言 + A–E 五种住宿。
- taw1（信）：“Dear James,” 单独一行，然后各句，最后 “Sorry to have caused these problems,” 和 “Bill.” 各一行。
- t3w1 里的地名（Garlsdon、Hindon、Cransdon、Bransdon）以扫描页为准，前后一致。

## 4. 在你电脑上要安装的工具

| 工具 | 用途 | 下载 |
|---|---|---|
| Git | 拉取/提交代码 | https://git-scm.com |
| Node.js 18+（建议 22） | 跑校验、测试、导出朗读文本 | https://nodejs.org |
| Playwright + Chromium | 上面这些脚本用的无头浏览器 | 在仓库根目录：`npm i playwright` 然后 `npx playwright install chromium` |
| Python **3.12**（不要 3.13，spaCy 没有 3.13 的包） | 生成录音 | https://www.python.org |
| ffmpeg | 把录音编码成 mp3 | https://ffmpeg.org（Windows 可 `winget install ffmpeg`，Mac `brew install ffmpeg`） |
| Kokoro 模型 2 个文件 | 美式英语发音 | https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 下载 `kokoro-v1.0.onnx` 和 `voices-v1.0.bin`，放到 `tools/audio/`（不要提交进 git，已很大） |
| Python 包 | 生成录音 | 见下面命令 |
| poppler（pdftoppm）+ ImageMagick（可选） | 把 PDF 页转成图片来校对英文 | Windows：poppler-windows + imagemagick.org；Mac：`brew install poppler imagemagick` |
| tesseract（可选） | 只有要重新 OCR 才需要；OCR 文本已经在 `tools/dev/ocr/` | — |
| Android Studio（可选） | 本地打 APK；也可以不装，推送到 GitHub 后由 Actions 自动打包 | https://developer.android.com/studio |
| Claude Code（可选） | 让 Claude 在你电脑上接着做 | https://claude.com/claude-code |

Python 环境（只需做一次）：

    python3.12 -m venv .venv
    # Windows: .venv\Scripts\activate    Mac/Linux: source .venv/bin/activate
    pip install kokoro-onnx misaki num2words "spacy>=3.8,<3.9" onnx
    pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
    # misaki 的生僻词回退需要 espeak-ng：pip install espeakng-loader phonemizer-fork
    # （若 misaki 提示缺 espeak，再装系统的 espeak-ng：https://github.com/espeak-ng/espeak-ng/releases）

`ocrtool.py` 用到 Linux 的英文词典 `/usr/share/dict/american-english-huge`、`british-english-huge`（Ubuntu 包 `wamerican-huge wbritish-huge`）。
Windows 上没有的话：可以在 WSL 里跑，或直接读 `tools/dev/ocr/txt/pNNN.txt` 原文手工校对（这个脚本只是辅助）。

把 PDF 页转成图片（校对英文时对照看；放到 `tools/dev/ocr/img/`，不提交）：

    pdftoppm -r 200 -png -f 39 -l 40 "剑桥雅思5-全书扫描版.pdf" tools/dev/ocr/img/p
    # 生成 p-039.png 这类文件名，改名成 p039.png 或直接看都行

## 5. 剩下要做的事（按顺序）

1. **做完 ⬜ 的 16 篇**：每篇严格按 `tools/dev/SPEC.md`，以 `docs/articles/t1p1.js`、`t1p2.js`、`t1p3.js` 为样板；
   对照扫描页逐词校对英文；每句完整中文翻译；词义 `word=中文` 必须原样出现在这句译文里；
   `node tools/dev/check.cjs <id> --miss` 不能有 `GLOSS` 和 `WARN` 行。
2. **复核 🟡 的 8 篇**：对照扫描页确认英文完整无误（特别是首尾句、段落数）、翻译通顺。
3. **把每篇加进 `docs/articles/index.js`**（按下面顺序；`title` 必须和文章里的英文标题完全一致，测试会检查）：

        { id: 't1p1',  group: 'Test 1', label: 'P1', title: 'Johnson’s Dictionary', zh: '约翰逊的词典' },
        { id: 't1p2',  group: 'Test 1', label: 'P2', title: 'Nature or Nurture?', zh: '先天还是后天？' },
        { id: 't1p3',  group: 'Test 1', label: 'P3', title: 'The Truth about the Environment', zh: '关于环境的真相' },
        { id: 't1w1',  group: 'Test 1', label: 'W1', title: 'Writing Task 1: Model Answer', zh: '范文 · 日本、瑞典和美国人口老龄化（线图）' },
        { id: 't2p1',  group: 'Test 2', label: 'P1', title: '（按文章实际标题）', zh: '…' },
        … t2p2 P2、t2p3 P3、t2w2 W2；Test 3：t3p1 P1、t3p2 P2、t3p3 P3、t3w1 W1；Test 4：t4p1、t4p2、t4p3、t4w2 W2；
        group 'Test A（培训类）'：tas1a S1、tas1b S1、tas2a S2、tas2b S2、tas3 S3、taw1 W1；
        group 'Test B（培训类）'：tbs1a S1、tbs1b S1、tbs2a S2、tbs2b S2、tbs3 S3、tbw2 W2。
   范文的 zh 写成“范文 · 主题”，例如 `范文 · 毕业后休学一年`。

4. **检查朗读文本**：`node tools/audio/dump-speech.cjs > speech.json`，看里面带数字、符号、全大写、斜杠的词会不会念错
   （可用 `python tools/dev/g2p_test.py '19.00' 'kitchen/dining'` 看音标）；念错的在该文章的 `say` 里加替换（规则见 SPEC）。
   `&、km、kms、cm、mm、kg、e.g.、i.e.、A-Z、Dr` 已在 `docs/index.html` 的 `SAY_ALL` 里统一处理。
5. **生成录音**（增量，已有的不会重做；全书大约要 1 小时 CPU）：

        node tools/audio/dump-speech.cjs > speech.json
        python tools/audio/make_audio.py speech.json docs/audio --model tools/audio/kokoro-v1.0.onnx --voices tools/audio/voices-v1.0.bin

   `make_audio.py` 会删除不再用到的单词录音，所以**一定要在 index.js 列全文章之后再跑最后一次**。
6. **把 `docs/sw.js` 里的 `CACHE` 版本号 +1。**
7. **测试**：`node tools/dev/test-app.mjs .`（全部 ✓ 才算完成；还没生成录音时可加 `--no-audio`）。
8. **截图给自己检查**：`node tools/dev/ui-shots.mjs . shots`（生成 `shots/v20-ui-1.png`、`v20-ui-2.png`）。
9. **打包 APK**（任选其一）：
   - 提交并推送到 GitHub，Actions 里的 “android-apk” 自动构建，在运行页面 Artifacts 下载 APK；
   - 或 Android Studio 打开 `android/` 文件夹 → Build → Build APK(s)；
   - 或命令行：`cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`。
   版本号已经是 versionCode 5 / versionName 2.0。APK 用仓库里的 `android/app/debug.keystore` 签名，可以直接覆盖安装旧版本。

## 6. 其他注意事项
- 仓库现在是**公开的**并开了 GitHub Pages，里面有剑桥雅思的扫描 PDF 和课文。建议在 GitHub 仓库 Settings 里改成 Private（版权原因）。
- 开发分支：`claude/affectionate-bohr-ae4vw8`，对应的草稿 PR：https://github.com/aodi3622-pixel/claude/pull/2 。
- 预计最终 APK 约 50–60 MB（录音 40 kbps 单声道）。
- 不要在 `docs/index.html` 里加“全文完”之类结尾文字；不要恢复深色模式、设置、底部播放条。
- 译文、词义都用简体中文，中文标点；英文用弯引号 ’ ‘ ’ “ ” 和带空格的 – 破折号（细节见 SPEC）。
