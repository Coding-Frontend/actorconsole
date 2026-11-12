import os, pathlib, subprocess, time, json
root=pathlib.Path('/workspace/actorconsole'); out=pathlib.Path('/tmp/actorconsole-billing-audit')
env={**os.environ,'NODE_OPTIONS':'--require=/tmp/actorconsole-billing-audit/local-only.cjs','DATABASE_URL':'mysql://fixture:fixture@127.0.0.1:3306/audit_unused','NEXT_TELEMETRY_DISABLED':'1','OTEL_SDK_DISABLED':'true','SENTRY_AUTH_TOKEN':'','AUTH_URL':'http://localhost:8080','API_BASE_URL':'http://127.0.0.1:9','WEB_BASE_URL':'http://localhost:8080','WEB_API_BASE_URL':'http://127.0.0.1:9','NEXT_PUBLIC_SITE_URL':'http://localhost:8080','NEXT_PUBLIC_API_BASE_URL':'http://127.0.0.1:9','NEXT_PUBLIC_API_URL':'http://127.0.0.1:9','ACTORCONSOLE_EXTENSION_WEB_ORIGIN':'http://localhost:8080','ACTORCONSOLE_EXTENSION_API_ORIGIN':'http://localhost:4000'}
results=[]
for label in ['packages/shared','packages/db','packages/apify','packages/ai','packages/logo-catalog','apps/api','apps/worker','apps/mcp','apps/chrome-extension','apps/web']:
    cmd=['npm','run','build']; started=time.time(); logfile=out/('build-'+label.replace('/','_')+'.log')
    with logfile.open('w') as log:
        try: code=subprocess.run(cmd,cwd=root/label,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=300).returncode
        except subprocess.TimeoutExpired: code=124
    item={'label':label,'command':cmd,'exit':code,'seconds':round(time.time()-started,2),'log':str(logfile)}
    results.append(item); print(json.dumps(item),flush=True)
(out/'build-results.json').write_text(json.dumps(results,indent=2)+'\n')
