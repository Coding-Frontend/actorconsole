"""Check the production receiver's archive boundary without Docker or a database."""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest

REVISION = "a" * 40


class ReleaseBoundaryTest(unittest.TestCase):
    def verify(self, entries, checksum=True, revision=REVISION):
        with tempfile.TemporaryDirectory(prefix="actorconsole-bundle-test-") as temp:
            root = pathlib.Path(temp)
            bundle, release = root / "bundle", root / "release"
            bundle.mkdir()
            release.mkdir()
            source = io.BytesIO()
            with tarfile.open(fileobj=source, mode="w:gz") as archive:
                for name, content, symlink in entries:
                    entry = tarfile.TarInfo(name)
                    if symlink:
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = content
                        archive.addfile(entry)
                    else:
                        data = content.encode()
                        entry.size = len(data)
                        archive.addfile(entry, io.BytesIO(data))
            files = {"source.tar.gz": source.getvalue(), "images.tar.gz": b"fabricated image archive"}
            hashes = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
            if not checksum:
                hashes["source.tar.gz"] = "0" * 64
            manifest = {"revision": revision, "sha256": hashes}
            files["manifest.json"] = json.dumps(manifest).encode()
            with tarfile.open(bundle / "release.tar", "w") as archive:
                for name, data in files.items():
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))
            verifier = pathlib.Path(__file__).resolve().parents[1] / ".deploy/verify-vps-bundle.py"
            result = subprocess.run(
                [sys.executable, str(verifier), str(bundle), str(release), REVISION],
                capture_output=True, text=True,
            )
            return result, [p.relative_to(release).as_posix() for p in release.rglob("*")]

    def test_accepts_public_source_and_environment_examples(self):
        result, paths = self.verify([("package.json", "{}", False), (".env.example", "AUTH_SECRET=", False)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("REVISION", paths)
        self.assertIn(".env.example", paths)

    def test_rejects_modified_archive(self):
        result, paths = self.verify([("package.json", "{}", False)], checksum=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(paths, [])

    def test_rejects_wrong_revision(self):
        result, paths = self.verify([], revision="b" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(paths, [])

    def test_rejects_private_environment_files(self):
        for name in [".env", "apps/web/.env.local", ".env.production"]:
            with self.subTest(name=name):
                result, paths = self.verify([(name, "private-boundary-fixture", False)])
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(paths, [])

    def test_rejects_traversal_absolute_paths_and_symlinks(self):
        for entry in [("../escape", "data", False), ("/escape", "data", False), ("link", "../../escape", True)]:
            with self.subTest(entry=entry):
                result, paths = self.verify([entry])
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(paths, [])


if __name__ == "__main__":
    unittest.main()
