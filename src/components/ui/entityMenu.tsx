import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from '@/components/ui/contextMenu';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdownMenu';
import { Link } from '@tanstack/react-router';
import { ComponentType, Fragment, MouseEventHandler, ReactNode } from 'react';

/**
 * A single entry in a card's action menu, described as data so the same list can
 * render in both the "…" dropdown and the right-click context menu. Navigation
 * entries set `to` (rendered inside a `<Link>`); actions set `onClick`.
 */
export type EntityMenuItem =
	| { type: 'separator'; key: string }
	| { type: 'label'; key: string; label: ReactNode; className?: string }
	| {
		type?: 'item';
		key: string;
		label: ReactNode;
		icon?: ReactNode;
		/** Relative router path; renders the item inside a Link. */
		to?: string;
		onClick?: MouseEventHandler<HTMLDivElement>;
		disabled?: boolean;
		className?: string;
		variant?: 'default' | 'destructive';
	};

interface MenuParts {
	Item: ComponentType<
		{
			className?: string;
			onClick?: MouseEventHandler<HTMLDivElement>;
			disabled?: boolean;
			variant?: 'default' | 'destructive';
			children?: ReactNode;
		}
	>;
	Label: ComponentType<{ className?: string; children?: ReactNode }>;
	Separator: ComponentType;
}

const PARTS: Record<'dropdown' | 'context', MenuParts> = {
	dropdown: { Item: DropdownMenuItem, Label: DropdownMenuLabel, Separator: DropdownMenuSeparator },
	context: { Item: ContextMenuItem, Label: ContextMenuLabel, Separator: ContextMenuSeparator },
};

/**
 * Render a menu item list as either dropdown or context-menu items, keeping a
 * card's "…" dropdown and its right-click menu in sync from a single source.
 */
export function renderEntityMenuItems(items: EntityMenuItem[], variant: 'dropdown' | 'context'): ReactNode {
	const { Item, Label, Separator } = PARTS[variant];
	return items.map(item => {
		if (item.type === 'separator') {
			return <Separator key={item.key} />;
		}
		if (item.type === 'label') {
			return <Label key={item.key} className={item.className}>{item.label}</Label>;
		}
		const node = (
			<Item className={item.className} onClick={item.onClick} disabled={item.disabled} variant={item.variant}>
				{item.icon}
				{item.label}
			</Item>
		);
		return item.to
			? <Link key={item.key} to={item.to} disabled={item.disabled}>{node}</Link>
			: <Fragment key={item.key}>{node}</Fragment>;
	});
}

/**
 * Wraps an element (e.g. a card) so right-clicking it opens a context menu with
 * the given items. Renders nothing extra when there are no items, so the native
 * menu is left alone.
 */
export function EntityContextMenu({ items, children }: { items: EntityMenuItem[]; children: ReactNode }) {
	if (!items.length) {
		return <>{children}</>;
	}
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>{renderEntityMenuItems(items, 'context')}</ContextMenuContent>
		</ContextMenu>
	);
}
