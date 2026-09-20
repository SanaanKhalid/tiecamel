import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { useRouterState } from "@tanstack/react-router";
import {
	ConvexProvider,
	ConvexReactClient,
	useMutation,
	useQuery,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
	clientConfig,
	operationalTestConfigured,
	operationalTestMode,
	publicDemoMode,
	runtimeConfig,
} from "../config/client";
import { ConvexPlatformProvider } from "../platform/convex-store";
import { PlatformProvider } from "../platform/store";
import { PublicDemoBoundary } from "./public-demo-boundary";

export function RuntimeProviders({ children }: { children: React.ReactNode }) {
	if (operationalTestMode) {
		return (
			<>
				<aside
					role="note"
					className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-950"
				>
					Operational test pilot — test identities, persistent records and real
					configured services. Use synthetic documents only. Alerts are
					recipient-restricted. Not for real nonprofit operations; critical
					closure remains disabled.
				</aside>
				{operationalTestConfigured ? (
					<ConfiguredRuntimeProviders>{children}</ConfiguredRuntimeProviders>
				) : (
					<main className="p-8" role="alert">
						Test pilot unavailable: development sign-in and backend
						configuration are required. No sample workspace has been
						substituted.
					</main>
				)}
			</>
		);
	}
	return <ConfiguredRuntimeProviders>{children}</ConfiguredRuntimeProviders>;
}

function ConfiguredRuntimeProviders({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	if (publicDemoMode) {
		return (
			<PlatformProvider>
				<PublicDemoBoundary pathname={pathname}>{children}</PublicDemoBoundary>
			</PlatformProvider>
		);
	}
	if (import.meta.env.DEV && pathname === "/dev/approval-review")
		return <>{children}</>;
	if (pathname.startsWith("/public/") || pathname.startsWith("/verify/")) {
		return clientConfig.convexConfigured ? (
			<PublicConvexBridge>{children}</PublicConvexBridge>
		) : (
			<>{children}</>
		);
	}
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

function PublicConvexBridge({ children }: { children: React.ReactNode }) {
	const client = useMemo(
		() => new ConvexReactClient(runtimeConfig.convexUrl),
		[],
	);
	return <ConvexProvider client={client}>{children}</ConvexProvider>;
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
	const valid = useQuery(api.demoSessions.validate, token ? { token } : "skip");
	const starting = useRef(false);
	useEffect(() => {
		const stored = window.localStorage.getItem("tiecamel:demo-session");
		if (stored) {
			setToken(stored);
			return;
		}
		if (starting.current) return;
		starting.current = true;
		void start({ organizationSlug: `demo-${crypto.randomUUID()}` })
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
	useEffect(() => {
		if (valid !== false) return;
		window.localStorage.removeItem("tiecamel:demo-session");
		setError(
			"This demo session expired or was replaced by isolated demo workspaces. Start a fresh demonstration to continue.",
		);
	}, [valid]);
	if (error) {
		return (
			<main className="grid min-h-screen place-items-center p-8 text-center">
				<div>
					<h1 className="text-xl font-semibold">Demo session unavailable</h1>
					<p className="mt-2 max-w-lg text-sm text-slate-600">{error}</p>
					<button
						type="button"
						className="mt-4 rounded-lg border px-4 py-2"
						onClick={() => {
							window.localStorage.removeItem("tiecamel:demo-session");
							window.location.reload();
						}}
					>
						Start a fresh demo
					</button>
				</div>
			</main>
		);
	}
	if (!token || valid !== true) {
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
