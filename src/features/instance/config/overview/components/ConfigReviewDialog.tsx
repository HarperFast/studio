import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { pluralize } from '@/lib/pluralize';
import { TriangleAlertIcon } from 'lucide-react';
import type { ConfigChange } from '../configDraft';
import { formatConfigValue } from './ConfigForm';

interface ConfigReviewDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	changes: readonly ConfigChange[];
	restartNote: string;
	warnings: readonly string[];
	saving: boolean;
	onConfirm: () => void;
}

export function ConfigReviewDialog(
	{ open, onOpenChange, changes, restartNote, warnings, saving, onConfirm }: ConfigReviewDialogProps,
) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="sm:max-w-2xl">
				<AlertDialogHeader>
					<AlertDialogTitle>Save {pluralize(changes.length, 'change', 'changes')}?</AlertDialogTitle>
					<AlertDialogDescription>{restartNote}</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="max-h-[50vh] overflow-auto rounded-md border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted text-xs text-muted-foreground">
							<tr>
								<th scope="col" className="px-3 py-2 font-medium">Setting</th>
								<th scope="col" className="px-3 py-2 font-medium">Was</th>
								<th scope="col" className="px-3 py-2 font-medium">Now</th>
							</tr>
						</thead>
						<tbody>
							{changes.map(change => (
								<tr key={change.path.join('.')} className="border-t align-top">
									<td className="px-3 py-2">
										<code className="break-all text-xs">{change.path.join('.')}</code>
									</td>
									<td className="px-3 py-2 break-all text-muted-foreground">
										{formatConfigValue(change.before, change.path)}
									</td>
									<td className="px-3 py-2 break-all">{formatConfigValue(change.after, change.path)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{warnings.map(warning => (
					<Alert key={warning} variant="warning">
						<TriangleAlertIcon aria-hidden="true" />
						<AlertDescription>{warning}</AlertDescription>
					</Alert>
				))}
				<AlertDialogFooter>
					<AlertDialogCancel>Keep editing</AlertDialogCancel>
					<AlertDialogAction disabled={saving || changes.length === 0} onClick={onConfirm}>
						Save &amp; Restart
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
