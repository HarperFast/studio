import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/contextMenu';
import { renderEntityMenuItems } from '@/components/ui/entityMenu';
import { Instance } from '@/integrations/api/api.patch';
import { ReactNode, useState } from 'react';
import { useInstanceMenuItems } from './useInstanceMenuItems';

/**
 * Right-click menu for an instance row. Shares its action list with the row's
 * "…" dropdown ({@link InstanceActionsMenu}) via {@link useInstanceMenuItems}.
 */
export function InstanceRowContextMenu({
	instance,
	isSelfManaged,
	children,
}: {
	instance: Instance;
	isSelfManaged: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const items = useInstanceMenuItems(instance, isSelfManaged, open);

	if (!items.length) {
		return <>{children}</>;
	}

	return (
		<ContextMenu onOpenChange={setOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="min-w-48">{renderEntityMenuItems(items, 'context')}</ContextMenuContent>
		</ContextMenu>
	);
}
