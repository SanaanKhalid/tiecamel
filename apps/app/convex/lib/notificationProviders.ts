export type DeliveryResult = {
	status: "accepted" | "blocked" | "failed" | "uncertain";
	providerId?: string;
	error?: string;
	retryable?: boolean;
};
export type DeliveryRequest = {
	id: string;
	channel: "email" | "whatsapp";
	destination: string;
	url: string;
	optedIn: boolean;
};
export type ProviderConfig = {
	enabled?: string;
	resendKey?: string;
	emailFrom?: string;
	twilioSid?: string;
	twilioToken?: string;
	whatsappFrom?: string;
	templateSid?: string;
	callbackBase?: string;
};
/** No private notice title, tax amount, source text or attachment leaves the secure app. */
export async function sendAlert(
	request: DeliveryRequest,
	config: ProviderConfig,
	fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
	if (config.enabled !== "true")
		return {
			status: "blocked",
			error: "Outbound delivery has not been enabled",
		};
	if (!request.optedIn)
		return {
			status: "blocked",
			error: "This channel has no verified, opted-in recipient",
		};
	if (!/^https:\/\//.test(request.url))
		return { status: "blocked", error: "A secure application URL is required" };
	let url: string;
	let headers: Record<string, string>;
	let body: string;
	if (request.channel === "email") {
		if (!config.resendKey || !config.emailFrom)
			return { status: "blocked", error: "Resend is not configured" };
		url = "https://api.resend.com/emails";
		headers = {
			Authorization: `Bearer ${config.resendKey}`,
			"Content-Type": "application/json",
			"Idempotency-Key": `tiecamel-alert-${request.id}`,
		};
		body = JSON.stringify({
			from: config.emailFrom,
			to: [request.destination],
			subject: "TieCamel: a board responsibility needs attention",
			text: `A registered responsibility needs your attention. Sign in to review the current notice, owner and actual deadline.\n\n${request.url}\n\nReceiving or reading this alert does not acknowledge or resolve the responsibility.`,
		});
	} else {
		if (
			!config.twilioSid ||
			!config.twilioToken ||
			!config.whatsappFrom ||
			!config.templateSid ||
			!config.callbackBase
		)
			return {
				status: "blocked",
				error:
					"WhatsApp sender, approved template or callbacks are not configured",
			};
		if (!/^\+[1-9]\d{7,14}$/.test(request.destination))
			return {
				status: "blocked",
				error: "Verified E.164 recipient is required",
			};
		url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioSid)}/Messages.json`;
		headers = {
			Authorization: `Basic ${btoa(`${config.twilioSid}:${config.twilioToken}`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		};
		body = new URLSearchParams({
			From: `whatsapp:${config.whatsappFrom}`,
			To: `whatsapp:${request.destination}`,
			ContentSid: config.templateSid,
			ContentVariables: JSON.stringify({ "1": request.url }),
			StatusCallback: `${config.callbackBase.replace(/\/$/, "")}/webhooks/twilio?delivery=${encodeURIComponent(request.id)}`,
		}).toString();
	}
	try {
		const response = await fetcher(url, {
			method: "POST",
			headers,
			body,
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			const transient = response.status === 429 || response.status >= 500;
			// Twilio message creation has no assumed exactly-once idempotency contract.
			if (request.channel === "whatsapp" && response.status >= 500)
				return {
					status: "uncertain",
					error: "Provider outcome is uncertain; reconcile before retrying",
				};
			return {
				status: "failed",
				error: `Provider rejected delivery (HTTP ${response.status})`,
				retryable: transient,
			};
		}
		const result = (await response.json()) as { id?: string; sid?: string };
		const providerId = request.channel === "email" ? result.id : result.sid;
		if (!providerId)
			return {
				status: "uncertain",
				error: "Provider response had no message identifier",
			};
		return { status: "accepted", providerId };
	} catch {
		return request.channel === "email"
			? {
					status: "failed",
					error: "Email request timed out; safe idempotent retry queued",
					retryable: true,
				}
			: {
					status: "uncertain",
					error: "WhatsApp outcome is uncertain; reconcile before retrying",
				};
	}
}
function base64(bytes: ArrayBuffer) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
function equal(a: string, b: string) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1)
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
async function hmac(
	secret: Uint8Array,
	body: string,
	hash: "SHA-256" | "SHA-1",
) {
	const key = await crypto.subtle.importKey(
		"raw",
		new Uint8Array(secret).buffer,
		{ name: "HMAC", hash },
		false,
		["sign"],
	);
	return base64(
		await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
	);
}
export async function verifyResend(
	secret: string,
	raw: string,
	headers: { id: string; timestamp: string; signature: string },
	now: number,
) {
	const time = Number(headers.timestamp);
	if (
		!headers.id ||
		!Number.isInteger(time) ||
		Math.abs(now / 1000 - time) > 300
	)
		return false;
	try {
		const key = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (char) =>
			char.charCodeAt(0),
		);
		const expected = await hmac(
			key,
			`${headers.id}.${headers.timestamp}.${raw}`,
			"SHA-256",
		);
		return headers.signature
			.split(" ")
			.some(
				(entry) => entry.startsWith("v1,") && equal(entry.slice(3), expected),
			);
	} catch {
		return false;
	}
}
export async function verifyTwilio(
	secret: string,
	exactPublicUrl: string,
	parameters: URLSearchParams,
	signature: string,
) {
	let content = exactPublicUrl;
	for (const key of [...new Set(parameters.keys())].sort())
		for (const value of [...new Set(parameters.getAll(key))].sort())
			content += key + value;
	const expected = await hmac(
		new TextEncoder().encode(secret),
		content,
		"SHA-1",
	);
	return equal(signature, expected);
}
export function nextDeliveryStatus(
	current: string,
	incoming: "accepted" | "delivered" | "failed",
) {
	if (
		current === "delivered" ||
		(current === "failed" && incoming === "accepted")
	)
		return current;
	return incoming;
}
