import { Kbd, KbdGroup } from "@/components/v1-xulux/ui/kbd";
import { SidebarTrigger } from "@/components/v1-xulux/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v1-xulux/ui/tooltip";
import { cn } from "@/lib/utils";

export function CustomSidebarTrigger({
	className,
}: {
	className?: string;
}) {
	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<SidebarTrigger className={cn(className)} />
			</TooltipTrigger>
			<TooltipContent className="px-2 py-1" side="right">
				Toggle Sidebar{" "}
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>b</Kbd>
				</KbdGroup>
			</TooltipContent>
		</Tooltip>
	);
}
