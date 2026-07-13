import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

// Versioned key — bump the suffix to re-show the tip after a major UX
// change (e.g. when we add a new keyboard shortcut or remove an existing
// one). Past dismissals at older versions are ignored on purpose.
const STORAGE_KEY = 'studio:analytics:onboarding-dismissed:v1';

/** First-visit hint explaining the chart interactions that aren't visually
 *  discoverable: click a legend entry to solo a node, ⌘/Ctrl-click to
 *  multi-select, and click a storage bar segment to pin its table's trend.
 *  Dismissal is persisted to localStorage so it doesn't reappear. */
export function AnalyticsOnboardingHint() {
	const [dismissed, setDismissed] = useState<boolean | null>(null);

	useEffect(() => {
		try {
			setDismissed(window.localStorage.getItem(STORAGE_KEY) === '1');
		} catch {
			setDismissed(true);
		}
	}, []);

	if (dismissed !== false) { return null; }

	const onDismiss = () => {
		try {
			window.localStorage.setItem(STORAGE_KEY, '1');
		} catch {
			// ignore — dismissal will replay next visit but the hint is harmless
		}
		setDismissed(true);
	};

	return (
		<div
			role="status"
			className="mb-3 flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
		>
			<div className="flex-1 min-w-0">
				<span className="font-medium text-foreground">Tip:</span>
				{' Click a legend entry to isolate one node, '}
				<kbd className="rounded border border-border px-1 py-0.5 text-xs">⌘</kbd>
				{' / '}
				<kbd className="rounded border border-border px-1 py-0.5 text-xs">Ctrl</kbd>
				{"-click to compare a few. In the storage charts, click a bar segment to pin that table's trend."}
			</div>
			<Button
				variant="ghost"
				size="icon"
				onClick={onDismiss}
				aria-label="Dismiss tip"
				className="-mt-1 h-7 w-7 shrink-0"
			>
				<X className="h-4 w-4" />
			</Button>
		</div>
	);
}
