# Recordings

`docs/audio/` holds the American-English recordings:

- `<article>/00.mp3` is the article's title and `01.mp3`, `02.mp3` … are its sentences, played by the speaker buttons;
- `<article>/timings.js` records when each word starts in each of those recordings (for the word highlighting);
- `words/*.mp3` has one recording per distinct word in the whole book, played when a word is tapped, and `words.js` maps each word to its file.

The page and the Android app play these files directly; they don't use the phone's text-to-speech.

The voice is `af_heart` from [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache-2.0), and [misaki](https://github.com/hexgrad/misaki) does the phonemes.

## Regenerate after changing the text

The recordings are made from the page's own text: each title's and sentence's spoken form (`units[i].speech`, after the `say` replacements) and each word's `wordSay`. Regenerate them whenever an article in `docs/articles/` changes or one is added to `docs/articles/index.js`. Unchanged sentences and words are kept as they are; the process is deterministic anyway.

    npm i playwright
    node tools/audio/dump-speech.cjs > speech.json

    # Python 3.12 + ffmpeg
    pip install kokoro-onnx misaki num2words "spacy>=3.8,<3.9" onnx \
      https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
    # kokoro-v1.0.onnx and voices-v1.0.bin from
    # https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
    python tools/audio/make_audio.py speech.json docs/audio --model kokoro-v1.0.onnx --voices voices-v1.0.bin

Then bump `CACHE` in `docs/sw.js` so installed copies of the web version pick up the new files.
