import { DiscordLogo } from '@/components/DiscordLogo';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { type SubNavItem, SubNavRail } from '@/components/SubNavRail';
import { BookOpenText, Rocket } from 'lucide-react';
import './SectionRail.css';

export function SectionRail({ items, ariaLabel }: { items: SubNavItem[]; ariaLabel: string }) {
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
					<Rocket className="mb-3 size-5 text-primary dark:text-violet-300" aria-hidden="true" />
					<p className="text-sm font-semibold">Need help?</p>
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
						</a>
					</div>
				</section>
			</div>
		</div>
	);
}
