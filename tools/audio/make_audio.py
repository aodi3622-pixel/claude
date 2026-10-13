"""生成 docs/audio/ 里的全部录音：
  audio/<文章>/00.mp3 标题、01.mp3… 每句，加上 timings.js（每个词在录音里开始的时间）；
  audio/words/*.mp3 全书每个不同的单词一个，加上 audio/words.js（单词 -> 文件）。

发音用 Kokoro-82M（Apache-2.0）的美式英语女声 af_heart，音标由 misaki 转写。
模型里每个音素的帧数（/encoder/Clip_output_0）被加成额外输出，算出每个词在录音里
开始的时间，网页用它做逐词高亮。

文字没变、文件也在的句子和单词直接沿用，不重新生成（生成结果是确定的，重新生成也一样）。

用法：
  node tools/audio/dump-speech.cjs > speech.json
  python tools/audio/make_audio.py speech.json docs/audio \
      --model kokoro-v1.0.onnx --voices voices-v1.0.bin
模型文件：https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
依赖：pip install kokoro-onnx misaki num2words spacy onnx 和 spaCy 的 en_core_web_sm；需要 ffmpeg。
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from kokoro_onnx.config import MAX_PHONEME_LENGTH, SAMPLE_RATE
from misaki import en, espeak

DURATIONS = "/encoder/Clip_output_0"   # 每个音素持续的帧数（Kokoro 的 pred_dur）
VOICE = "af_heart"
TARGET_RMS = 0.07                      # 各句音量统一到差不多响
BITRATE = "40k"                        # 单声道 24kHz 的人声，40 kbps 足够清楚


class TooLong(ValueError):
    pass


def load_session(model_path):
    m = onnx.load(model_path)
    if DURATIONS not in [o.name for o in m.graph.output]:
        m.graph.output.append(onnx.helper.make_tensor_value_info(DURATIONS, onnx.TensorProto.FLOAT, None))
    return ort.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])


def vocab():
    import kokoro_onnx
    return json.loads((Path(kokoro_onnx.__file__).parent / "config.json").read_text())["vocab"]


class Voice:
    def __init__(self, model, voices):
        self.sess, self.vocab = load_session(model), vocab()
        self.style_pack = np.load(voices)[VOICE]
        self.g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))

    def synthesize(self, text):
        """返回 (24kHz 单声道音频, [[词在 text 里的字符位置, 开始秒数], …])。"""
        ps, tokens = self.g2p(text)
        ids, spans, cursor = [], [], 0
        for tk in tokens:
            first = len(ids)
            ids += [self.vocab[c] for c in (tk.phonemes or "") + tk.whitespace if c in self.vocab]
            pos = text.find(tk.text, cursor)
            if pos >= 0:
                cursor = pos + len(tk.text)
            if tk.phonemes and any(ch.isalnum() for ch in tk.text) and pos >= 0 and len(ids) > first:
                spans.append((pos, first))
        if len(ids) > MAX_PHONEME_LENGTH:
            raise TooLong(f"too many phonemes ({len(ids)}) in: {text}")

        style = self.style_pack[len(ids) - 1]
        audio, dur = self.sess.run(None, {
            "tokens": np.array([[0, *ids, 0]], dtype=np.int64),
            "style": style.astype(np.float32),
            "speed": np.array([1.0], dtype=np.float32),
        })
        audio, dur = np.asarray(audio).ravel(), np.asarray(dur).ravel()
        assert len(dur) == len(ids) + 2, (len(dur), len(ids))
        samples_per_frame = len(audio) / dur.sum()
        start = np.concatenate([[0], np.cumsum(dur)]) * samples_per_frame / SAMPLE_RATE
        marks = [[pos, round(float(start[first + 1]), 3)] for pos, first in spans]   # +1：开头有一个填充符
        return audio, marks

    def synthesize_long(self, text):
        """太长的句子在最靠近中间的逗号/分号处切开，分段合成再拼起来。"""
        try:
            return self.synthesize(text)
        except TooLong:
            cuts = [m.end() for m in re.finditer(r"[,;:–—]\s", text)]
            if not cuts:
                raise
            c = min(cuts, key=lambda x: abs(x - len(text) / 2))
            a_audio, a_marks = self.synthesize_long(text[:c].rstrip())
            b_audio, b_marks = self.synthesize_long(text[c:])
            gap = np.zeros(SAMPLE_RATE * 12 // 100, dtype=a_audio.dtype)
            t0 = (len(a_audio) + len(gap)) / SAMPLE_RATE
            return (np.concatenate([a_audio, gap, b_audio]),
                    a_marks + [[p + c, round(t + t0, 3)] for p, t in b_marks])


def trim(audio):
    """单词录音去掉首尾静音（点了马上出声），两头留一点余量并淡入淡出。"""
    frame = SAMPLE_RATE // 100
    n = len(audio) // frame
    env = np.sqrt(np.mean(audio[:n * frame].reshape(n, frame) ** 2, axis=1))
    loud = np.where(env > env.max() * 0.02)[0]
    if not len(loud):
        return audio
    a = max(0, loud[0] * frame - SAMPLE_RATE * 3 // 100)
    b = min(len(audio), (loud[-1] + 1) * frame + SAMPLE_RATE * 8 // 100)
    out = audio[a:b].copy()
    fade = SAMPLE_RATE // 200
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def slug(key, taken):
    base = re.sub(r"[^a-z0-9]+", "_", key).strip("_") or "w"
    name, n = base, 1
    while name + ".mp3" in taken:
        n += 1
        name = f"{base}_{n}"
    taken.add(name + ".mp3")
    return name + ".mp3"


def encode_mp3(audio, path):
    rms = float(np.sqrt(np.mean(audio ** 2))) or 1.0
    audio = audio * min(TARGET_RMS / rms, 0.97 / float(np.abs(audio).max()))
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:",
         "-c:a", "libmp3lame", "-b:a", BITRATE, str(path)],
        input=audio.astype(np.float32).tobytes(), check=True)


def read_js(path, pattern):
    try:
        m = re.search(pattern, path.read_text(encoding="utf-8"), re.S)
        return json.loads(m.group(1)) if m else None
    except FileNotFoundError:
        return None


HEADER = f"// 由 tools/audio/make_audio.py 生成（Kokoro-82M · {VOICE} 美式英语），不要手改。\n"


def make_article(voice, art, out):
    d = out / art["id"]
    d.mkdir(parents=True, exist_ok=True)
    old = read_js(d / "timings.js", r"TIMINGS\(\"[^\"]*\",\s*(\[.*\])\);") or []
    entries, made = [], 0
    for i, text in enumerate(art["units"]):
        name = f"{i:02d}.mp3"
        prev = old[i] if i < len(old) else None
        if prev and prev["text"] == text and prev["file"] == name and (d / name).exists():
            entries.append(prev)
            continue
        audio, marks = voice.synthesize_long(text)
        encode_mp3(audio, d / name)
        entries.append({"file": name, "dur": round(len(audio) / SAMPLE_RATE, 2), "text": text, "marks": marks})
        made += 1
    for f in d.glob("*.mp3"):                       # 句子删掉了，多出来的录音也删掉
        if f.name not in {e["file"] for e in entries}:
            f.unlink()
    body = ",\n".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in entries)
    (d / "timings.js").write_text(
        HEADER + "// [标题, 第 1 句, …]；marks：[词在朗读文本里的字符位置, 在录音里开始的秒数]\n"
        f"TIMINGS({json.dumps(art['id'])}, [\n{body}\n]);\n", encoding="utf-8")
    print(f"{art['id']}: {len(entries)} units, {made} generated, {sum(e['dur'] for e in entries) / 60:.1f} min")


def make_words(voice, words, out):
    d = out / "words"
    d.mkdir(parents=True, exist_ok=True)
    old = read_js(out / "words.js", r"self\.WORD_AUDIO = (\{.*\});") or {}
    files, taken, made = {}, set(old.values()), 0
    for key in sorted(words):
        if key in old and (d / old[key]).exists():
            files[key] = old[key]
            continue
        files[key] = old.get(key) or slug(key, taken)
        audio, _ = voice.synthesize_long(words[key] + ".")   # 单独读一遍，句号让语调自然收尾
        encode_mp3(trim(audio), d / files[key])
        made += 1
    for f in d.glob("*.mp3"):
        if f.name not in set(files.values()):
            f.unlink()
    (out / "words.js").write_text(
        HEADER + "// 单词（小写）-> words/ 里的读音文件\n"
        f"self.WORD_AUDIO = {json.dumps(files, ensure_ascii=False, indent=0)};\n", encoding="utf-8")
    print(f"words: {len(files)}, {made} generated")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("speech_json")
    ap.add_argument("out_dir")
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    a = ap.parse_args()

    data = json.loads(Path(a.speech_json).read_text())
    out = Path(a.out_dir)
    voice = Voice(a.model, a.voices)
    for art in data["articles"]:
        make_article(voice, art, out)
    make_words(voice, data["words"], out)


if __name__ == "__main__":
    main()
