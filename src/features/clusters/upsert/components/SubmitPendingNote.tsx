import { cn } from '@/lib/cn';

// Central manager answers a dedicated create or scale-up only after the cloud provider has created the
// hosts, about 30 seconds on GCP; without this the clicked button looks dead for that long.
export function SubmitPendingNote({ isPending, dedicated, className }: {
	readonly isPending: boolean;
	readonly dedicated: boolean;
	readonly className?: string;
}) {
	if (!isPending || !dedicated) { return null; }
	return (
		<p role="status" className={cn('text-sm text-muted-foreground', className)}>
			Setting up dedicated hosts. This can take about 30 seconds.
		</p>
	);
}
