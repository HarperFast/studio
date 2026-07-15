/**
 * A local, API-free grants collector for the Add-secret flow: the secret doesn't exist yet, so
 * grants can't be persisted with grant_secret (as the edit flow's live SecretGrantsEditor does) —
 * they're gathered here and submitted in the initial set_secret call. Chip UI mirrors
 * SecretGrantsEditor so the two read the same, and both pick the target application through the
 * shared ComponentGrantCombobox.
 */
import { Badge } from '@/components/ui/badge';
import { XIcon } from 'lucide-react';
import { useCallback } from 'react';
import { ComponentGrantCombobox } from './ComponentGrantCombobox';

export function PendingGrantsInput({
	grants,
	onChange,
	components,
	disabled,
}: {
	grants: string[];
	onChange: (next: string[]) => void;
	/** Component names the cluster reports, offered as picker suggestions (empty → free text). */
	components: string[];
	disabled?: boolean;
}) {
	const add = useCallback((target: string) => {
		if (!grants.includes(target)) {
			onChange([...grants, target]);
		}
	}, [grants, onChange]);

	const remove = useCallback((target: string) => {
		onChange(grants.filter((granted) => granted !== target));
	}, [grants, onChange]);

	return (
		<div className="grid gap-2">
			<span className="text-sm font-medium">Granted applications</span>
			<p className="text-sm text-muted-foreground">
				Only these applications will be able to read the secret. You can grant more later — leave it empty to add grants
				after creating the secret.
			</p>
			{grants.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{grants.map((granted) => (
						<Badge key={granted} variant="secondary">
							{granted}
							<button
								type="button"
								onClick={() => remove(granted)}
								disabled={disabled}
								title={`Remove ${granted}`}
								className="cursor-pointer disabled:cursor-default"
							>
								<XIcon />
								<span className="sr-only">Remove {granted}</span>
							</button>
						</Badge>
					))}
				</div>
			)}
			<ComponentGrantCombobox
				components={components}
				granted={grants}
				onAdd={add}
				disabled={disabled}
				actionLabel="Add"
				// Submitting the Add-secret form blurs this field first; commit-on-blur keeps a typed-but-
				// not-added name from being silently dropped. add() no-ops on empty/duplicate.
				commitOnBlur
			/>
		</div>
	);
}
