/**
 * A tiny external store for the editor command keyboard-shortcut labels shown in
 * the Edit / Go menus.
 *
 * The labels are read from Monaco's keybinding registry once the editor mounts
 * (in `TextEditorView`) and consumed by the toolbar (`ContentActions`). Those
 * two components mount independently, so a one-shot event would race. Holding
 * the value here — persisted and read on every render via `useSyncExternalStore`
 * — makes the hand-off order-independent: whoever reads last sees the value.
 */
import { useSyncExternalStore } from 'react';

let labels: Record<string, string> = {};
const subscribers = new Set<() => void>();

export function setEditorShortcutLabels(next: Record<string, string>): void {
	labels = next;
	for (const notify of subscribers) {
		notify();
	}
}

function subscribe(notify: () => void): () => void {
	subscribers.add(notify);
	return () => {
		subscribers.delete(notify);
	};
}

/** Map of editor action id -> platform shortcut label (e.g. `⌘F`), reactive. */
export function useEditorShortcutLabels(): Record<string, string> {
	return useSyncExternalStore(subscribe, () => labels);
}
