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
TRACKS = ROOT / "content" / "tracks"
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


def episode(script: Path):
    meta = front(script)
    rel = script.relative_to(AUDIO)
    track_dir, module_dir = TRACKS / rel.parts[0], TRACKS / rel.parts[0] / rel.parts[1]
    track, module = front(track_dir / "track.md"), front(module_dir / "module.md")
    review = "review" in meta
    name = f"{meta['review']}-{script.stem}" if review else meta["lesson"]
    sidecar_path = OUT / f"{name}.json"
    if not sidecar_path.is_file():
        raise SystemExit(f"{rel}: not rendered (uv run scripts/audio/render.py {script.relative_to(ROOT)})")
    sidecar = json.loads(sidecar_path.read_text())
    if sidecar["script"] != hashlib.sha256(script.read_bytes()).hexdigest()[:16]:
        raise SystemExit(f"{rel}: the render is of an older version of this script; render it again")
    if sidecar.get("source") != meta.get("source"):
        raise SystemExit(f"{rel}: the render's lesson hash does not match the script's; render it again")
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
        "audio": sidecar["script"],
    }


def main():
    scope = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else AUDIO
    scripts = sorted(p for p in scope.rglob("*.md")) if scope.is_dir() else [scope]
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
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    uploaded = 0
    for script in scripts:
        ep = episode(script)
        old = existing.get(ep["name"])
        if old and old.get("audio") == ep["audio"]:
            ep["published"] = old["published"]
        else:
            s3.upload_file(str(OUT / f"{ep['name']}.mp3"), bucket, f"audio/{ep['name']}.mp3",
                           ExtraArgs={"ContentType": "audio/mpeg", "CacheControl": "public, max-age=31536000"})
            ep["published"] = now
            uploaded += 1
            print(f"uploaded {ep['name']} ({ep['duration'] / 60:.1f} min)")
        existing[ep["name"]] = ep
    manifest = {"generated": now, "episodes": sorted(existing.values(), key=lambda e: e["order"])}
    s3.put_object(Bucket=bucket, Key="manifest.json", Body=json.dumps(manifest, indent=1).encode(),
                  ContentType="application/json", CacheControl="no-cache")
    total = sum(e["duration"] for e in manifest["episodes"]) / 3600
    print(f"{uploaded} uploaded; manifest lists {len(manifest['episodes'])} episodes, {total:.1f} hours")


if __name__ == "__main__":
    main()
