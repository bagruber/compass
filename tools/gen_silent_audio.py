"""Generate placeholder MP3s for every audio path the content implies.

Paths follow the convention audio/<lang>/<topic>/{full,step-N}.mp3, derived from
data/structure.json plus each data/lang/<code>.json — nothing stores them.

These are real, loadable MPEG-1 Layer III files containing only silence. They
exist so the player, Service Worker caching and offline flow are genuinely
exercised. They are NOT narration.

Human recordings are protected. The script records what it generated in
audio/generated.json along with a hash of the source text. A file it did not
create is treated as a human recording and never overwritten — but if the text
behind it has since changed, the script says so, because a recording that no
longer matches its text is worse than a missing one.

To swap silence for real TTS, replace synthesize() with a call to a provider.
Nothing else changes.
"""
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "audio", "generated.json")

# One MPEG-1 Layer III frame: header (0xFF 0xFB 0x90 0x00) + zeroed payload.
# Frame size = 144 * 128000 / 44100 = 417 bytes. ~38 frames per second.
FRAME = bytes([0xFF, 0xFB, 0x90, 0x00]) + bytes(413)


def synthesize(text, seconds=1):
    """Return MP3 bytes for `text`. Currently silence of a fixed length."""
    return FRAME * (38 * seconds)


def load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


def expected_clips(structure):
    """Yield (relative_path, source_text) for every clip the content implies."""
    for language in structure["languages"]:
        code = language["code"]
        pack = load("data", "lang", f"{code}.json")
        for topic in structure["topics"]:
            text = pack.get("topics", {}).get(topic["id"])
            if not text:
                continue  # topic not translated into this language yet

            steps = text.get("steps", {})
            joined = " ".join(steps.get(str(s["id"]), s["de"]) for s in topic["steps"])
            yield f"audio/{code}/{topic['id']}/full.mp3", f"{text['name']}. {joined}"

            for step in topic["steps"]:
                body = steps.get(str(step["id"]), step["de"])
                yield f"audio/{code}/{topic['id']}/step-{step['id']}.mp3", body


def main():
    structure = load("data", "structure.json")
    manifest = load("audio", "generated.json") if os.path.exists(MANIFEST) else {}

    written, kept, stale = 0, 0, []

    for rel, text in expected_clips(structure):
        dest = os.path.join(ROOT, *rel.split("/"))
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        record = manifest.get(rel)
        exists = os.path.exists(dest)

        # A file we never generated is somebody's recording. Leave it alone.
        if exists and record is None:
            manifest[rel] = {"source": "human", "hash": digest}
            kept += 1
            continue

        if exists and record.get("source") == "human":
            if record["hash"] != digest:
                stale.append(rel)
            kept += 1
            continue

        if exists and record.get("hash") == digest:
            continue  # ours, and still current

        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(synthesize(text))
        manifest[rel] = {"source": "tts", "hash": digest}
        written += 1
        print(f"wrote {rel}")

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"\n{written} generated, {kept} human recordings left untouched.")
    if stale:
        print("\nText changed since these were recorded — they need re-recording:")
        for rel in stale:
            print(f"  {rel}")


if __name__ == "__main__":
    main()
