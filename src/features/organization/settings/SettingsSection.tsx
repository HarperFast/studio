import { cn } from '@/lib/cn';
import { ReactNode, useId } from 'react';

export function SettingsSection(
	{ title, actions, children, bodyClassName }: {
		title: string;
		actions?: ReactNode;
		children: ReactNode;
		bodyClassName?: string;
	},
) {
	const headingId = useId();
	return (
		<section aria-labelledby={headingId} className="rounded-lg border bg-card text-foreground">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
				<h3 id={headingId} className="text-lg font-medium">{title}</h3>
				{actions}
			</div>
			<div className={cn('p-4', bodyClassName)}>{children}</div>
		</section>
	);
}
