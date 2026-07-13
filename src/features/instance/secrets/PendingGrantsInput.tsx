/**
 * A local, API-free grants collector for the Add-secret flow: the secret doesn't exist yet, so
 * grants can't be persisted with grant_secret (as the edit flow's live SecretGrantsEditor does) —
 * they're gathered here and submitted in the initial set_secret call. Chip UI mirrors
 * SecretGrantsEditor so the two read the same.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlusIcon, XIcon } from 'lucide-react';
import { KeyboardEvent, useCallback, useState } from 'react';

export function PendingGrantsInput({
	grants,
	onChange,
	disabled,
}: {
	grants: string[];
	onChange: (next: string[]) => void;
	disabled?: boolean;
}) {
	const [component, setComponent] = useState('');

	const add = useCallback(() => {
		const target = component.trim();
		if (!target) {
			return;
		}
		if (!grants.includes(target)) {
			onChange([...grants, target]);
		}
		setComponent('');
	}, [component, grants, onChange]);

	const remove = useCallback((target: string) => {
		onChange(grants.filter((granted) => granted !== target));
	}, [grants, onChange]);

	// This input lives inside the add form — Enter must add a grant, not submit the secret.
	const onKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			add();
		}
	}, [add]);

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
			<div className="flex gap-2">
				<Input
					type="text"
					autoComplete="off"
					autoCapitalize="off"
					placeholder="application name"
					value={component}
					onChange={(event) => setComponent(event.target.value)}
					onKeyDown={onKeyDown}
					// Commit a typed-but-not-added name on blur too, so submitting the Add-secret form (which
					// blurs this field first) doesn't silently drop it. add() no-ops on empty/duplicate.
					onBlur={add}
					disabled={disabled}
				/>
				<Button
					type="button"
					variant="positiveOutline"
					onClick={add}
					disabled={disabled || !component.trim()}
				>
					<PlusIcon /> Add
				</Button>
			</div>
		</div>
	);
}
