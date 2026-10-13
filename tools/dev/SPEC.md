# How to make one article for the 跟读 (shadowing) app

The app (`docs/index.html`) shows one article at a time from Cambridge IELTS 5:
a title, then every sentence in its own card with the Chinese translation under it. Every English
word has a dotted underline; tapping a word plays that word and, if the word has a gloss, shows a
small bubble with the word's Chinese meaning. **The bubble text must be copied verbatim from that
sentence's own Chinese translation** – never a dictionary meaning that is not in the translation.

Your job: write `docs/articles/<id>.js` for each article you are given, and nothing else.

* Do NOT edit any other file in the repo (not `articles/index.js`, not `index.html`), do not run git,
  do not generate audio. Put any scratch files under
  `tools/dev/work/ (not committed)`.
* Two finished examples to imitate exactly (format, translation style, gloss density):
  `docs/articles/t1p1.js` and `docs/articles/t1p2.js`. Read both first.

## Sources (tools/dev)

* Page scans of the book: `tools/dev/ocr/img/pNNN.png` (not committed – make them from the PDF, see CLAUDE.md). NNN = PDF page number (3 digits).
* OCR text per page: `tools/dev/ocr/txt/pNNN.txt` (tesseract; has errors).
  For the six writing model answers use `tools/dev/ocr/essay/pNNN.txt` (re-OCR'd, the answer box is grey).
* Helper that cuts a passage out of the OCR, re-joins lines into paragraphs and marks words that are
  not in the dictionary with `[[...]]`:
  `cd tools/dev && python3 ocrtool.py FIRST LAST 'start marker' 'end marker'`
  (markers are substrings of lines; the passage runs from the start-marker line up to, not including,
  the end-marker line, e.g. `'Questions 14'`). Line-end hyphens are joined by a dictionary heuristic –
  check each against the scan.
* **Proofread every word against the scan.** OCR errors seen so far: `tbe`→the, rn↔m, `|`→I,
  `S$`→5, lost/straight apostrophes, wrong quote direction, `ihe`, `0`↔o, dropped commas/full stops,
  real hyphenated compounds split or joined wrongly at line ends. Look at the scan at a readable size,
  e.g. top and bottom halves:
  `convert ocr/img/p025.png -crop 2000x1450+0+0 -resize 1500x work/p025-top.png`
  `convert ocr/img/p025.png -crop 2000x1450+0+1350 -resize 1500x work/p025-bot.png`
  then Read the PNGs. Make sure you have the whole passage (check that it does not continue on the
  next page) and nothing from the questions.

## File format

```js
// 剑桥雅思 5 · Test 2 · Reading Passage 1          ← header comment (see your assignment)
ARTICLE({
  id: 't2p1',
  say: { 'Baekeland': 'Bakeland' },                   // pronunciation fixes, see below ({} if none)
  title: ['English title', '中文标题', 'gloss pairs'],
  paras: [                                            // one array per paragraph of the original
    [                                                 // one row per sentence
      ['English sentence.', '中文译文。', 'word=中文 word=中文 …'],
      ['Another sentence.', '……', '……', { '18': 'eighteenth' }],   // optional 4th: per-sentence say
    ],
  ],
});
```

### English text
* Exactly the book's wording, spelling (British) and capitalisation. Fix OCR errors only.
* Typographic punctuation, like the examples: apostrophe `’`, single quotes `‘…’`, double quotes `“…”`,
  dash = spaced en dash ` – ` (as the book prints it), ellipsis `…`. No straight `'` or `"`.
* Italic words (book/newspaper titles, foreign words printed in italics) are wrapped in underscores:
  `_A Table Alphabeticall_` (underscore before the first word and after the last word).
* Drop paragraph letters (A, B, C…) and labels like “Section A”; drop question numbers, page furniture,
  instructions, map legends. Keep real headings and list items as their own rows (a heading is its own
  one-row paragraph; a bulleted list is one paragraph, one row per bullet, without the bullet sign).
* Words printed in CAPITALS only for layout (headings such as `WORK & TRAVEL USA`, lead-ins such as
  `CLOTHING should be…`) are written in normal case (`Work & Travel USA`, `Clothing should be…`) –
  the TTS spells out all-capital words letter by letter. Real acronyms stay (USA, EU, TAFE).
* Title: the passage's own title in normal title case (`The Truth about the Environment`).
  For a writing model answer (it has no title) use exactly
  `['Writing Task 1: Model Answer', '写作任务1：范文', 'Writing=写作 Task=任务 1=1 Model=范文 Answer=范文']`
  (Task 2 likewise with 2), and in your report give a short Chinese topic line for the article list,
  e.g. `范文 · 日本、瑞典和美国人口老龄化（线图）`.
* One row per sentence: split after `.` `?` `!` (with any closing quote/bracket). Never split
  abbreviations (Dr, Mr, e.g., etc.). Keep a quoted multi-sentence speech split per sentence as the
  examples do (t1p2 sentence “His final argument was, ‘You have no other choice. You must go on.’” is one
  row because it is short – use judgement, but prefer one sentence per row).

### Chinese translation
* Complete, faithful, natural 简体中文 for that one sentence (nothing from neighbouring sentences).
* Chinese punctuation: ，。；：？！、“”‘’（）——《》. Numbers stay as Arabic digits (1775年, 40名, 25%).
* Names: standard Chinese forms where they exist (约翰逊, 耶鲁大学, 悉尼); otherwise a normal
  transliteration with `·` between given and family name (斯坦利·米尔格拉姆). Titles in 《》.

### Gloss (the third element) – this is what the word bubbles show
* Space-separated `word=中文` pairs, **in the order the words occur in the sentence**.
* `word` is the token as printed, minus leading/trailing punctuation: keep internal hyphens and
  apostrophes (`teacher-subject`, `Milgram’s`, `and/or`, `1,000`, `450-volt`, `25%`, `$10`, `£195`).
  A plural possessive `pupils’` is written `pupils`. Matching is case-insensitive and `’` = `'`.
* `中文` must be a **contiguous substring of this row's translation, copied exactly**, and must be the
  part of the translation that renders this word. No spaces and no `=` inside it.
* Gloss every content word (nouns, verbs, adjectives, adverbs, numbers, names) whose meaning appears
  in the translation; skip function words (the, a, of, to, was, that…) unless the translation has a
  clear counterpart (not=不, but=但是, because=因为, only=只有). Idioms/phrases: give each word of the
  phrase the shared span (`walks=各行各业 life=各行各业`, `Put=换句话说 another=换句话说 way=换句话说`).
* A word that occurs twice needs two pairs (each in its place in the order).
* If a content word has no counterpart because the translation was too free, prefer rewording the
  translation (still natural) so the word is covered. Target ≥ 55 % of all word tokens glossed
  (the examples have 54–65 %); nearly every content word should be covered.

### Pronunciation (`say` and the optional 4th element)
Audio is generated later by a TTS (Kokoro, American voice) from the English text. Only the spoken
text changes, never the display. `say` maps a token (same form as gloss words) to what should be
spoken, for the whole article (the single-word audio uses it too); the 4th element of a row does the
same for that row only (use it when the same token must be read differently in different rows).
The TTS already reads these correctly – do NOT add entries for them: years (1940), `1,000`,
`$1950`, `£21,000`, `£58.50`, `$19.95`, `25%`, `2.5%`, `24th`, `1990s`, `Dr`, `Mr`, `etc.`, `per cent`,
`T-shirts`, `4-wheel-drive`, ordinary words and common names.
Already handled for the whole book (no entry needed): `&`, `km`, `kms`, `cm`, `mm`, `kg`, `e.g.`, `i.e.`, `A-Z`.
It gets these WRONG – add an entry (examples of good values):
* `CO2` → `C O two`, `27°C` → `27 degrees Celsius`
* times: `10.30` → `ten thirty`, `19.00` → `nineteen hundred`, `3am` → `three A M`, `7am` → `seven A M`
* phone numbers → digits spoken in groups (`'1800 678 738'` spans tokens, so map each token: `1800` → `one eight hundred`, `678` → `six seven eight`, `738` → `seven three eight`, in that row's 4th element)
* words joined by `/` (`kitchen/dining` → `kitchen and dining`), Roman numerals (`III` → `the Third`),
  old/foreign spellings, unusual names whose spelling misleads (respell phonetically: `Gough` → `Goff`).

## Check

```
node tools/dev/check.cjs <id> --miss
```
must print no `GLOSS` and no `WARN` lines (`GLOSS` = a pair whose word was not found in order or whose
中文 is not in the translation). `miss` lists the tokens of each row without a gloss: read it and
cover the content words. (A `CONSOLE Failed to load resource` line is expected – there is no audio yet.)

Finally re-read the whole file once against the scans (English) and for translation quality.

## Report back (short)
For each id: English title, Chinese title, number of rows, gloss coverage %, what you left out of the
page and why, any reading of the scan you are unsure about, and the `say`/4th-element entries you added.
