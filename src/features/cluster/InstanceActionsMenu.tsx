import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { renderEntityMenuItems } from '@/components/ui/entityMenu';
import { Instance } from '@/integrations/api/api.patch';
import { EllipsisIcon } from 'lucide-react';
import { useState } from 'react';
import { useInstanceMenuItems } from './useInstanceMenuItems';

/**
 * The "…" dropdown shown at the end of an instance row — the click-driven
 * counterpart to {@link InstanceRowContextMenu} for devices without right-click.
 * Both render the same {@link useInstanceMenuItems} list.
 */
export function InstanceActionsMenu({ instance, isSelfManaged }: { instance: Instance; isSelfManaged: boolean }) {
	const [open, setOpen] = useState(false);
	const items = useInstanceMenuItems(instance, isSelfManaged, open);

	if (!items.length) {
		return null;
	}

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button type="button" variant="ghost" size="icon" aria-label="Instance options">
					<EllipsisIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				{renderEntityMenuItems(items, 'dropdown')}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
