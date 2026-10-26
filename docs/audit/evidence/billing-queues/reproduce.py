"""Run bounded, mocked regression fixtures against the recorded Git baseline."""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

BASE = 'fc52f547286b14de2f483899b4aa5dcdfca8b5ea'
evidence = Path(__file__).resolve().parent
repository = evidence.parents[3]
fixture = Path(tempfile.mkdtemp(prefix='actorconsole-billing-repro-'))
archive = subprocess.run(['git', 'archive', BASE], cwd=repository, capture_output=True, check=True).stdout
with tarfile.open(fileobj=io.BytesIO(archive)) as contents:
    contents.extractall(fixture, filter='data')
(fixture / 'node_modules').symlink_to(repository / 'node_modules', target_is_directory=True)
for source in [*repository.glob('apps/*/node_modules'), *repository.glob('packages/*/node_modules')]:
    (fixture / source.relative_to(repository)).symlink_to(source, target_is_directory=True)
for name in ['shared', 'db', 'apify', 'ai', 'logo-catalog']:
    source = repository / 'packages' / name / 'dist'
    if not source.exists():
        raise RuntimeError('Build the local workspace packages before running fixtures')
    (fixture / 'packages' / name / 'dist').symlink_to(source, target_is_directory=True)
shutil.copytree(evidence / 'scratch-fixtures', fixture, dirs_exist_ok=True)
environment = {**os.environ, 'NODE_OPTIONS': '--require=' + str(evidence / 'local-only.cjs')}
groups = {
    'billing': ['apps/api/test/routes/billing.test.ts', 'apps/api/test/routes/razorpay.test.ts'],
    'usage': ['apps/worker/test/lib/usage-accounting-audit.test.ts'],
    'expiry': ['apps/worker/test/lib/subscription-expiry-audit.test.ts'],
    'queue': ['apps/api/test/lib/queue-timeout-audit.test.ts'],
}
results = []
for label, tests in groups.items():
    command = ['node', str(repository / 'node_modules/vitest/vitest.mjs'), 'run', *tests]
    logfile = fixture / ('audit-' + label + '.txt')
    with logfile.open('w') as output:
        result = subprocess.run(command, cwd=fixture, env=environment, stdout=output, stderr=subprocess.STDOUT, timeout=60)
    results.append({'group': label, 'exit': result.returncode, 'command': command, 'cwd': str(fixture), 'log': str(logfile)})
print(json.dumps({'baseline': BASE, 'results': results}, indent=2))
