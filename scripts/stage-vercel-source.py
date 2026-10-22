"""Stage a committed frontend release without local secrets or backend source."""
import argparse
import io
import json
import pathlib
import subprocess
import tarfile
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--revision", default="HEAD")
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
revision = subprocess.check_output(
    ["git", "rev-parse", "--verify", f"{args.revision}^{{commit}}"], cwd=root, text=True
).strip()
link = root / ".vercel" / "project.json"
project = json.loads(link.read_text(encoding="utf-8"))
if not isinstance(project, dict) or not all(
    isinstance(project.get(key), str) and project[key].strip()
    for key in ("projectId", "orgId")
):
    raise SystemExit("Link this checkout to your own Vercel project first")
destination = pathlib.Path(tempfile.mkdtemp(prefix=f"actorconsole-{revision[:12]}-"))
archive = subprocess.check_output(["git", "archive", "--format=tar", revision], cwd=root)
root_files = {"package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "tsconfig.base.json", "eslint.config.mjs", ".npmrc", ".vercelignore"}
prefixes = ("apps/web/", "packages/shared/", "packages/config/")
count = 0
with tarfile.open(fileobj=io.BytesIO(archive)) as source:
    for entry in source:
        path = pathlib.PurePosixPath(entry.name)
        allowed = entry.name in root_files or entry.name.startswith(prefixes) or entry.name == "scripts/check-web-boundary.mjs"
        if not entry.isfile() or not allowed:
            continue
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit("Unsafe archive path")
        if any(part.startswith(".env") or part in {"node_modules", ".next", "dist", ".turbo"} for part in path.parts):
            continue
        target = destination.joinpath(*path.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.extractfile(entry).read())
        count += 1
(destination / ".vercel").mkdir()
(destination / ".vercel" / "project.json").write_text(json.dumps(project), encoding="utf-8")
print(json.dumps({"path": str(destination), "revision": revision, "files": count}))
