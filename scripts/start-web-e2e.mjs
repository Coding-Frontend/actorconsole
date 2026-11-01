import { spawn } from "node:child_process";
import { prepareStandaloneWeb } from "../e2e/support/web-build.mjs";
const child = spawn(process.execPath, [await prepareStandaloneWeb()], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "8080" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
