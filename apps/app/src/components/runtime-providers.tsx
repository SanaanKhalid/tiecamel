import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexProvider, ConvexReactClient, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { clientConfig, runtimeConfig } from "../config/client";
import { ConvexPlatformProvider } from "../platform/convex-store";
import { PlatformProvider } from "../platform/store";

export function RuntimeProviders({ children }: { children: React.ReactNode }) {
	if (clientConfig.demoMode && clientConfig.convexConfigured) {
		return <DemoConvexBridge>{children}</DemoConvexBridge>;
	}
	if (!clientConfig.authConfigured) {
		return <PlatformProvider>{children}</PlatformProvider>;
	}

	return (
		<ClerkProvider
			publishableKey={runtimeConfig.clerkPublishableKey}
			signInFallbackRedirectUrl="/"
			signUpFallbackRedirectUrl="/"
		>
			{clientConfig.convexConfigured ? (
				<ClerkConvexBridge>
					<ConvexPlatformProvider>{children}</ConvexPlatformProvider>
				</ClerkConvexBridge>
			) : (
				<PlatformProvider>{children}</PlatformProvider>
			)}
		</ClerkProvider>
	);
}

function DemoConvexBridge({ children }: { children: React.ReactNode }) {
	const client = useMemo(
		() => new ConvexReactClient(runtimeConfig.convexUrl),
		[],
	);
	return (
		<ConvexProvider client={client}>
			<DemoSession>{children}</DemoSession>
		</ConvexProvider>
	);
}

function DemoSession({ children }: { children: React.ReactNode }) {
	const start = useMutation(api.demoSessions.start);
	const switchMembership = useMutation(api.demoSessions.switchMembership);
	const [token, setToken] = useState<string>();
	const [error, setError] = useState("");
	const starting = useRef(false);
	useEffect(() => {
		const stored = window.localStorage.getItem("tiecamel:demo-session");
		if (stored) {
			setToken(stored);
			return;
		}
		if (starting.current) return;
		starting.current = true;
		void start({ organizationSlug: "icn" })
			.then((session) => {
				window.localStorage.setItem("tiecamel:demo-session", session.token);
				setToken(session.token);
			})
			.catch((caught) => {
				starting.current = false;
				setError(
					caught instanceof Error
						? caught.message
						: "Could not start the development demo session.",
				);
			});
	}, [start]);
	if (error) {
		return (
			<main className="grid min-h-screen place-items-center p-8 text-center">
				<div>
					<h1 className="text-xl font-semibold">Demo session unavailable</h1>
					<p className="mt-2 max-w-lg text-sm text-slate-600">{error}</p>
				</div>
			</main>
		);
	}
	if (!token) {
		return (
			<div className="min-h-screen bg-[#f7faf9] p-10" aria-busy="true">
				<div className="mx-auto h-32 max-w-6xl animate-pulse rounded-2xl bg-slate-100" />
			</div>
		);
	}
	return (
		<ConvexPlatformProvider
			demoSessionToken={token}
			onSwitchDemoMember={async (membershipId) => {
				await switchMembership({
					token,
					membershipId: membershipId as Id<"memberships">,
				});
			}}
		>
			{children}
		</ConvexPlatformProvider>
	);
}

function ClerkConvexBridge({ children }: { children: React.ReactNode }) {
	const client = useMemo(
		() => new ConvexReactClient(runtimeConfig.convexUrl),
		[],
	);

	return (
		<ConvexProviderWithClerk client={client} useAuth={useAuth}>
			{children}
		</ConvexProviderWithClerk>
	);
}
