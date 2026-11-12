import { PuzzleIcon } from 'lucide-react';
import type { IconName } from 'lucide-react/dynamic';
import { lazy, Suspense } from 'react';

interface NamedIconProps {
	name: string;
	className?: string;
}

/**
 * Lucide's dynamic module maps every icon name to its own chunk, about 2,300 entries, and pages that only
 * might show a component's icon (the cluster list, the create form, Config) import this file. So the map
 * loads with the first named icon drawn, not with those pages.
 */
const NamedIcon = lazy(() =>
	import('lucide-react/dynamic').then(
		({ DynamicIcon, iconNames }) => {
			const known = new Set<string>(iconNames);
			function KnownOrPuzzleIcon({ name, className }: NamedIconProps) {
				if (!known.has(name)) {
					return <PuzzleIcon className={className} />;
				}
				// The fallback also covers the icon's own chunk, so it holds the space rather than flashing a puzzle.
				return (
					<DynamicIcon
						name={name as IconName}
						className={className}
						fallback={() => <IconSpace className={className} />}
					/>
				);
			}
			return { default: KnownOrPuzzleIcon };
		},
		// A map that fails to load (a stale deploy's chunk) draws the puzzle, as an unknown name does, rather
		// than throwing to the route's error boundary over an icon.
		() => ({ default: ({ className }: NamedIconProps) => <PuzzleIcon className={className} /> }),
	)
);

function IconSpace({ className }: { className?: string }) {
	return <svg className={className} width={24} height={24} aria-hidden />;
}

/**
 * A component's icon by Lucide name. Each icon is its own lazily loaded chunk, so naming any of
 * Lucide's icons costs Studio's bundle nothing; an unknown name draws a puzzle piece rather than a gap.
 */
export function ExtensionIcon({ name, className }: { name: string | undefined; className?: string }) {
	if (!name) {
		return <PuzzleIcon className={className} />;
	}
	return (
		<Suspense fallback={<IconSpace className={className} />}>
			<NamedIcon name={name} className={className} />
		</Suspense>
	);
}
