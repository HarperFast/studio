import { Badge } from '@/components/ui/badge';

/**
 * Small "Last used" pill anchored to the top-right corner of an OAuth button. Render it inside a
 * `relative` wrapper that is a sibling of the button — the buttons themselves use `overflow: hidden`,
 * which would otherwise clip the badge. A solid background keeps it legible on both the light Google
 * button and the dark GitHub button.
 */
export function LastUsedBadge() {
	return (
		<Badge className="pointer-events-none absolute -top-2 right-3 z-10 rounded-full border-primary bg-primary px-1.5 py-0 text-[10px] font-medium text-white shadow-sm">
			Last used
		</Badge>
	);
}
