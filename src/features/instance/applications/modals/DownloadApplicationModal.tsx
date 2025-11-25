import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { usePackageComponentMutation } from '@/integrations/api/instance/applications/packageComponent';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { DownloadIcon } from 'lucide-react';
import { ChangeEvent, MouseEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

export function DownloadApplicationModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowDownloadApplicationModal', false);

	const instanceParams = useInstanceClientIdParams();
	const { openedEntry } = useEditorView();
	const { mutate: packageComponent, isPending, isSuccess } = usePackageComponentMutation();
	const actionStatus = isSuccess ? `Downloaded` : isPending ? `Downloading` : 'Download';

	const [includeNodeModules, setIncludeNodeModules] = useState(false);

	const includeNodeModulesChanged = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		setIncludeNodeModules(e.target.checked);
	}, []);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowDownloadApplicationModal', false);
		attemptToRestoreFocus(trigger);
	}, [trigger]);
	const onClickYes = useCallback((e: MouseEvent) => {
		e.preventDefault();
		if (!openedEntry) {
			return;
		}
		closeModal();
		const toastId = toast.loading('Packaging...');
		packageComponent(
			{
				packageName: openedEntry.package,
				project: openedEntry.project,
				skipNodeModules: !includeNodeModules,
				...instanceParams,
			},
			{
				onSuccess: (response) => {
					toast.success('Download ready!', { id: toastId });

					const element = document.createElement('a');
					element.setAttribute('class', 'invisible absolute top-0');
					const bytes = Uint8Array.from(atob(response.payload), c => c.charCodeAt(0));
					const file = new Blob([bytes], { type: 'application/gzip' });
					element.href = URL.createObjectURL(file);
					element.download = `${openedEntry.project}.gz`;
					document.body.appendChild(element);
					element.click();
					document.body.removeChild(element);
				},
			},
		);
	}, [openedEntry, packageComponent, includeNodeModules, instanceParams, closeModal]);


	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Download Application</DialogTitle>
					<DialogDescription>
						This will package up the contents of <strong>{openedEntry?.project}</strong> into a gzipped file.
					</DialogDescription>
				</DialogHeader>

				<Label className="flex">
					<Input
						type="checkbox"
						className="w-6"
						disabled={isPending}
						checked={includeNodeModules}
						onChange={includeNodeModulesChanged}
					/>
					<span className="pl-4 pr-8 flex-1 py-2.5">Include Node Modules</span>
				</Label>

				<div className="flex w-full gap-4">
					<Button variant="ghostOutline" className="w-full rounded-full" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						variant="positive"
						type="button"
						className="w-full rounded-full"
						disabled={isPending}
						autoFocus={true}
						onClick={onClickYes}
					>
						<DownloadIcon /> {actionStatus}{isPending ? '...' : ''}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
