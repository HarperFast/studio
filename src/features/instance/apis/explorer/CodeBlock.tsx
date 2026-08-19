import { Button } from '@/components/ui/button';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/cn';
import { CopyIcon } from 'lucide-react';

// Read-only code/JSON with a copy button — deliberately not Monaco, so many on a page stay cheap.
export function CodeBlock({
	code,
	className,
	label,
	maxHeightClassName = 'max-h-96',
}: {
	code: string;
	className?: string;
	label?: string;
	maxHeightClassName?: string;
}) {
	const copy = useCopyTextToClipboard();
	return (
		<div className={cn('group bg-muted/60 relative rounded-md border', className)}>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={label ? `Copy ${label}` : 'Copy to clipboard'}
				className="absolute top-1.5 right-1.5 z-10 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
				onClick={() => copy(code)}
			>
				<CopyIcon className="size-3.5" />
			</Button>
			<pre className={cn('overflow-auto p-3 text-xs leading-relaxed', maxHeightClassName)}>
				<code className="font-mono">{code}</code>
			</pre>
		</div>
	);
}
