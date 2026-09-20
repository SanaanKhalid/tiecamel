import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { verifyCriticalProof } from "../apps/integrations/dist/governance-verifier.js";

const require = createRequire(new URL("../apps/integrations/package.json", import.meta.url));
const { Connection } = require("@solana/web3.js");

const [bundlePath, rpcUrl = "https://api.devnet.solana.com"] = process.argv.slice(2);
if (!bundlePath) throw new Error("Usage: node scripts/verify-governance-proof.mjs proof.json [trusted-rpc-url]");
const url = new URL(rpcUrl);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))) throw new Error("Use HTTPS or an explicit loopback validator");
const raw = await readFile(bundlePath, "utf8");
if (raw.length > 32_000) throw new Error("Proof bundle exceeds the expected size");
const result = await verifyCriticalProof(new Connection(rpcUrl, "finalized"), JSON.parse(raw));
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === "verified" ? 0 : 1;
