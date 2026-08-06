const issuerDomain =
	process.env.CLERK_FRONTEND_API_URL ?? process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!issuerDomain) {
	throw new Error(
		"CLERK_FRONTEND_API_URL is required. Use the reserved disabled issuer for a schema-only deployment.",
	);
}

export default {
	providers: [
		{
			domain: issuerDomain,
			applicationID: "convex",
		},
	],
};
