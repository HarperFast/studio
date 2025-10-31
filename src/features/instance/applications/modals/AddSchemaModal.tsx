import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddSchemaForm } from '@/features/instance/applications/components/AddSchemaForm';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { Ban, PlusIcon } from 'lucide-react';
import { useCallback } from 'react';

export function AddSchemaModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowAddSchemaModal', false);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowAddSchemaModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Add Schema</DialogTitle>
					<DialogDescription>
						Creating a table is the basis of a data-driven application and can immediately be used as RESTful endpoints.
						This can also be configured as a caching table and extended and customized for specific endpoint behavior.
					</DialogDescription>
				</DialogHeader>

				<AddSchemaForm />

				<div className="flex w-full gap-4">
					<Button variant="ghost" className="w-full rounded-full" onClick={closeModal}>
						<Ban /> Cancel
					</Button>
					<Button variant="positive" type="button" className="w-full rounded-full">
						<PlusIcon /> Add Schema
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
