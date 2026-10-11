# Recordings

`docs/audio/` holds one American-English recording per sentence (`s01.mp3` … `s32.mp3`) plus `timings.js`. `timings.js` records when each word starts, which drives the word highlighting. The page and the Android app play these files directly; they don't use the phone's text-to-speech.

The voice is `af_heart` from [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache-2.0), and [misaki](https://github.com/hexgrad/misaki) does the phonemes.

## Regenerate after changing the text

The recordings are made from the page's own speech text (`SENTS[i].speech`). Regenerate them whenever `PARAS` or `SAY` in `docs/index.html` changes.

    npm i playwright
    node tools/audio/dump-speech.cjs > speech.json

    # Python 3.12 + ffmpeg
    pip install kokoro-onnx misaki num2words "spacy>=3.8,<3.9" onnx \
      https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
    # kokoro-v1.0.onnx and voices-v1.0.bin from
    # https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
    python tools/audio/make_audio.py speech.json docs/audio --model kokoro-v1.0.onnx --voices voices-v1.0.bin

Then bump `CACHE` in `docs/sw.js` so installed copies of the web version pick up the new files.
