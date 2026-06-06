"""Generate valid, silent placeholder MP3s for every audio path in topics.json.

These are real, loadable MPEG-1 Layer III files (128 kbps, 44.1 kHz) containing
only silence. They exist so the player, Service Worker caching and offline flow
are genuinely exercised — they are NOT narration and must be replaced by clips
recorded by a native Farsi/Dari speaker before release.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# One MPEG-1 Layer III frame: header (0xFF 0xFB 0x90 0x00) + zeroed payload.
# Frame size = 144 * 128000 / 44100 = 417 bytes. ~38 frames ≈ 1 second.
FRAME = bytes([0xFF, 0xFB, 0x90, 0x00]) + bytes(413)
SECONDS = 1
SILENT_MP3 = FRAME * (38 * SECONDS)


def main():
    with open(os.path.join(ROOT, "data", "topics.json"), encoding="utf-8") as f:
        data = json.load(f)

    paths = set()
    for topic in data["topics"]:
        if topic.get("audio_full"):
            paths.add(topic["audio_full"])
        for step in topic.get("steps", []):
            if step.get("audio"):
                paths.add(step["audio"])

    for rel in sorted(paths):
        dest = os.path.join(ROOT, *rel.split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(SILENT_MP3)
        print(f"wrote {rel} ({len(SILENT_MP3)} bytes)")

    print(f"\n{len(paths)} silent placeholder MP3s generated.")


if __name__ == "__main__":
    main()
