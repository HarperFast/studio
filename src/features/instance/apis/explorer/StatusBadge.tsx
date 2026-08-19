import { cn } from '@/lib/cn';
import { ReactNode } from 'react';

/** For a non-numeric / unknown status such as an OpenAPI `default` response key. */
export const STATUS_UNKNOWN_CLASS = 'text-muted-foreground border-border bg-muted';

// Shared by the docs response list and the try-it-out response badge so the two never drift.
export function httpStatusColorClass(status: number): string {
	if (!Number.isFinite(status) || status <= 0) {
		return 'text-red border-red/40 bg-red/10';
	}
	if (status < 300) {
		return 'text-green border-green/40 bg-green/10';
	}
	if (status < 400) {
		return 'text-blue border-blue/40 bg-blue/10';
	}
	if (status < 500) {
		return 'text-yellow border-yellow/40 bg-yellow/10';
	}
	return 'text-red border-red/40 bg-red/10';
}

export function StatusBadge({ colorClass, children }: { colorClass: string; children: ReactNode }) {
	return (
		<span className={cn('rounded-md border px-2 py-0.5 font-mono text-xs font-bold', colorClass)}>
			{children}
		</span>
	);
}
