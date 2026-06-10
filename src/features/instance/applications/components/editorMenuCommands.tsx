/**
 * Catalog of Monaco editor commands surfaced in the toolbar's Edit / Go menus —
 * useful actions that otherwise live only in the command palette (F1).
 *
 * Each entry is a Monaco editor action id; the toolbar runs it by emitting a
 * `RunEditorAction` event that the editor (in `TextEditorView`) executes against
 * the open file. Keyboard-shortcut labels are not stored here — they're read
 * from Monaco's keybinding registry at runtime (platform-correct, e.g. `⌘F` vs
 * `Ctrl+F`) and published as `EditorCommandShortcuts`.
 *
 * Menus are modeled as sections (arrays of arrays); a separator renders between
 * each section.
 */
import {
	ArrowDownAZIcon,
	ArrowUpAZIcon,
	CaseLowerIcon,
	CaseSensitiveIcon,
	CaseUpperIcon,
	CircleAlertIcon,
	CommandIcon,
	EraserIcon,
	FoldVerticalIcon,
	LightbulbIcon,
	ListOrderedIcon,
	ListTreeIcon,
	type LucideIcon,
	MessageSquareIcon,
	MessageSquareTextIcon,
	ReplaceIcon,
	SearchIcon,
	SparklesIcon,
	TextCursorInputIcon,
	UnfoldVerticalIcon,
} from 'lucide-react';

export interface EditorMenuCommand {
	/** Monaco editor action id, run via the `RunEditorAction` event. */
	id: string;
	label: string;
	icon: LucideIcon;
}

export const EDIT_MENU_SECTIONS: EditorMenuCommand[][] = [
	[
		{ id: 'editor.action.formatDocument', label: 'Format Document', icon: SparklesIcon },
		{ id: 'editor.action.commentLine', label: 'Toggle Line Comment', icon: MessageSquareIcon },
		{ id: 'editor.action.blockComment', label: 'Toggle Block Comment', icon: MessageSquareTextIcon },
	],
	[
		{ id: 'editor.action.startFindReplaceAction', label: 'Replace', icon: ReplaceIcon },
		{ id: 'editor.action.quickFix', label: 'Quick Fix…', icon: LightbulbIcon },
		{ id: 'editor.action.rename', label: 'Rename Symbol', icon: TextCursorInputIcon },
	],
	[
		{ id: 'editor.action.sortLinesAscending', label: 'Sort Lines Ascending', icon: ArrowDownAZIcon },
		{ id: 'editor.action.sortLinesDescending', label: 'Sort Lines Descending', icon: ArrowUpAZIcon },
		{ id: 'editor.action.trimTrailingWhitespace', label: 'Trim Trailing Whitespace', icon: EraserIcon },
	],
	[
		{ id: 'editor.foldAll', label: 'Fold All', icon: FoldVerticalIcon },
		{ id: 'editor.unfoldAll', label: 'Unfold All', icon: UnfoldVerticalIcon },
	],
];

/** Case transforms — grouped into a submenu under Edit to keep it tidy. */
export const CASE_TRANSFORM_COMMANDS: EditorMenuCommand[] = [
	{ id: 'editor.action.transformToUppercase', label: 'UPPERCASE', icon: CaseUpperIcon },
	{ id: 'editor.action.transformToLowercase', label: 'lowercase', icon: CaseLowerIcon },
	{ id: 'editor.action.transformToTitlecase', label: 'Title Case', icon: CaseSensitiveIcon },
	{ id: 'editor.action.transformToCamelcase', label: 'camelCase', icon: CaseSensitiveIcon },
	{ id: 'editor.action.transformToPascalcase', label: 'PascalCase', icon: CaseSensitiveIcon },
	{ id: 'editor.action.transformToSnakecase', label: 'snake_case', icon: CaseSensitiveIcon },
	{ id: 'editor.action.transformToKebabcase', label: 'kebab-case', icon: CaseSensitiveIcon },
];

export const GO_MENU_SECTIONS: EditorMenuCommand[][] = [
	[
		{ id: 'actions.find', label: 'Find', icon: SearchIcon },
	],
	[
		{ id: 'editor.action.quickCommand', label: 'Command Palette', icon: CommandIcon },
		{ id: 'editor.action.quickOutline', label: 'Go to Symbol…', icon: ListTreeIcon },
		{ id: 'editor.action.gotoLine', label: 'Go to Line/Column…', icon: ListOrderedIcon },
	],
	[
		{ id: 'editor.action.marker.next', label: 'Next Problem', icon: CircleAlertIcon },
		{ id: 'editor.action.marker.prev', label: 'Previous Problem', icon: CircleAlertIcon },
	],
];

/** Every surfaced command id — used to fetch keyboard-shortcut labels. */
export const ALL_EDITOR_COMMAND_IDS: string[] = [
	...EDIT_MENU_SECTIONS.flat(),
	...CASE_TRANSFORM_COMMANDS,
	...GO_MENU_SECTIONS.flat(),
].map(command => command.id);
