import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
	nextDeliveryStatus,
	sendAlert,
	verifyResend,
	verifyTwilio,
} from "../../convex/lib/notificationProviders";

const request = {
	id: "delivery-1",
	channel: "email" as const,
	destination: "officer@example.invalid",
	url: "https://app.tiecamel.com/org/responsibilities",
	optedIn: true,
};
const config = {
	enabled: "true",
	resendKey: "test-key",
	emailFrom: "alerts@example.invalid",
};
describe("notification provider boundaries", () => {
	it("blocks test delivery to unlisted recipients even with live credentials", async () => {
		const fetcher = vi.fn();
		for (const testRecipients of [
			undefined,
			"*@example.invalid",
			"someone@example.invalid",
		]) {
			expect(
				(
					await sendAlert(
						{ ...request, operationalTest: true },
						{ ...config, testEnabled: "true", testRecipients },
						fetcher,
					)
				).status,
			).toBe("blocked");
		}
		expect(
			(
				await sendAlert(
					{ ...request, operationalTest: true },
					{ ...config, testRecipients: request.destination },
					fetcher,
				)
			).status,
		).toBe("blocked");
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("labels allowlisted test email and keeps provider acceptance distinct from delivery", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "test-email" })));
		const result = await sendAlert(
			{ ...request, operationalTest: true },
			{
				...config,
				testEnabled: "true",
				testRecipients: ` other@example.invalid, ${request.destination.toUpperCase()} `,
			},
			fetcher,
		);
		expect(result.status).toBe("accepted");
		const message = JSON.parse(fetcher.mock.calls[0][1].body);
		expect(message.subject).toMatch(/^\[TEST\]/);
		expect(message.text).toContain("not a real nonprofit notice");
	});
	it("requires a separate test WhatsApp template and an exact phone allowlist", async () => {
		const fetcher = vi.fn();
		const result = await sendAlert(
			{
				...request,
				channel: "whatsapp",
				destination: "+15551234567",
				operationalTest: true,
			},
			{
				...config,
				testEnabled: "true",
				testRecipients: "+15551234567",
				twilioSid: "AC123",
				twilioToken: "test",
				whatsappFrom: "+15557654321",
				templateSid: "production-template",
				callbackBase: "https://test.convex.site",
			},
			fetcher,
		);
		expect(result.status).toBe("blocked");
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("does not send without explicit enablement, credentials or consent", async () => {
		const fetcher = vi.fn();
		expect((await sendAlert(request, {}, fetcher)).status).toBe("blocked");
		expect(
			(await sendAlert({ ...request, optedIn: false }, config, fetcher)).status,
		).toBe("blocked");
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("uses a stable Resend idempotency key and only minimal content", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "email-123" })));
		expect(await sendAlert(request, config, fetcher)).toEqual({
			status: "accepted",
			providerId: "email-123",
		});
		const [, init] = fetcher.mock.calls[0];
		expect(init.headers["Idempotency-Key"]).toBe("tiecamel-alert-delivery-1");
		expect(JSON.parse(init.body).text).toContain(
			"does not acknowledge or resolve",
		);
	});
	it("retries email uncertainty but never blindly resends uncertain WhatsApp", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
		expect(await sendAlert(request, config, fetcher)).toMatchObject({
			status: "failed",
			retryable: true,
		});
		const result = await sendAlert(
			{ ...request, channel: "whatsapp", destination: "+15551234567" },
			{
				enabled: "true",
				twilioSid: "AC123",
				twilioToken: "token",
				whatsappFrom: "+15557654321",
				templateSid: "HX123",
				callbackBase: "https://test.convex.site",
			},
			fetcher,
		);
		expect(result.status).toBe("uncertain");
		expect(result.retryable).toBeUndefined();
	});
	it("validates a signed Resend raw body and rejects replay/tampering", async () => {
		const raw = '{"type":"email.received"}',
			timestamp = "1800000000",
			id = "msg_event";
		const key = Buffer.from("test-signing-secret");
		const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64")}`;
		const headers = { id, timestamp, signature };
		expect(
			await verifyResend(
				`whsec_${key.toString("base64")}`,
				raw,
				headers,
				1800000000000,
			),
		).toBe(true);
		expect(
			await verifyResend(
				`whsec_${key.toString("base64")}`,
				`${raw} `,
				headers,
				1800000000000,
			),
		).toBe(false);
		expect(
			await verifyResend(
				`whsec_${key.toString("base64")}`,
				raw,
				headers,
				1800000900000,
			),
		).toBe(false);
	});
	it("binds Twilio signatures to the exact callback URL and form values", async () => {
		const url = "https://example.invalid/webhooks/twilio?delivery=one";
		const params = new URLSearchParams({
			MessageSid: "SM123",
			MessageStatus: "delivered",
		});
		const signature = createHmac("sha1", "test-secret")
			.update(`${url}MessageSidSM123MessageStatusdelivered`)
			.digest("base64");
		expect(await verifyTwilio("test-secret", url, params, signature)).toBe(
			true,
		);
		expect(
			await verifyTwilio(
				"test-secret",
				url.replace("one", "two"),
				params,
				signature,
			),
		).toBe(false);
	});
	it("never downgrades a delivered receipt when callbacks arrive out of order", () => {
		expect(nextDeliveryStatus("delivered", "accepted")).toBe("delivered");
		expect(nextDeliveryStatus("failed", "accepted")).toBe("failed");
		expect(nextDeliveryStatus("accepted", "delivered")).toBe("delivered");
	});
});
