# /// script
# requires-python = ">=3.11"
# dependencies = ["boto3>=1.35"]
# ///
"""Uploads rendered episodes and the episode manifest to the audio bucket.

    uv run scripts/audio/publish.py [content/audio/<track>/<module>]   # default: every script

For each script under the path it needs a render in runtimes/audio/out made
from exactly this script (the sidecar's `script` hash) of exactly this lesson
(`source`), so stale audio is never published. Credentials come from
AUDIO_S3_* variables, or from `railway bucket credentials --bucket audio`.
The manifest lists every published episode; the API reads it.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "content" / "audio"
WALK = ROOT / "content" / "walkthroughs"
TRACKS = ROOT / "content" / "tracks"
PROBLEM_WALK = ROOT / "content" / "problem-walkthroughs"
SPOKEN = ROOT / "content" / "spoken-quizzes"
OUT = ROOT / "runtimes" / "audio" / "out"


def credentials():
    env = {k: os.environ.get(f"AUDIO_S3_{k}") for k in ("ENDPOINT", "BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY")}
    if all(env.values()):
        return env["ENDPOINT"], env["BUCKET"], env["ACCESS_KEY_ID"], env["SECRET_ACCESS_KEY"]
    raw = subprocess.run(["railway", "bucket", "credentials", "--bucket", "audio", "--json"], check=True,
                         capture_output=True, text=True, cwd=ROOT).stdout
    c = json.loads(raw)
    return c["endpoint"], c["bucketName"], c["accessKeyId"], c["secretAccessKey"]


def front(path: Path):
    m = re.match(r"---\n(.*?)\n---\n", path.read_text(), re.S)
    meta = dict(re.findall(r"^(\w+):\s*(.*?)\s*$", m.group(1), re.M))
    meta["desk"] = [d.strip().strip('"') for d in re.findall(r"^  - (.*)$", m.group(1), re.M)]
    return meta


def number(name: str) -> int:
    m = re.match(r"(\d+)-", name)
    return int(m.group(1)) if m else 0


class NotReady(Exception):
    pass


def walk_names(script: Path) -> str:
    meta = front(script)
    return meta.get("episode") or f"walk-{re.sub(r'^\d+-', '', script.relative_to(WALK).parts[1])}-{meta['lesson']}-{script.stem}"


def walkthrough(script: Path):
    """A narrated walkthrough of one visualisation (content/walkthroughs)."""
    meta = front(script)
    rel = script.relative_to(WALK)
    track, module = front(TRACKS / rel.parts[0] / "track.md"), front(TRACKS / rel.parts[0] / rel.parts[1] / "module.md")
    name = meta.get("episode") or f"walk-{re.sub(r'^\d+-', '', rel.parts[1])}-{meta['lesson']}-{script.stem}"
    sidecar_path = OUT / f"{name}.json"
    if not sidecar_path.is_file():
        raise NotReady(f"{rel}: not rendered (uv run scripts/audio/render.py {script.relative_to(ROOT)})")
    sidecar = json.loads(sidecar_path.read_text())
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    if sidecar["script"] != hashlib.sha256(body.encode()).hexdigest()[:16]:
        raise NotReady(f"{rel}: the render is of an older version of this walkthrough; render it again")
    return {
        "name": name,
        "title": sidecar["title"],
        "lesson": meta["lesson"],
        "track": track["slug"],
        "module": module["slug"],
        "viz": meta["viz"].strip('"'),
        "duration": sidecar["duration"],
        "bytes": sidecar["bytes"],
        "cues": sidecar["cues"],
        "audio": sidecar.get("audio_id") or sidecar["script"],
        "render": sidecar.get("render"),
    }


def problem_walkthrough(script: Path):
    """A narrated walkthrough of a problem's solution (content/problem-walkthroughs)."""
    meta = front(script)
    name = f"walk-problem-{meta['problem']}"
    sidecar_path = OUT / f"{name}.json"
    if not sidecar_path.is_file():
        raise NotReady(f"{script.name}: not rendered")
    sidecar = json.loads(sidecar_path.read_text())
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    if sidecar["script"] != hashlib.sha256(body.encode()).hexdigest()[:16]:
        raise NotReady(f"{script.name}: the render is of an older version; render it again")
    return {
        "name": name,
        "title": sidecar["title"],
        "problem": meta["problem"],
        "duration": sidecar["duration"],
        "bytes": sidecar["bytes"],
        "cues": sidecar["cues"],
        "audio": sidecar["audio_id"],
        "render": sidecar.get("render"),
    }


