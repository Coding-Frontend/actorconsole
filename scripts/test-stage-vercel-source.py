"""Verify frontend release inputs and secret exclusion in a disposable repository."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest


class VercelSourceTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="actorconsole-release-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name).resolve()
        source = pathlib.Path(__file__).resolve().parents[1]
        inputs = [
            "scripts/stage-vercel-source.py", "tsconfig.base.json", "pnpm-lock.yaml",
            "apps/web/package.json", "packages/config/tsconfig/library.json",
            "packages/shared/tsconfig.json", "scripts/check-web-boundary.mjs",
        ]
        for name in inputs:
            destination = self.root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((source / name).read_bytes())
        # Commit fabricated private files to verify the archive filter.
        for name in [".env", "apps/web/.env.local", "packages/db/private.txt",
                     "apps/api/private.txt", "apps/web/node_modules/private.txt"]:
            destination = self.root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text("private-boundary-fixture", encoding="utf-8")
        self.git("init", "--quiet")
        self.git("add", ".")
        self.git("-c", "user.name=Release fixture", "-c", "user.email=fixture@example.test",
                 "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture")
        self.project = self.root / ".vercel/project.json"
        self.project.parent.mkdir()

    def git(self, *args):
        subprocess.run(
            ["git", "-c", f"core.hooksPath={self.root / '.no-hooks'}", *args],
            cwd=self.root, check=True, capture_output=True,
        )

    def stage(self):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/stage-vercel-source.py")],
            cwd=self.root, text=True, capture_output=True,
        )

    def test_accepts_own_project_and_excludes_private_files(self):
        project = {"projectId": "prj_fixture", "orgId": "team_fixture"}
        self.project.write_text(json.dumps(project), encoding="utf-8")
        result = self.stage()
        self.assertEqual(result.returncode, 0, result.stderr)
        staged = pathlib.Path(json.loads(result.stdout)["path"]).resolve()
        self.assertEqual(staged.parent, pathlib.Path(tempfile.gettempdir()).resolve())
        self.assertTrue(staged.name.startswith("actorconsole-"))
        self.addCleanup(shutil.rmtree, staged)
        for name in ["tsconfig.base.json", "pnpm-lock.yaml", "apps/web/package.json",
                     "packages/config/tsconfig/library.json", "packages/shared/tsconfig.json",
                     "scripts/check-web-boundary.mjs"]:
            self.assertTrue((staged / name).is_file(), name)
        for path in staged.rglob("*"):
            self.assertFalse(path.name.startswith(".env"), str(path))
            self.assertNotEqual(path.name, "node_modules")
        self.assertFalse((staged / "packages/db").exists())
        self.assertFalse((staged / "apps/api").exists())
        self.assertEqual(json.loads((staged / ".vercel/project.json").read_text()), project)

    def test_rejects_incomplete_project_link(self):
        self.project.write_text(json.dumps({"projectId": "prj_fixture"}), encoding="utf-8")
        result = self.stage()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("your own Vercel project", result.stderr)


if __name__ == "__main__":
    unittest.main()
