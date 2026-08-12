/**
 * Cross-file code navigation for the Applications editor: makes "Go to
 * Definition" open the *right file* and adds Back / Forward history so a jump is
 * a round trip.
 *
 * Two cooperating pieces, sharing one history stack:
 *
 *   1. An `editor.registerEditorOpener` that resolves a definition's
 *      `file:///<project>/<path>` target back to an application file, opens it
 *      through the same focus/select path the sidebar uses, and reveals the
 *      definition's range once the editor swaps models. A standalone Monaco
 *      editor can't open another file on its own, so without this Go to
 *      Definition silently does nothing across files.
 *
 *   2. A history stack of `{ uri, line, column }` points. We record where you
 *      were when a jump happens — a file switch, or a large in-file cursor move
 *      (Go to Definition within a file lands here) — and expose Back / Forward
 *      to walk it. Programmatic moves we make (the jump itself, and Back/Forward)
 *      are flagged so they don't pollute the history.
 *
 * Keybindings are browser-aware: VS Code's `Alt+Arrow` collides with browser
 * history (and, on macOS, with Monaco's word-motion), so we use macOS's
 * `Ctrl+-` / `Ctrl+Shift+-` there and `Alt+Arrow` elsewhere — plus the mouse
 * back/forward buttons and right-click menu entries, which never conflict.
 */
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useListener } from '@/lib/events/listener';
import { setWatchedValue } from '@/lib/events/watcher';
import * as monaco from '@/lib/monaco/editorApi';
import { useEffect, useRef } from 'react';

type Editor = monaco.editor.IStandaloneCodeEditor;

interface NavPoint {
	uri: string;
	lineNumber: number;
	column: number;
}

/** In-file cursor moves shorter than this aren't treated as navigation jumps. */
const JUMP_THRESHOLD_LINES = 10;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function toRange(selectionOrPosition?: monaco.IRange | monaco.IPosition): monaco.IRange | undefined {
	if (!selectionOrPosition) {
		return undefined;
	}
	if ('startLineNumber' in selectionOrPosition) {
		return selectionOrPosition;
	}
	const { lineNumber, column } = selectionOrPosition;
	return { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column };
}

