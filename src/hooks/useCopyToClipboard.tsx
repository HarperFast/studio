import { ClipboardCheckIcon } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

/**
 * The single guarded entry point for writing to the clipboard. `navigator.clipboard` is
 * undefined in non-secure contexts (HTTP on a non-localhost host) and old browsers, where
 * touching `.writeText` would throw — so every clipboard write in the app funnels through
 * here. Returns `false` (after surfacing an error toast) when the API is unavailable, so
 * callers can skip their own success toast.
 */
export function writeToClipboard(text: string): boolean {
	if (!navigator.clipboard) {
		toast.error('Clipboard access is not available in this environment.');
		return false;
	}
	void navigator.clipboard.writeText(text);
	return true;
}

/** Copy text and show the standard confirmation toast. */
function copyWithToast(text: string): void {
	if (writeToClipboard(text)) {
		toast.info('Copied to clipboard!', { icon: <ClipboardCheckIcon />, duration: 1000 });
	}
}

/** One copy-with-toast callback per fixed text — e.g. a row of static values. */
export function useCopyToClipboard(...texts: string[]): Array<() => void> {
	return useMemo(() => {
		return texts.map(text => () => copyWithToast(text));
		// We can override the linting here because we know we're providing an accurate list of dependencies that will only
		// change and trigger a re-render of the memo when the text contents change.
		// eslint-disable-next-line react-hooks/use-memo,react-hooks/exhaustive-deps
	}, texts);
}

/** A single stable callback that copies whatever text you pass at call time — e.g. a right-clicked entry. */
export function useCopyTextToClipboard(): (text: string) => void {
	return copyWithToast;
}
