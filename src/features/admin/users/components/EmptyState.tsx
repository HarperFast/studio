import { ReactNode } from 'react';

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
			<span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary dark:text-violet-200 [&>svg]:size-5">
				{icon}
			</span>
			<h2 className="mt-4 font-medium">{title}</h2>
			<p className="mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
		</div>
	);
}
