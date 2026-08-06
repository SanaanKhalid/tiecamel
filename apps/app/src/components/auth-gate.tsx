import { Show, SignInButton, SignUpButton } from "@clerk/tanstack-react-start";
import { ShieldCheck, Users } from "lucide-react";
import { clientConfig } from "../config/client";

export function AuthGate({ children }: { children: React.ReactNode }) {
	if (clientConfig.demoMode || !clientConfig.authConfigured) return children;

	return (
		<>
			<Show when="signed-in">{children}</Show>
			<Show when="signed-out">
				<SignInScreen />
			</Show>
		</>
	);
}

function SignInScreen() {
	return (
		<main className="grid min-h-screen place-items-center bg-[#f3f5f1] px-6 py-12 text-slate-950">
			<section className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_rgba(15,23,42,0.12)] sm:p-10">
				<div className="mb-8 flex items-center justify-between">
					<div className="size-12 overflow-hidden">
						<img
							className="size-full scale-125 object-cover"
							src="/tiecamel-logo.png"
							alt="TieCamel"
						/>
					</div>
					<span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
						<ShieldCheck className="size-3.5" /> Secure access
					</span>
				</div>
				<p className="text-xs font-bold tracking-[0.18em] text-teal-700 uppercase">
					{clientConfig.shortName}
				</p>
				<h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
					Shared accountability starts with verified access.
				</h1>
				<p className="mt-4 leading-7 text-slate-600">
					Sign in to manage repository issues, review proposed records, and
					follow every accepted change through its audit history.
				</p>
				<div className="mt-8 grid gap-3 sm:grid-cols-2">
					<SignInButton mode="modal">
						<button
							type="button"
							className="rounded-xl bg-teal-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
						>
							Sign in
						</button>
					</SignInButton>
					<SignUpButton mode="modal">
						<button
							type="button"
							className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
						>
							Request access
						</button>
					</SignUpButton>
				</div>
				<div className="mt-7 flex items-center gap-3 border-t border-slate-100 pt-6 text-sm text-slate-500">
					<Users className="size-4 text-teal-700" /> Access is scoped to your
					organization and assigned role.
				</div>
			</section>
		</main>
	);
}
