import os, sys, pathlib, subprocess, time, json
root=pathlib.Path('/workspace/actorconsole')
out=pathlib.Path('/tmp/actorconsole-billing-audit')
mode=sys.argv[1]
env={**os.environ,'NODE_OPTIONS':'--require=/tmp/actorconsole-billing-audit/local-only.cjs','NEXT_TELEMETRY_DISABLED':'1','OTEL_SDK_DISABLED':'true','SENTRY_AUTH_TOKEN':''}
packages=sorted([p.parent for p in root.glob('packages/*/package.json')]+[p.parent for p in root.glob('apps/*/package.json')])
if mode=='test': commands=[('all-tests',['node','node_modules/vitest/vitest.mjs','run'],root),('script-tests',['node','--test',*map(str,root.glob('scripts/*.test.mjs'))],root)]
elif mode=='typecheck': commands=[(str(p.relative_to(root)),['node',str(root/'node_modules/typescript/bin/tsc'),'--noEmit'],p) for p in packages if 'typecheck' in json.loads((p/'package.json').read_text()).get('scripts',{})]
elif mode=='lint': commands=[(str(p.relative_to(root)),['node',str(root/'node_modules/eslint/bin/eslint.js'),'.','--max-warnings=0'],p) for p in packages if 'lint' in json.loads((p/'package.json').read_text()).get('scripts',{})]
else: raise RuntimeError('Unknown gate')
results=[]
for label,cmd,cwd in commands:
    started=time.time(); logfile=out/(mode+'-'+label.replace('/','_')+'.log')
    with logfile.open('w') as log:
        try: code=subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=300).returncode
        except subprocess.TimeoutExpired: code=124
    item={'label':label,'command':cmd,'cwd':str(cwd),'exit':code,'seconds':round(time.time()-started,2),'log':str(logfile)}
    results.append(item); print(json.dumps(item),flush=True)
(out/(mode+'-results.json')).write_text(json.dumps(results,indent=2)+'\n')
