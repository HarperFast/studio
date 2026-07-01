import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { Link, useLocation } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { ComponentType } from 'react';

export interface SubNavSubItem {
	to: string;
	label: string;
	exact?: boolean;
}

export interface SubNavItem {
	to: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	exact?: boolean;
	children?: SubNavSubItem[];
}

const linkClasses = 'flex items-center gap-3 p-2 rounded-lg text-sm transition-colors';
const subLinkClasses = 'block p-2 rounded-lg text-sm transition-colors';
const inactiveProps = { className: 'text-foreground hover:bg-accent dark:text-white dark:hover:bg-grey-700' };
const activeProps = { className: 'font-medium text-primary bg-primary/10 dark:text-white dark:bg-white/10' };

/**
 * Responsive section rail shared by the org and cluster page layouts: a vertical left rail when
 * there's room, a dropdown when small. A section with sub-items expands them underneath when it's the
 * active section (desktop) or as indented items in the dropdown (small).
 */
export function SubNavRail({ items, ariaLabel }: { items: SubNavItem[]; ariaLabel: string }) {
	const { pathname } = useLocation();
	const isSectionActive = (item: SubNavItem) => item.exact ? pathname === item.to : pathname.startsWith(item.to);
	const active = items.find(isSectionActive) ?? items[0];
	const ActiveIcon = active.icon;

	return (
		<>
			<nav className="hidden md:flex flex-col gap-1" aria-label={ariaLabel}>
				{items.map((item) => {
					const Icon = item.icon;
					return (
						<div key={item.to}>
							<Link
								to={item.to}
								className={linkClasses}
								activeOptions={{ exact: !!item.exact }}
								activeProps={activeProps}
								inactiveProps={inactiveProps}
							>
								<Icon className="size-4 shrink-0" />
								{item.label}
							</Link>
							{item.children && isSectionActive(item) && (
								<div className="mt-1 ml-4 flex flex-col gap-1 border-l border-border pl-3">
									{item.children.map((child) => (
										<Link
											key={child.to}
											to={child.to}
											className={subLinkClasses}
											activeOptions={{ exact: !!child.exact }}
											activeProps={activeProps}
											inactiveProps={inactiveProps}
										>
											{child.label}
										</Link>
									))}
								</div>
							)}
						</div>
					);
				})}
			</nav>

			<div className="md:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="w-full justify-between">
							<span className="flex items-center gap-2">
								<ActiveIcon className="size-4" />
								{active.label}
							</span>
							<ChevronDown className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
						{items.map((item) => {
							const Icon = item.icon;
							return [
								<DropdownMenuItem key={item.to} asChild>
									<Link to={item.to} className="flex items-center gap-2">
										<Icon className="size-4" />
										{item.label}
									</Link>
								</DropdownMenuItem>,
								...(item.children && isSectionActive(item)
									? item.children.map((child) => (
										<DropdownMenuItem key={child.to} asChild>
											<Link to={child.to} className="flex items-center gap-2 pl-8">
												{child.label}
											</Link>
										</DropdownMenuItem>
									))
									: []),
							];
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
