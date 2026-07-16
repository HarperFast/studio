/**
 * A thin, dismissible notice shown above the code editor when the editor has
 * silently degraded its language features to stay responsive
 * (HarperFast/studio#1504). Two modes exist, both otherwise invisible:
 *
 *   - `budget`: the session-wide automatic type-acquisition budget is spent, so
 *     further packages report a spurious "cannot find module"
 *     (see `typeAcquisition.ts` / `ExtraLibBudget`).
 *   - `oversized`: the open file is over `MAX_WORKER_MODEL_CHARS`, so it renders
 *     as plaintext with no highlighting or IntelliSense.
 *
 * Non-blocking and dismissible (the caller owns the dismissed state so it can
 * reset per file/mode); announced via `role="status"` / `aria-live="polite"`
 * rather than a purely visual cue.
 */
import { InfoIcon, TriangleAlertIcon, XIcon } from 'lucide-react';

export type IntelliSenseDegradation = 'budget' | 'oversized';

const MESSAGES: Record<IntelliSenseDegradation, string> = {
	budget:
		'Type information is limited to keep the editor responsive — this application references more packages than the editor can load, so some imports may show “cannot find module.”',
	oversized: 'This file is large, so it’s shown as plain text without language features.',
};

export interface DegradedIntelliSenseBannerProps {
	variant: IntelliSenseDegradation;
	onDismiss: () => void;
}

export function DegradedIntelliSenseBanner({
	variant,
	onDismiss,
}: DegradedIntelliSenseBannerProps) {
	const Icon = variant === 'oversized' ? InfoIcon : TriangleAlertIcon;
	return (
		<div
			role="status"
			aria-live="polite"
			// `mt-9` (36px) clears the `ContentActions` toolbar, which overlays the top
			// of the editor pane — the same offset the other pane views (`mt-9`) use.
			className="mt-9 flex items-start gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-foreground"
		>
			<Icon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
			<span className="flex-1">{MESSAGES[variant]}</span>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Dismiss notice"
				className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
			>
				<XIcon className="size-4" aria-hidden />
			</button>
		</div>
	);
}
