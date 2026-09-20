import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const rpcPort = 18898;
const rpc = `http://127.0.0.1:${rpcPort}`;
const ledger = await mkdtemp(join(tmpdir(), "tiecamel-governance-test-"));
// Do not accidentally run against another developer's existing validator.
let occupied = false;
try { await fetch(rpc, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
if (occupied) throw new Error(`Port ${rpcPort} is already in use; stop that service before running this isolated suite`);
const validator = spawn("solana-test-validator", ["--bpf-program", "4G9rXL6BLXEKWM9QT6YWSBpXaTFBGmYbLB77P3vpZtxD", "target/deploy/tiecamel_governance.so", "--rpc-port", String(rpcPort), "--faucet-port", "19901", "--gossip-port", "18000", "--dynamic-port-range", "18001-18050", "--ledger", ledger, "--quiet"], { stdio: "inherit" });
let validatorError;
validator.on("error", (error) => { validatorError = error; });
const stop = () => { validator.kill("SIGTERM"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
 let healthy = false;
 for (let attempt = 0; attempt < 60; attempt++) {
  if (validatorError) throw validatorError;
  if (validator.exitCode !== null) throw new Error("Local validator exited before becoming ready");
  try {
   const response = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }), signal: AbortSignal.timeout(1000) });
   healthy = (await response.json()).result === "ok";
  } catch {}
  if (healthy) break;
  await delay(500);
 }
 if (!healthy) throw new Error("Local validator did not become healthy");
 const suite = spawn("pnpm", ["--filter", "@tiecamel/integrations", "exec", "vitest", "run", "src/governance-localnet.test.ts"], { stdio: "inherit", env: { ...process.env, TIECAMEL_SOLANA_TEST_RPC: rpc } });
 process.exitCode = await new Promise((resolve, reject) => { suite.on("error", reject); suite.on("exit", (code) => resolve(code ?? 1)); });
} finally {
 stop();
 process.off("SIGINT", stop);
 process.off("SIGTERM", stop);
 console.log(`Local-only test ledger retained for inspection: ${ledger}`);
}
