import {
	type ApprovalIntent,
	inspectApprovalIntent,
	verifyReviewerSignature,
} from "@tiecamel/governance";
import { TurnkeyClient } from "@turnkey/http";
import { WebauthnStamper } from "@turnkey/webauthn-stamper";

/** Public metadata of a user-controlled sub-organization, obtained from authenticated binding. */
export type IndividualSigningAccount = {
	subOrganizationId: string;
	credentialId: string;
	rpId: string;
	address: string;
	membershipId: string;
	userId: string;
};

export function validateSigningAccount(
	intent: ApprovalIntent,
	account: IndividualSigningAccount,
) {
	if (
		account.address !== intent.signer ||
		account.membershipId !== intent.membershipId ||
		account.userId !== intent.userId
	)
		throw new Error("This secure identity does not belong to the reviewer");
	if (
		!/^[0-9a-f-]{36}$/i.test(account.subOrganizationId) ||
		!/^[A-Za-z0-9_-]{16,2048}$/.test(account.credentialId)
	)
		throw new Error("Secure signing identity has not been provisioned");
}

/** No API-key fallback, silent session signing, or service-owned reviewer keys. */
export async function signApprovalWithClient(
	intent: ApprovalIntent,
	account: IndividualSigningAccount,
	client: Pick<TurnkeyClient, "signTransaction">,
	clock = Date.now,
) {
	validateSigningAccount(intent, account);
	const transaction = inspectApprovalIntent(intent, clock());
	const response = await client.signTransaction({
		type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
		organizationId: account.subOrganizationId,
		timestampMs: String(clock()),
		parameters: {
			signWith: account.address,
			type: "TRANSACTION_TYPE_SOLANA",
			unsignedTransaction: transaction
				.serialize({ requireAllSignatures: false, verifySignatures: false })
				.toString("hex"),
		},
	});
	if (response.activity.status !== "ACTIVITY_STATUS_COMPLETED")
		throw new Error(
			"Secure approval was not completed; no approval has been recorded",
		);
	const signed =
		response.activity.result?.signTransactionResult?.signedTransaction;
	if (!signed)
		throw new Error("The signing provider returned no transaction signature");
	verifyReviewerSignature(intent, signed, clock());
	return signed;
}

/** Call directly from an explicit Review and approve click to preserve user activation. */
export async function signApprovalWithPasskey(
	intent: ApprovalIntent,
	account: IndividualSigningAccount,
) {
	if (
		typeof window === "undefined" ||
		!window.isSecureContext ||
		!navigator.credentials
	)
		throw new Error("A secure browser with passkey support is required");
	if (account.rpId !== window.location.hostname)
		throw new Error("This passkey is bound to a different application host");
	validateSigningAccount(intent, account);
	const raw = account.credentialId.replaceAll("-", "+").replaceAll("_", "/");
	const credential = Uint8Array.from(
		atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")),
		(c) => c.charCodeAt(0),
	);
	const stamper = new WebauthnStamper({
		rpId: account.rpId,
		userVerification: "required",
		timeout: 60_000,
		allowCredentials: [{ type: "public-key", id: credential }],
	});
	const client = new TurnkeyClient(
		{ baseUrl: "https://api.turnkey.com" },
		stamper,
	);
	return signApprovalWithClient(intent, account, client);
}
