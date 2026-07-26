import { createHmac, timingSafeEqual } from "node:crypto";

export function signCallback(secret: string, timestamp: string, body: string) {
	return createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
}

export function verifyServiceToken(actual: string | null, expected: string) {
	if (!actual?.startsWith("Bearer ")) return false;
	return safeEqual(actual.slice(7), expected);
}

function safeEqual(left: string, right: string) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}
