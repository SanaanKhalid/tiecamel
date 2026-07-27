import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useMemo } from "react";
import { clientConfig, runtimeConfig } from "../config/client";
import { ConvexPlatformProvider } from "../platform/convex-store";
import { PlatformProvider } from "../platform/store";

export function RuntimeProviders({ children }: { children: React.ReactNode }) {
	if (clientConfig.demoMode || !clientConfig.authConfigured) {
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
