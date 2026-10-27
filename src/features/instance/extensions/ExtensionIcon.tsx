import { PuzzleIcon } from 'lucide-react';
import { DynamicIcon, IconName, iconNames } from 'lucide-react/dynamic';

const knownIcons = new Set<string>(iconNames);

/**
 * A component's icon by Lucide name. Each icon is its own lazily loaded chunk, so naming any of
 * Lucide's icons costs Studio's bundle nothing; an unknown name draws a puzzle piece rather than a gap.
 */
export function ExtensionIcon({ name, className }: { name: string | undefined; className?: string }) {
	if (!name || !knownIcons.has(name)) {
		return <PuzzleIcon className={className} />;
	}
	// The fallback also covers the chunk's load, so it holds the icon's space rather than flashing a puzzle.
	return (
		<DynamicIcon
			name={name as IconName}
			className={className}
			fallback={() => <svg className={className} width={24} height={24} aria-hidden />}
		/>
	);
}