export function useCodeNavigation(editor: Editor | undefined): void {
	const { setExpandedItems, setSelectedItems, setFocusedItem, entryExists } = useEditorView();

	// The editor opener and commands are wired once but must see the latest
	// handlers, so route them through refs.
	const openFileRef = useRef<(appPath: string) => void>(() => {});
	openFileRef.current = (appPath: string) => {
		setExpandedItems(expandedItems => {
			const expansion = new Set(expandedItems);
			const parts = appPath.split('/');
			for (let depth = 1; depth < parts.length; depth++) {
				expansion.add(parts.slice(0, depth).join('/'));
			}
			return [...expansion];
		});
		setSelectedItems([appPath]);
		setFocusedItem(appPath);
	};
	const entryExistsRef = useRef(entryExists);
	entryExistsRef.current = entryExists;

	// Navigation history, shared across the opener, cursor tracking, and commands.
	const backRef = useRef<NavPoint[]>([]);
	const forwardRef = useRef<NavPoint[]>([]);
	const currentRef = useRef<NavPoint | undefined>(undefined);
	// True while we move the cursor ourselves (a jump or a Back/Forward), so the
	// resulting cursor events update "current" without recording new history.
	const programmaticRef = useRef(false);

	// Expose the commands so the toolbar's clickable arrows can drive them too;
	// assigned once the editor effect wires them up.
	const goBackRef = useRef<() => void>(() => {});
	const goForwardRef = useRef<() => void>(() => {});
	useListener('NavigateBack', () => goBackRef.current(), []);
	useListener('NavigateForward', () => goForwardRef.current(), []);

	useEffect(() => {
		if (!editor) {
			return;
		}

		// Publish whether Back/Forward have anywhere to go, so the toolbar arrows
		// can enable/disable themselves.
		const syncAvailability = () => {
			setWatchedValue('CanNavigateBack', backRef.current.length > 0);
			setWatchedValue('CanNavigateForward', forwardRef.current.length > 0);
		};

		/** Reveal `range` once the editor is showing `targetUri`, then run `onDone`. */
		const revealWhenModelReady = (targetUri: string, range: monaco.IRange | undefined, onDone: () => void) => {
			let finished = false;
			const finish = () => {
				if (!finished) {
					finished = true;
					onDone();
				}
			};
			const apply = (): boolean => {
				if (editor.getModel()?.uri.toString() !== targetUri) {
					return false;
				}
				// Defer a tick so we win against @monaco-editor/react restoring the
				// file's last cursor position on switch.
				setTimeout(() => {
					if (range && editor.getModel()?.uri.toString() === targetUri) {
						editor.setSelection(range);
						editor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
					}
					editor.focus();
					finish();
				}, 0);
				return true;
			};
			if (apply()) {
				return;
			}
			const listener = editor.onDidChangeModel(() => {
				if (apply()) {
					listener.dispose();
				}
			});
			setTimeout(() => {
				listener.dispose();
				finish();
			}, 8000);
		};

		/** Move the editor to a recorded point (opening its file first if needed). */
		const navigateTo = (point: NavPoint) => {
			programmaticRef.current = true;
			const position = { lineNumber: point.lineNumber, column: point.column };
			if (editor.getModel()?.uri.toString() === point.uri) {
				editor.setPosition(position);
				editor.revealPositionInCenterIfOutsideViewport(position, monaco.editor.ScrollType.Smooth);
				editor.focus();
				currentRef.current = point;
				programmaticRef.current = false;
				return;
			}
			const appPath = monaco.Uri.parse(point.uri).path.replace(/^\/+/, '');
			if (!entryExistsRef.current(appPath)) {
				programmaticRef.current = false;
				return;
			}
			openFileRef.current(appPath);
			revealWhenModelReady(point.uri, toRange(position), () => {
				currentRef.current = point;
				programmaticRef.current = false;
			});
		};

		const goBack = () => {
			const target = backRef.current.pop();
			if (!target) {
				return;
			}
			if (currentRef.current) {
				forwardRef.current.push(currentRef.current);
			}
			syncAvailability();
			navigateTo(target);
		};
		const goForward = () => {
			const target = forwardRef.current.pop();
			if (!target) {
				return;
			}
			if (currentRef.current) {
				backRef.current.push(currentRef.current);
			}
			syncAvailability();
			navigateTo(target);
		};
		goBackRef.current = goBack;
		goForwardRef.current = goForward;

		// Record history as the cursor moves: a file switch, or a large in-file
		// move (where Go to Definition within a file lands), starts a new entry.
		const cursorListener = editor.onDidChangeCursorPosition(event => {
			const model = editor.getModel();
			if (!model) {
				return;
			}
			const next: NavPoint = {
				uri: model.uri.toString(),
				lineNumber: event.position.lineNumber,
				column: event.position.column,
			};
			if (programmaticRef.current) {
				currentRef.current = next;
				return;
			}
			const previous = currentRef.current;
			const isJump = !!previous
				&& (previous.uri !== next.uri || Math.abs(previous.lineNumber - next.lineNumber) >= JUMP_THRESHOLD_LINES);
			if (isJump && previous) {
				backRef.current.push(previous);
				forwardRef.current = [];
				syncAvailability();
			}
			currentRef.current = next;
		});

		// Cross-file Go to Definition: open the target file and reveal the range.
		const opener = monaco.editor.registerEditorOpener({
			openCodeEditor(source, resource, selectionOrPosition) {
				if (source.getModel()?.uri.toString() === resource.toString()) {
					return false; // Same file — Monaco moves the cursor itself.
				}
				const appPath = resource.path.replace(/^\/+/, '');
				if (!entryExistsRef.current(appPath)) {
					return false; // Not an application file (e.g. a library declaration).
				}
				// Record where we jumped from before leaving this file.
				if (currentRef.current) {
					backRef.current.push(currentRef.current);
					forwardRef.current = [];
					syncAvailability();
				}
				programmaticRef.current = true;
				openFileRef.current(appPath);
				revealWhenModelReady(resource.toString(), toRange(selectionOrPosition), () => {
					const model = editor.getModel();
					const position = editor.getPosition();
					if (model && position) {
						currentRef.current = {
							uri: model.uri.toString(),
							lineNumber: position.lineNumber,
							column: position.column,
						};
					}
					programmaticRef.current = false;
				});
				return true;
			},
		});

		const backAction = editor.addAction({
			id: 'harper.navigateBack',
			label: 'Go Back',
			keybindings: [
				isMac ? monaco.KeyMod.WinCtrl | monaco.KeyCode.Minus : monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow,
			],
			contextMenuGroupId: 'navigation',
			contextMenuOrder: 1.5,
			run: () => goBack(),
		});
		const forwardAction = editor.addAction({
			id: 'harper.navigateForward',
			label: 'Go Forward',
			keybindings: [
				isMac
					? monaco.KeyMod.WinCtrl | monaco.KeyMod.Shift | monaco.KeyCode.Minus
					: monaco.KeyMod.Alt | monaco.KeyCode.RightArrow,
			],
			contextMenuGroupId: 'navigation',
			contextMenuOrder: 1.6,
			run: () => goForward(),
		});

		// Mouse back/forward buttons — the most natural affordance, and conflict-free.
		const domNode = editor.getDomNode();
		const onMouseDown = (event: MouseEvent) => {
			if (event.button === 3 || event.button === 4) {
				event.preventDefault();
			}
		};
		const onMouseUp = (event: MouseEvent) => {
			if (event.button === 3) {
				event.preventDefault();
				goBack();
			} else if (event.button === 4) {
				event.preventDefault();
				goForward();
			}
		};
		domNode?.addEventListener('mousedown', onMouseDown);
		domNode?.addEventListener('mouseup', onMouseUp);

		syncAvailability();

		return () => {
			cursorListener.dispose();
			opener.dispose();
			backAction.dispose();
			forwardAction.dispose();
			domNode?.removeEventListener('mousedown', onMouseDown);
			domNode?.removeEventListener('mouseup', onMouseUp);
		};
	}, [editor]);
}
