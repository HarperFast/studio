import { DiscordLogo } from '@/components/DiscordLogo';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { type SubNavItem, SubNavRail } from '@/components/SubNavRail';
import { BookOpenText, ChevronDown, ChevronUp, Rocket } from 'lucide-react';
import { useId, useState } from 'react';
import './SectionRail.css';

const HELP_MINIMIZED_KEY = 'studio:sidebar-help:minimized:v1';

export function SectionRail({ items, ariaLabel }: { items: SubNavItem[]; ariaLabel: string }) {
	const [minimized, setMinimized] = useState(() => {
		try {
			return window.localStorage.getItem(HELP_MINIMIZED_KEY) === '1';
		} catch {
			return false;
		}
	});
	const contentId = useId();
	const toggleHelp = () => {
		const next = !minimized;
		setMinimized(next);
		try {
			window.localStorage.setItem(HELP_MINIMIZED_KEY, next ? '1' : '0');
		} catch {
			// Keep the control usable when browser storage is unavailable.
		}
	};
	return (
		<div className="section-rail">
			<div className="section-rail-navigation">
				<OrganizationSwitcher />
				<SubNavRail items={items} ariaLabel={ariaLabel} />
			</div>
			<div className="section-rail-help-space">
				<section
					aria-label="Need help?"
					className="section-rail-help rounded-xl border border-primary/25 bg-linear-to-br from-primary/15 via-card/50 to-card/30 p-4 shadow-sm"
				>
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Rocket className="size-5 text-primary dark:text-violet-300" aria-hidden="true" />
							<p className="text-sm font-semibold">Need help?</p>
						</div>
						<button
							type="button"
							onClick={toggleHelp}
							aria-label={minimized ? 'Expand help card' : 'Minimize help card'}
							aria-expanded={!minimized}
							aria-controls={contentId}
							className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						>
							{minimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
						</button>
					</div>
					<div id={contentId} hidden={minimized}>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							Explore the docs or join our community on Discord.
						</p>
						<div className="mt-4 flex flex-wrap gap-x-4 gap-y-3 text-xs font-medium">
							<a
								href="https://docs.harperdb.io/docs"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
							>
								<BookOpenText className="size-3.5" />View docs
								<span className="sr-only">(opens in a new tab)</span>
							</a>
							<a
								href="https://discord.gg/VzZuaw3Xay"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
							>
								<span className="[&_svg]:size-3.5">
									<DiscordLogo />
								</span>Join Discord
								<span className="sr-only">(opens in a new tab)</span>
							</a>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
