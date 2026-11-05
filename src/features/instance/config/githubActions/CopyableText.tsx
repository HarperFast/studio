import { Button } from '@/components/ui/button';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { CopyIcon } from 'lucide-react';

/** A value to paste somewhere else, such as a repository variable, with a button that copies it. */
export function CopyableValue({ value, label }: { value: string; label: string }) {
	const copy = useCopyTextToClipboard();
	return (
		<div className="mt-2 flex items-center gap-2">
			<code className="break-all font-mono">{value}</code>
			<Button size="sm" variant="defaultOutline" onClick={() => copy(value)}>
				<CopyIcon />
				<span className="sr-only">{label}</span>
			</Button>
		</div>
	);
}

/** A file to commit, shown whole, with a button that copies it. */
export function CopyableBlock({ text, label }: { text: string; label: string }) {
	const copy = useCopyTextToClipboard();
	return (
		<div className="relative mt-2">
			<Button className="absolute top-2 right-2" size="sm" variant="defaultOutline" onClick={() => copy(text)}>
				<CopyIcon />
				<span className="sr-only">{label}</span>
			</Button>
			<pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
				<code>{text}</code>
			</pre>
		</div>
	);
}
