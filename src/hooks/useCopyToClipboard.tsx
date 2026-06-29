import { ClipboardCheckIcon } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

/**
 * The single guarded entry point for writing to the clipboard. `navigator.clipboard` is
 * undefined in non-secure contexts (HTTP on a non-localhost host) and old browsers, where
 * touching `.writeText` would throw — so every clipboard write in the app funnels through
 * here. `writeText` is also async and can reject (e.g. permission denied, document not
 * focused), so we await it and only resolve `true` on a confirmed success — surfacing an
 * error toast and resolving `false` otherwise, so callers can skip their own success toast.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
	if (!navigator.clipboard) {
		toast.error('Clipboard access is not available in this environment.');
		return false;
	}
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		toast.error('Failed to copy to clipboard.');
		return false;
	}
}

/** Copy text and show the standard confirmation toast only once the write actually succeeds. */
function copyWithToast(text: string): void {
	void writeToClipboard(text).then(succeeded => {
		if (succeeded) {
			toast.info('Copied to clipboard!', { icon: <ClipboardCheckIcon />, duration: 1000 });
		}
	});
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
