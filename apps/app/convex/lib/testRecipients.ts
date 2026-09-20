/** Exact destinations only; never wildcards, domains or client-controlled allowlists. */
export function testRecipientAllowed(
	channel: "email" | "whatsapp",
	destination: string,
	allowlist?: string,
) {
	if (!destination.trim()) return false;
	const normalize = (value: string) =>
		channel === "email" ? value.trim().toLowerCase() : value.trim();
	return (allowlist ?? "")
		.split(",")
		.some((value) => normalize(value) === normalize(destination));
}
