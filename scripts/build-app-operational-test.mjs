import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The owner selected app.tiecamel.com for testing. The backend stays development-only.
if (!process.env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    process.env.VITE_CONVEX_URL !== "https://careful-setter-342.convex.cloud") {
  throw new Error("Operational testing requires explicit Clerk development keys and the isolated development backend.");
}
const result = spawnSync("pnpm", ["exec", "vite", "build", "--mode", "operational-test"], {
  cwd: fileURLToPath(new URL("../apps/app/", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_TIECAMEL_DEMO_MODE: "false",
    VITE_TIECAMEL_CLIENT_ID: "operational-test",
    VITE_TIECAMEL_CLIENT_NAME: "TieCamel Operational Test",
    VITE_TIECAMEL_CLIENT_SHORT_NAME: "Test Pilot",
    VITE_TIECAMEL_LANDING_URL: "https://app.tiecamel.com",
    VITE_SHOW_DEVTOOLS: "false",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
