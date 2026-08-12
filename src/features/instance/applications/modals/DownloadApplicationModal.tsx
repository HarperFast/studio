import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { LARGE_PACKAGE_BYTES, measureProjectPackage } from '@/features/instance/applications/lib/projectPackageSize';
import { usePackageComponentMutation } from '@/integrations/api/instance/applications/packageComponent';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { humanFileSize } from '@/lib/humanFileSize';
import { AlertTriangleIcon, DownloadIcon } from 'lucide-react';
import { ChangeEvent, MouseEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

/**
 * Decode the base64 archive Harper returns into bytes.
 *
 * Allocates once and fills in a loop rather than `Uint8Array.from(str, c => c.charCodeAt(0))`,
 * which runs a JS callback per byte — hundreds of millions of them for a large application,
 * all on the main thread. This is still O(n) memory on top of the `atob` copy; the real fix is
 * a streamed archive (HarperFast/harper#2150). Until then the modal warns first — see
 * `measureProjectPackage`.
 */
function decodeArchive(payload: string): Uint8Array<ArrayBuffer> {
	const binary = atob(payload);
	// Allocated over an explicit ArrayBuffer: a bare `new Uint8Array(n)` widens to
	// ArrayBufferLike, which TS 5.7+ rejects as a BlobPart.
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function DownloadApplicationModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowDownloadApplicationModal', false);

	const instanceParams = useInstanceClientIdParams();
	const { openedEntry, rootEntries } = useEditorView();
	const { mutate: packageComponent, isPending, isSuccess } = usePackageComponentMutation();
	const actionStatus = isSuccess ? `Downloaded` : isPending ? `Downloading` : 'Download';

	const [includeNodeModules, setIncludeNodeModules] = useState(false);

	// Measured from the cached `get_components` tree, so it costs no request and is ready
	// before the user commits to packaging.
	const measured = useMemo(
		() => measureProjectPackage(rootEntries, openedEntry?.project),
		[rootEntries, openedEntry?.project],
	);
	// node_modules is absent from the tree, so with it included the real package is strictly
	// larger than what we measured — and usually by a lot. Treat that as large regardless.
	const isLarge = measured !== undefined && (measured.bytes > LARGE_PACKAGE_BYTES || includeNodeModules);

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
					// Decoding can fail on its own once the archive is big enough — a payload past
					// V8's ~512 MB string cap throws here rather than in transport. Without this
					// the throw escapes into react-query and the "Packaging..." toast spins forever.
					let file: Blob;
					try {
						file = new Blob([decodeArchive(response.payload)], { type: 'application/gzip' });
					} catch (error) {
						toast.error(
							`${openedEntry.project} was packaged, but is too large for the browser to save. `
								+ `Copy it off the host directly instead.`,
							{ id: toastId },
						);
						console.error('[harper] failed to decode downloaded application archive', error);
						return;
					}
					toast.success('Download ready!', { id: toastId });

					const element = document.createElement('a');
					element.setAttribute('class', 'invisible absolute top-0');
					element.href = URL.createObjectURL(file);
					element.download = `${openedEntry.project}.gz`;
					document.body.appendChild(element);
					element.click();
					document.body.removeChild(element);
				},
				onError: (error) => {
					// Previously unhandled, which left the loading toast spinning with no verdict.
					toast.error(`Could not package ${openedEntry.project}: ${error.message}`, { id: toastId });
				},
			},
		);
	}, [openedEntry, packageComponent, includeNodeModules, instanceParams, closeModal]);

	return (
		<Dialog onOpenChange={closeModal} open={isModalOpen}>
			<DialogContent aria-describedby={undefined} className="text-popover-foreground">
				<DialogHeader>
					<DialogTitle>Download Application</DialogTitle>
					<DialogDescription>
						This will package up the contents of <strong>{openedEntry?.project}</strong> into a gzipped file.
						{measured && (
							<>
								{' '}
								{measured.exact ? 'About' : 'At least'} {humanFileSize(measured.bytes)} across{' '}
								{new Intl.NumberFormat().format(measured.fileCount)} {measured.fileCount === 1 ? 'file' : 'files'}
								{includeNodeModules ? ', plus node modules' : ''}.
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				{isLarge && (
					<Alert variant="warning">
						<AlertTriangleIcon />
						<AlertTitle>This is a large download</AlertTitle>
						<AlertDescription>
							<p>
								Studio has to hold the whole archive in browser memory before it can be saved, so the tab may run out of
								memory and crash partway through.
							</p>
							<p>
								Copying the application off the host directly —{' '}
								<code>scp</code>, or the Harper CLI — is more reliable at this size.
							</p>
						</AlertDescription>
					</Alert>
				)}

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
					<Button type="button" variant="ghostOutline" className="w-full" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						variant="positive"
						type="button"
						className="w-full"
						disabled={isPending}
						autoFocus={true}
						onClick={onClickYes}
					>
						<DownloadIcon /> {isLarge && !isPending && !isSuccess ? 'Download anyway' : actionStatus}
						{isPending ? '...' : ''}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
