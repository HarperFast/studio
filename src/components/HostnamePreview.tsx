import { LockKeyhole } from 'lucide-react';

export function HostnamePreview(
	{ hostname, testId, describedBy }: { hostname: string; testId?: string; describedBy?: string },
) {
	return (
		<div className="flex min-w-0 items-center gap-3 rounded-full border border-border/60 bg-background/70 px-4 py-3 shadow-inner">
			<LockKeyhole className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<p
				className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs leading-5"
				data-testid={testId}
				aria-describedby={describedBy}
				tabIndex={0}
			>
				{hostname}
			</p>
		</div>
	);
}
