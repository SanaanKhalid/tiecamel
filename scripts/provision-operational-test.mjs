import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Explicit operator command; never called by the web app or build/deploy scripts.
const appDir = fileURLToPath(new URL("../apps/app/", import.meta.url));
const secret = process.env.CLERK_SECRET_KEY;
const ownerEmail = process.argv[2];
if (!secret?.startsWith("sk_test_") || !ownerEmail || process.env.VITE_CONVEX_URL !== "https://careful-setter-342.convex.cloud")
  throw new Error("Development credentials, test backend and an authorized owner email are required.");

async function clerk(path, body) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Clerk HTTP ${response.status}: ${data.errors?.map(e => e.code).join(",") ?? "request failed"}`);
  return data;
}

const instance = await clerk("/instance");
if (instance.environment_type !== "development") throw new Error("Not a development Clerk instance");
const people = [];
for (const role of ["owner", "finance", "secretary", "reviewer", "board", "member"]) {
  const externalId = `tiecamel-operational-test-v1-${role}`;
  const email = role === "owner" ? ownerEmail : `tiecamel-operational-test-${role}@example.invalid`;
  const matches = await clerk(`/users?email_address=${encodeURIComponent(email)}`);
  if (!Array.isArray(matches) || matches.length > 1) throw new Error("Ambiguous test identity");
  let user = matches[0];
  if (user && user.external_id !== externalId) throw new Error(`Existing ${role} account requires manual review; no account was overwritten`);
  if (!user) user = await clerk("/users", {
    email_address: [email], external_id: externalId, skip_password_requirement: true,
    private_metadata: { tiecamelOperationalTest: true, role },
  });
  // All synthetic officer notifications go to the owner's explicitly allowed test inbox.
  // Non-owner Clerk accounts have non-routable addresses, no public test OTP, and
  // are used through operator-created test sessions, not public role switching.
  people.push({ clerkUserId: user.id, name: `Test ${role}`, email: ownerEmail, role });
  console.log(`Prepared test ${role} identity`);
}
const result = execFileSync("pnpm", ["exec", "convex", "run", "operationalTests:provision", JSON.stringify({ slug: "test-tiecamel", name: "TieCamel Test Foundation", people }), "--deployment", "careful-setter-342"], { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
console.log(result);
