import { signCallback } from "./security.js";

export async function sendSignedCallback(urlEnv: string, callback: unknown) {
	const url = requiredEnv(urlEnv);
	const secret = requiredEnv("CONVEX_CALLBACK_SECRET");
	const body = JSON.stringify(callback);
	const timestamp = String(Date.now());
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-TieCamel-Timestamp": timestamp,
			"X-TieCamel-Signature": signCallback(secret, timestamp, body),
		},
		body,
	});
	if (!response.ok) {
		throw new Error(
			`Convex callback failed (${response.status}): ${await response.text()}`,
		);
	}
}

function requiredEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}
