/**
 * A copyable, syntax-free code snippet showing how a component reads a secret of a given delivery
 * tier. The example is name-aware (dot vs bracket access) — see {@link buildSecretAccessExample}.
 */
import { Button } from '@/components/ui/button';
import { writeToClipboard } from '@/hooks/useCopyToClipboard';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSecretAccessExample, SecretTier } from './accessExample';

export function SecretAccessExample({ name, tier }: { name: string; tier: SecretTier }) {
	const code = buildSecretAccessExample(name, tier);

	const [copied, setCopied] = useState(false);
	const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(resetTimer.current), []);

	const onCopy = useCallback(() => {
		void writeToClipboard(code).then((ok) => {
			if (!ok) {
				return;
			}
			setCopied(true);
			clearTimeout(resetTimer.current);
			resetTimer.current = setTimeout(() => setCopied(false), 1200);
		});
	}, [code]);

	return (
		<div className="relative">
			<pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 pr-10 text-xs leading-relaxed">
				<code className="font-mono text-foreground">{code}</code>
			</pre>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="absolute top-1.5 right-1.5 px-1"
				onClick={onCopy}
				title="Copy example"
			>
				{copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
				<span className="sr-only">Copy example</span>
			</Button>
		</div>
	);
}
