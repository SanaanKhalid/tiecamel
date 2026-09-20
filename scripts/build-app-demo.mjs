import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Process variables override Vite's .env.local values. Do not copy a developer's
// Convex URL or Clerk configuration into the publicly hosted demonstration.
const result = spawnSync("pnpm", ["exec", "vite", "build", "--mode", "public-demo"], {
  cwd: fileURLToPath(new URL("../apps/app/", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_CONVEX_URL: "",
    VITE_CONVEX_SITE_URL: "",
    VITE_CLERK_PUBLISHABLE_KEY: "",
    CLERK_SECRET_KEY: "",
    VITE_TIECAMEL_DEMO_MODE: "true",
    VITE_TIECAMEL_CLIENT_ID: "public-demo",
    VITE_TIECAMEL_CLIENT_NAME: "TieCamel Demo Foundation",
    VITE_TIECAMEL_CLIENT_SHORT_NAME: "Demo Foundation",
    VITE_TIECAMEL_LANDING_URL: "https://app.tiecamel.com",
    VITE_SHOW_DEVTOOLS: "false",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
