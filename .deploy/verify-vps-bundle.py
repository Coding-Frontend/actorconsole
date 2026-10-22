import hashlib,json,pathlib,sys,tarfile
bundle,release,revision=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3]
def safe_members(archive, source=False):
    for member in archive.getmembers():
        path=pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive entry')
        if source and any(part.startswith('.env') and not part.endswith('.example') for part in path.parts):
            raise SystemExit('Environment files must stay on the server')
        yield member
with tarfile.open(bundle/'release.tar') as archive:
    members=list(safe_members(archive))
    if {m.name for m in members}!={'manifest.json','source.tar.gz','images.tar.gz'}:
        raise SystemExit('Unexpected bundle contents')
    archive.extractall(bundle,members=members)
manifest=json.loads((bundle/'manifest.json').read_text())
if manifest['revision']!=revision:raise SystemExit('Revision mismatch')
for name in ('source.tar.gz','images.tar.gz'):
    digest=hashlib.sha256()
    with (bundle/name).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    if digest.hexdigest()!=manifest['sha256'][name]:raise SystemExit('Bundle checksum mismatch')
with tarfile.open(bundle/'source.tar.gz') as archive:
    archive.extractall(release,members=list(safe_members(archive,True)))
(release/'REVISION').write_text(revision+'\n')
