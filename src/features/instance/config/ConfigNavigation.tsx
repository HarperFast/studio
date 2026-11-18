import { navigationActiveProps, navigationInactiveProps, navigationLinkClasses } from '@/components/navigationStyles';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Link, useMatchRoute } from '@tanstack/react-router';
import { CheckIcon, ChevronDownIcon, SettingsIcon } from 'lucide-react';
import { Fragment, type ReactNode, useId } from 'react';

interface ConfigMenuEntry {
	name: string;
	to: string;
	icon: ReactNode;
	exact?: boolean;
}

export interface ConfigMenuGroup {
	label?: string;
	entries: ConfigMenuEntry[];
}

export function ConfigNavigation({ groups, atIndex }: { groups: ConfigMenuGroup[]; atIndex: boolean }) {
	const matchRoute = useMatchRoute();
	const id = useId();
	const active = groups.flatMap(group => group.entries).find(({ to, exact }) =>
		exact ? atIndex : matchRoute({ to, fuzzy: true, includeSearch: false, caseSensitive: true }) !== false
	);
	const currentPage = active?.name ?? 'Choose a page';

	return (
		<>
			<nav className="config-navigation-sidebar" aria-label="Configuration pages">
				<div className="mb-3 flex items-center gap-2 px-3 py-1 text-sm font-semibold">
					<SettingsIcon className="size-4 text-muted-foreground" aria-hidden="true" />
					Configuration
				</div>
				{groups.map((group, index) => (
					<div key={group.label ?? 'overview'} className={index > 0 ? 'mt-4' : undefined}>
						{group.label && (
							<p id={`${id}-${index}`} className="mb-1 px-3 text-xs font-semibold text-muted-foreground">
								{group.label}
							</p>
						)}
						<ul className="space-y-0.5" aria-labelledby={group.label ? `${id}-${index}` : undefined}>
							{group.entries.map(entry => (
								<li key={entry.to}>
									<Link
										to={entry.to}
										className={navigationLinkClasses}
										activeOptions={{ exact: entry.exact, includeSearch: false }}
										activeProps={navigationActiveProps}
										inactiveProps={navigationInactiveProps}
									>
										<ConfigLinkLabel entry={entry} />
									</Link>
								</li>
							))}
						</ul>
					</div>
				))}
			</nav>

			<nav className="config-navigation-compact" aria-label="Configuration page picker">
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							className="h-auto min-h-11 w-full justify-between gap-3 py-2"
							aria-label={`Configuration ${currentPage}`}
						>
							<span className="flex min-w-0 items-center gap-3 text-left">
								<SettingsIcon className="size-4 shrink-0 text-primary dark:text-white" aria-hidden="true" />
								<span className="min-w-0">
									<span className="block text-xs text-muted-foreground">Configuration</span>
									<span className="block truncate font-semibold">{currentPage}</span>
								</span>
							</span>
							<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" hideWhenDetached className="w-(--radix-dropdown-menu-trigger-width)">
						{groups.map((group, index) => (
							<Fragment key={group.label ?? 'overview'}>
								{index > 0 && <DropdownMenuSeparator />}
								<DropdownMenuGroup aria-label={group.label}>
									{group.label && (
										<DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
									)}
									{group.entries.map(entry => (
										<DropdownMenuItem key={entry.to} asChild>
											<Link
												to={entry.to}
												className="min-h-10 gap-2"
												activeOptions={{ exact: entry.exact, includeSearch: false }}
												activeProps={navigationActiveProps}
											>
												<ConfigLinkLabel entry={entry} />
												<CheckIcon
													className="invisible ml-auto shrink-0 [[aria-current=page]>&]:visible"
													aria-hidden="true"
												/>
											</Link>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
							</Fragment>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</nav>
		</>
	);
}

function ConfigLinkLabel({ entry }: { entry: ConfigMenuEntry }) {
	return (
		<>
			<span className="shrink-0 [&_svg]:size-4" aria-hidden="true">{entry.icon}</span>
			<span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{entry.name}</span>
		</>
	);
}
