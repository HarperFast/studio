import { badgeVariants } from '@/components/ui/badgeVariants';
import { cn } from '@/lib/cn';

export function Version() {
	return (<a href="https://github.com/HarperFast/studio/releases" target="_blank" rel="noopener noreferrer">
		<span className={cn(badgeVariants({ variant: 'default' }), 'text-xs inline-block ml-2 align-text-top')}>
			{import.meta.env.VITE_STUDIO_VERSION} BETA</span>
	</a>);
}
