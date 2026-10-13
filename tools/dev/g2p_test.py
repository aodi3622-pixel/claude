import sys
from misaki import en, espeak
g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
for s in sys.argv[1:]:
    ps, toks = g2p(s)
    print(f"{s!r:40} -> {ps}")
