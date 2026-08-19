import { HttpMethod } from '@/features/instance/apis/explorer/types';
import { cn } from '@/lib/cn';

// Method colors use the design-system palette tokens (src/index.css), not a bespoke scheme.
const METHOD_CLASSES: Record<HttpMethod, string> = {
	get: 'text-blue border-blue/40 bg-blue/10',
	post: 'text-green border-green/40 bg-green/10',
	put: 'text-yellow border-yellow/40 bg-yellow/10',
	patch: 'text-pink border-pink/40 bg-pink/10',
	delete: 'text-red border-red/40 bg-red/10',
	options: 'text-muted-foreground border-border bg-muted',
	head: 'text-muted-foreground border-border bg-muted',
	trace: 'text-muted-foreground border-border bg-muted',
};

export function MethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center justify-center rounded-md border font-mono text-[0.68rem] font-bold uppercase tracking-wide',
				'min-w-14 px-1.5 py-0.5',
				METHOD_CLASSES[method],
				className,
			)}
		>
			{method}
		</span>
	);
}