def spoken(script: Path):
    """One entry per question clip of a spoken quiz, or NotReady for each
    clip whose render is missing or of other words. `lesson` is the API's
    lesson key, track/module/lesson."""
    meta = front(script)
    rel = script.relative_to(SPOKEN)
    lesson_file = TRACKS / rel
    track, module = front(TRACKS / rel.parts[0] / "track.md"), front(TRACKS / rel.parts[0] / rel.parts[1] / "module.md")
    title = re.search(r'^title:\s*"?(.*?)"?\s*$', lesson_file.read_text(), re.M).group(1)
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    for n, text in re.findall(r"^## (\d+)\n(.*?)(?=^## |\Z)", body, re.S | re.M):
        name = f"q-{re.sub(r'^\d+-', '', rel.parts[1])}-{meta['lesson']}-{n}"
        sidecar_path = OUT / f"{name}.json"
        said = f"From the lesson: {title}.\n\n{text.strip()}\n"
        if not sidecar_path.is_file():
            yield NotReady(f"{name}: not rendered")
            continue
        sidecar = json.loads(sidecar_path.read_text())
        if sidecar.get("text") != said:
            yield NotReady(f"{name}: the render is of older words; render it again")
            continue
        yield {
            "name": name,
            "lesson": f"{track['slug']}/{module['slug']}/{meta['lesson']}",
            "question": int(n),
            "duration": sidecar["duration"],
            "bytes": sidecar["bytes"],
            "audio": sidecar["audio_id"],
        }


def daily_clips():
    for sidecar_path in sorted(OUT.glob("q-daily-*.json")):
        sidecar = json.loads(sidecar_path.read_text())
        yield {"name": sidecar["name"], "daily": sidecar["daily"], "duration": sidecar["duration"],
               "bytes": sidecar["bytes"], "audio": sidecar["audio_id"]}


def episode(script: Path):
    meta = front(script)
    rel = script.relative_to(AUDIO)
    track_dir, module_dir = TRACKS / rel.parts[0], TRACKS / rel.parts[0] / rel.parts[1]
    track, module = front(track_dir / "track.md"), front(module_dir / "module.md")
    review = "review" in meta
    name = meta.get("episode") or (f"{meta['review']}-{script.stem}" if review else meta["lesson"])
    sidecar_path = OUT / f"{name}.json"
    if not sidecar_path.is_file():
        raise NotReady(f"{rel}: not rendered (uv run scripts/audio/render.py {script.relative_to(ROOT)})")
    sidecar = json.loads(sidecar_path.read_text())
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    if sidecar["script"] != hashlib.sha256(body.encode()).hexdigest()[:16]:
        raise NotReady(f"{rel}: the render is of an older version of this script; render it again")
    position = number(rel.parts[0]) * 1_000_000 + number(rel.parts[1]) * 1_000
    position += 900 + int(re.search(r"(\d+)$", script.stem).group(1)) if review else number(script.name)
    return {
        "name": name,
        "title": sidecar["title"],
        "lesson": None if review else meta["lesson"],
        "review": meta.get("review"),
        "track": track["slug"],
        "module": module["slug"],
        "module_title": module["title"],
        "order": position,
        "duration": sidecar["duration"],
        "bytes": sidecar["bytes"],
        "fit": meta.get("fit"),
        "desk": meta["desk"],
        "chapters": sidecar["chapters"],
        "audio": sidecar.get("audio_id") or sidecar["script"],
        "render": sidecar.get("render"),
    }


def verified(ep, results: Path, minimum: float) -> bool:
    r = results / f"{ep['name']}.json"
    if not r.is_file():
        return False
    v = json.loads(r.read_text())
    return v.get("audio_id") == ep["audio"] and v.get("agreement", 0) >= minimum


