import { badgeVariants } from '@/components/ui/badgeVariants';
import { cn } from '@/lib/cn';

export function Version() {
	let studioVersion = import.meta.env.VITE_STUDIO_VERSION;
	const link = studioVersion?.startsWith('v')
		? `https://github.com/HarperFast/studio/releases/tag/${studioVersion}`
		: 'https://github.com/HarperFast/studio/releases';
	return (
		<a href={link} target="_blank" rel="noopener noreferrer">
			<span className={cn(badgeVariants({ variant: 'default' }), 'text-xs inline-block ml-2 align-text-top')}>
				{studioVersion} BETA
			</span>
		</a>
	);
}
