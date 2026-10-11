"""生成 docs/audio/：每句一个美式英语录音 sNN.mp3，加上逐词时间 timings.js。

发音用 Kokoro-82M（Apache-2.0）的美式英语女声 af_heart，音标由 misaki 转写。
模型里每个音素的帧数（/encoder/Clip_output_0）被加成额外输出，算出每个词在录音里
开始的时间，网页用它做逐词高亮。

用法：
  node tools/audio/dump-speech.cjs > speech.json
  python tools/audio/make_audio.py speech.json docs/audio \
      --model kokoro-v1.0.onnx --voices voices-v1.0.bin
模型文件：https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
依赖：pip install kokoro-onnx misaki num2words spacy onnx 和 spaCy 的 en_core_web_sm；需要 ffmpeg。
"""
import argparse
import json
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


def load_session(model_path):
    m = onnx.load(model_path)
    if DURATIONS not in [o.name for o in m.graph.output]:
        m.graph.output.append(onnx.helper.make_tensor_value_info(DURATIONS, onnx.TensorProto.FLOAT, None))
    return ort.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])


def vocab():
    import kokoro_onnx
    return json.loads((Path(kokoro_onnx.__file__).parent / "config.json").read_text())["vocab"]


def synthesize(text, sess, g2p, vocab, style_pack):
    """返回 (24kHz 单声道音频, [[词在 text 里的字符位置, 开始秒数], …])。"""
    ps, tokens = g2p(text)
    ids, spans, cursor = [], [], 0
    for tk in tokens:
        first = len(ids)
        ids += [vocab[c] for c in (tk.phonemes or "") + tk.whitespace if c in vocab]
        pos = text.find(tk.text, cursor)
        if pos >= 0:
            cursor = pos + len(tk.text)
        if tk.phonemes and any(ch.isalnum() for ch in tk.text) and pos >= 0 and len(ids) > first:
            spans.append((pos, first))
    if len(ids) > MAX_PHONEME_LENGTH:
        raise ValueError(f"too many phonemes ({len(ids)}) in: {text}")

    style = style_pack[len(ids) - 1]
    audio, dur = sess.run(None, {
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


def encode_mp3(audio, path):
    rms = float(np.sqrt(np.mean(audio ** 2))) or 1.0
    audio = audio * min(TARGET_RMS / rms, 0.97 / float(np.abs(audio).max()))
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:",
         "-c:a", "libmp3lame", "-b:a", "64k", str(path)],
        input=audio.astype(np.float32).tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("speech_json")
    ap.add_argument("out_dir")
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    a = ap.parse_args()

    texts = json.loads(Path(a.speech_json).read_text())
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sess, voc = load_session(a.model), vocab()
    style_pack = np.load(a.voices)[VOICE]
    g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))

    entries = []
    for i, text in enumerate(texts):
        audio, marks = synthesize(text, sess, g2p, voc, style_pack)
        name = f"s{i + 1:02d}.mp3"
        encode_mp3(audio, out / name)
        entries.append({"file": name, "dur": round(len(audio) / SAMPLE_RATE, 2), "text": text, "marks": marks})
        print(f"{name}  {len(audio) / SAMPLE_RATE:5.1f}s  {len(marks)} words")

    body = ",\n".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in entries)
    (out / "timings.js").write_text(
        f"// 由 tools/audio/make_audio.py 生成（Kokoro-82M · {VOICE} 美式英语），不要手改。\n"
        f"// marks：[词在朗读文本里的字符位置, 在录音里开始的秒数]\n"
        f"self.SENT_AUDIO = [\n{body}\n];\n", encoding="utf-8")


if __name__ == "__main__":
    main()
