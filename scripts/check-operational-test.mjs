import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/app/package.json", import.meta.url));
const { ConvexHttpClient } = require("convex/browser");
const { makeFunctionReference } = require("convex/server");
const key = process.env.CLERK_SECRET_KEY;
if (!key?.startsWith("sk_test_") || process.env.VITE_CONVEX_URL !== "https://careful-setter-342.convex.cloud") throw new Error("Development credentials required");
async function clerk(path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json();
  if (!r.ok) throw new Error(`Clerk request failed (${r.status}); ${data.errors?.map(e => e.code).join(",")}`);
  return data;
}
// Short-lived operator-created test sessions exercise actual signed Clerk JWTs,
// not Convex administrator impersonation. This is not a human login/OTP test.
for (const role of ["owner", "finance", "secretary", "reviewer", "board", "member"]) {
  const users = await clerk(`/users?external_id=${encodeURIComponent(`tiecamel-operational-test-v1-${role}`)}`);
  if (!Array.isArray(users) || users.length !== 1) throw new Error(`Missing unique ${role} test identity`);
  const session = await clerk("/sessions", { user_id: users[0].id });
  try {
    const token = await clerk(`/sessions/${session.id}/tokens/convex`, { expires_in_seconds: 60 });
    const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);
    client.setAuth(token.jwt);
    const workspace = await client.query(makeFunctionReference("platform:workspace"), {});
    if (!workspace.organization.operationalTest || workspace.organization.slug !== "test-tiecamel") throw new Error("Unexpected tenant");
    const expectedRepositories = role === "member" ? 0 : 1;
    if (workspace.repositories.length !== expectedRepositories) throw new Error("Unexpected repository access");
    console.log(JSON.stringify({ role, authenticated: true, testTenant: true, visibleRepositories: workspace.repositories.length }));
  } finally {
    await clerk(`/sessions/${session.id}/revoke`, {});
  }
}
