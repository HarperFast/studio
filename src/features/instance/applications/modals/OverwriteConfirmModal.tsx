import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { pluralize } from '@/lib/pluralize';
import { useCallback, useEffect, useState } from 'react';
import { OverwriteRequest, registerOverwriteConfirmHandler } from './confirmOverwrite';

interface Pending {
	request: OverwriteRequest;
	resolve: (confirmed: boolean) => void;
}

/** Builds the action-button label from what's colliding: overwrite files, merge dirs, or both. */
function actionLabel({ files, directories }: OverwriteRequest): string {
	const parts: string[] = [];
	if (files.length) {
		parts.push(`Overwrite ${pluralize(files.length, 'file', 'files')}`);
	}
	if (directories.length) {
		parts.push(`Merge ${pluralize(directories.length, 'directory', 'directories')}`);
	}
	return parts.join(' & ') || 'Overwrite';
}

/**
 * A single mounted confirmation dialog driven imperatively via {@link confirmOverwrite}. Any
 * async flow (drag-drop upload, the New File/Directory modal, internal moves/renames) can
 * `await` a yes/no answer before replacing existing files or merging into existing directories.
 */
export function OverwriteConfirmModal() {
	const [pending, setPending] = useState<Pending | null>(null);

	useEffect(() => {
		registerOverwriteConfirmHandler((request, resolve) => {
			// If a prior request is somehow still open, decline it before showing the new one.
			setPending(prev => {
				prev?.resolve(false);
				return { request, resolve };
			});
		});
		return () => registerOverwriteConfirmHandler(undefined);
	}, []);

	const settle = useCallback((confirmed: boolean) => {
		setPending(prev => {
			prev?.resolve(confirmed);
			return null;
		});
	}, []);

	const request = pending?.request;
	const collisions = request ? [...request.directories, ...request.files] : [];

	return (
		<AlertDialog open={!!pending} onOpenChange={open => !open && settle(false)}>
			<AlertDialogContent className="text-popover-foreground">
				<AlertDialogHeader>
					<AlertDialogTitle>Overwrite existing items?</AlertDialogTitle>
					<AlertDialogDescription>
						{request?.directories.length
							? 'Some of these already exist. Files will be overwritten and directories merged.'
							: 'Some of these files already exist and will be overwritten.'}
					</AlertDialogDescription>
				</AlertDialogHeader>

				{collisions.length > 0 && (
					<div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-sm whitespace-pre-wrap break-all">
						{collisions.slice(0, 50).join('\n')}
						{collisions.length > 50 ? `\n…and ${collisions.length - 50} more` : ''}
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
					<AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={() => settle(true)}>
						{request ? actionLabel(request) : 'Overwrite'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