def main():
    # --ready: publish what is rendered and skip the rest instead of stopping.
    # --verified DIR [--min 0.95]: publish only episodes whose transcript
    # check (verify.py --results DIR) agrees with the script at least that well.
    args = sys.argv[1:]
    ready = "--ready" in args
    results = Path(args[args.index("--verified") + 1]).resolve() if "--verified" in args else None
    minimum = float(args[args.index("--min") + 1]) if "--min" in args else 0.95
    paths = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in ("--verified", "--min"))]
    scope = Path(paths[0]).resolve() if paths else AUDIO
    if scope == AUDIO:
        scope_items = [AUDIO, WALK, PROBLEM_WALK, SPOKEN]
    else:
        scope_items = [scope]
    scripts = sorted(p for root in scope_items for p in (root.rglob("*.md") if root.is_dir() else [root]))
    endpoint, bucket, key, secret = credentials()
    s3 = boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=key, aws_secret_access_key=secret,
                      region_name="auto", config=Config(s3={"addressing_style": "virtual"}))
    try:
        manifest = json.loads(s3.get_object(Bucket=bucket, Key="manifest.json")["Body"].read())
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("NoSuchKey", "404"):
            raise
        manifest = {"episodes": []}
    existing = {e["name"]: e for e in manifest["episodes"]}
    walks = {w["name"]: w for w in manifest.get("walkthroughs", [])}
    problem_walks = {w["name"]: w for w in manifest.get("problems", [])}
    questions = {q["name"]: q for q in manifest.get("questions", [])}
    clips = {c["name"]: c for c in manifest.get("clips", [])}
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    uploaded = 0
    skipped = 0
    def items():
        for script in scripts:
            if SPOKEN in script.parents:
                for q in spoken(script):
                    yield questions, q
            elif PROBLEM_WALK in script.parents:
                try:
                    yield problem_walks, problem_walkthrough(script)
                except NotReady as e:
                    yield problem_walks, e
            else:
                is_walk = WALK in script.parents
                try:
                    yield (walks if is_walk else existing), (walkthrough(script) if is_walk else episode(script))
                except NotReady as e:
                    yield (walks if is_walk else existing), e
        if scope in (AUDIO, SPOKEN):
            for c in daily_clips():
                yield clips, c

    for table, ep in items():
        if isinstance(ep, NotReady):
            if not ready:
                raise SystemExit(str(ep))
            skipped += 1
            continue
        if results and not verified(ep, results, minimum):
            skipped += 1
            continue
        old = table.get(ep["name"])
        if old and old.get("audio") == ep["audio"]:
            ep["published"] = old["published"]
        else:
            # A re-render of an episode already in the feed keeps its date,
            # so podcast apps do not list it as a new episode.
            s3.upload_file(str(OUT / f"{ep['name']}.mp3"), bucket, f"audio/{ep['name']}.mp3",
                           ExtraArgs={"ContentType": "audio/mpeg", "CacheControl": "public, max-age=31536000"})
            ep["published"] = old["published"] if old else now
            uploaded += 1
            print(f"uploaded {ep['name']} ({ep['duration'] / 60:.1f} min)")
        table[ep["name"]] = ep
    if scope == AUDIO:
        # A full publish also drops walkthroughs whose script is gone or renamed.
        current = {walk_names(p) for p in WALK.rglob("*.md")}
        walks = {k: v for k, v in walks.items() if k in current}
        current = {f"walk-problem-{p.stem}" for p in PROBLEM_WALK.glob("*.md")}
        problem_walks = {k: v for k, v in problem_walks.items() if k in current}
        current = set()
        for p in SPOKEN.rglob("*.md"):
            module, lesson = re.sub(r"^\d+-", "", p.parent.name), front(p)["lesson"]
            current |= {f"q-{module}-{lesson}-{n}" for n in re.findall(r"^## (\d+)$", p.read_text(), re.M)}
        questions = {k: v for k, v in questions.items() if k in current}
    manifest = {
        "generated": now,
        "episodes": sorted(existing.values(), key=lambda e: e["order"]),
        "walkthroughs": sorted(walks.values(), key=lambda w: w["name"]),
        "problems": sorted(problem_walks.values(), key=lambda w: w["name"]),
        "questions": sorted(questions.values(), key=lambda q: (q["lesson"], q["question"])),
        "clips": sorted(clips.values(), key=lambda c: c["name"]),
    }
    s3.put_object(Bucket=bucket, Key="manifest.json", Body=json.dumps(manifest, indent=1).encode(),
                  ContentType="application/json", CacheControl="no-cache")
    total = sum(e["duration"] for e in manifest["episodes"]) / 3600
    print(f"{uploaded} uploaded, {skipped} not ready; manifest lists {len(manifest['episodes'])} episodes, {total:.1f} hours, "
          f"{len(manifest['walkthroughs'])} walkthroughs, {len(manifest['problems'])} problem walkthroughs, {len(manifest['questions'])} questions")


if __name__ == "__main__":
    main()
