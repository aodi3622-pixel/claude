"""OCR helper: cut a passage out of the OCR'd pages, re-join paragraphs, flag non-dictionary words.

usage: python3 ocrtool.py FIRST_PAGE LAST_PAGE 'start marker' 'end marker'
       (markers are substrings; the passage runs from the start marker line up to, not including, the end marker line)
"""
import re
import sys
from pathlib import Path

TXT = Path(__file__).parent / "ocr" / "txt"
WORDS = set()
for f in ("/usr/share/dict/american-english-huge", "/usr/share/dict/british-english-huge"):
    WORDS |= {w.strip().lower() for w in open(f, encoding="utf-8", errors="ignore")}


def known(w):
    w = w.lower().strip("’'")
    if not w or not re.search(r"[a-z]", w):
        return True
    if w in WORDS:
        return True
    for suf in ("’s", "'s", "s’", "s'"):
        if w.endswith(suf) and w[: -len(suf)] in WORDS:
            return True
    if "-" in w:
        return all(known(p) for p in w.split("-") if p)
    return False


def passage(first, last, start, end):
    lines = []
    for p in range(first, last + 1):
        lines += (TXT / f"p{p:03d}.txt").read_text(encoding="utf-8").splitlines() + [""]
    i0 = next(i for i, l in enumerate(lines) if start in l)
    i1 = next((i for i, l in enumerate(lines) if i > i0 and end and end in l), len(lines))
    text = "\n".join(lines[i0:i1])
    # 行尾连字符：去掉后是词典里的词就合并，否则保留连字符
    def join(m):
        a, b = m.group(1), m.group(2)
        return a + b if known(a + b) and not known(a) else a + "-" + b
    text = re.sub(r"(\w+)-\n(\w+)", join, text)
    paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    return [p for p in paras if p]


if __name__ == "__main__":
    first, last, start = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    end = sys.argv[4] if len(sys.argv) > 4 else ""
    for p in passage(first, last, start, end):
        flagged = re.sub(r"[A-Za-z’'-]+", lambda m: m.group(0) if known(m.group(0)) else f"[[{m.group(0)}]]", p)
        print(flagged)
        print()
