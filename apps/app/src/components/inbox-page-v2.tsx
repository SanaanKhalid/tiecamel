import {
	Bell,
	Check,
	CircleDot,
	Clock3,
	FileDiff,
	UserPlus,
} from "lucide-react";
import { usePlatform } from "../platform/store";
import { relativeDate } from "./platform-ui";

export function InboxPageV2() {
	const platform = usePlatform();
	const unread = platform.notifications.filter((item) => !item.read);

	return (
		<div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
			<div className="flex items-end justify-between border-b border-[#d0d7de] pb-5">
				<div>
					<h1 className="text-2xl font-semibold">Inbox</h1>
					<p className="mt-1 text-sm text-[#656d76]">
						Review requests, assignments, mentions, deadlines, and accepted
						records.
					</p>
				</div>
				<span className="rounded-full bg-[#ddf4ff] px-2.5 py-1 text-xs font-semibold text-[#0969da]">
					{unread.length} unread
				</span>
			</div>

			<div className="mt-5 overflow-hidden rounded-md border border-[#d0d7de] bg-white">
				{platform.notifications.map((notification) => {
					const repository = platform.repositories.find(
						(item) => item.id === notification.repositoryId,
					);
					const Icon =
						notification.type === "review"
							? FileDiff
							: notification.type === "deadline"
								? Clock3
								: notification.type === "assignment"
									? UserPlus
									: notification.type === "merge"
										? Check
										: Bell;
					return (
						<button
							key={notification.id}
							type="button"
							onClick={() => platform.markNotificationRead(notification.id)}
							className={`flex w-full items-start gap-4 border-b border-[#d8dee4] p-4 text-left last:border-b-0 hover:bg-[#f6f8fa] ${
								notification.read ? "" : "bg-[#ddf4ff]/30"
							}`}
						>
							<span
								className={`grid size-9 shrink-0 place-items-center rounded-full ${
									notification.read
										? "bg-[#eaeef2] text-[#656d76]"
										: "bg-[#ddf4ff] text-[#0969da]"
								}`}
							>
								<Icon className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="font-semibold">{notification.title}</h2>
									<span className="text-xs font-semibold text-[#656d76]">
										{repository?.name}
									</span>
									{!notification.read && (
										<CircleDot className="size-3 fill-[#0969da] text-[#0969da]" />
									)}
								</div>
								<p className="mt-1 text-sm text-[#656d76]">
									{notification.body}
								</p>
								<p className="mt-2 text-xs text-[#8c959f]">
									{relativeDate(notification.createdAt)}
								</p>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
