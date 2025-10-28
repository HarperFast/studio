import { ClipboardCheckIcon } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

export function useCopyToClipboard(...texts: string[]): Array<() => void> {
	return useMemo(() => {
		return texts.map(text => (() => {
			void navigator.clipboard.writeText(text);
			toast.info('Copied to clipboard!', {
				icon: <ClipboardCheckIcon />,
				duration: 1000,
			});
		}));
		// We can override the linting here because we know we're providing an accurate list of dependencies that will only
		// change and trigger a re-render of the memo when the text contents change.
		// eslint-disable-next-line react-hooks/use-memo,react-hooks/exhaustive-deps
	}, texts);
}
