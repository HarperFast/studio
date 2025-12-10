import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewTableForm } from '@/features/instance/applications/components/NewTableForm';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { useCallback } from 'react';

export function NewTableModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowNewTableModal', false);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowNewTableModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>New Table</DialogTitle>
					<DialogDescription>
						Creating a table is the basis of a data-driven application and can immediately be used as RESTful endpoints.
						This can also be configured as a caching table and extended and customized for specific endpoint behavior.
					</DialogDescription>
				</DialogHeader>

				<NewTableForm />
			</DialogContent>
		</Dialog>
	);
}
