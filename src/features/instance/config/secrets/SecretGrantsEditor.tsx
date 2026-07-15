/**
 * Grants editor for one secret, shown inside the edit dialog. A secret is only materialized into
 * the environment of components listed in its grants, so this is where a stored secret actually
 * gets scoped to applications. Grant/revoke apply immediately (they are their own operations, not
 * part of the value form). The target application is chosen through the shared
 * ComponentGrantCombobox, seeded with the components the cluster reports.
 */
import { Badge } from '@/components/ui/badge';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { ComponentGrantCombobox } from '@/features/instance/secrets/ComponentGrantCombobox';
import { useGrantSecret, useRevokeSecret } from '@/integrations/api/instance/secrets/secrets';
import { XIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function SecretGrantsEditor({
	name,
	initialGrants,
	components,
	onChanged,
}: {
	name: string;
	initialGrants: string[];
	/** Component names the cluster reports, offered as picker suggestions (empty → free text). */
	components: string[];
	/** Called after a successful grant/revoke so the list view can refresh its metadata. */
	onChanged?: () => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const { mutateAsync: grantSecret, isPending: isGranting } = useGrantSecret();
	const { mutateAsync: revokeSecret, isPending: isRevoking } = useRevokeSecret();
	const busy = isGranting || isRevoking;

	// The mutation responses carry the resulting grants, so the chips track server truth.
	const [grants, setGrants] = useState(initialGrants);

	const onGrant = useCallback(async (target: string) => {
		try {
			const response = await grantSecret({ ...instanceParams, name, component: target });
			setGrants(response.grants);
			onChanged?.();
		} catch (error) {
			toast.error(String(error));
			// Rethrow so the combobox keeps the typed text for a retry instead of clearing it.
			throw error;
		}
	}, [grantSecret, instanceParams, name, onChanged]);

	const onRevokeClick = useCallback(async (target: string) => {
		try {
			const response = await revokeSecret({ ...instanceParams, name, component: target });
			setGrants(response.grants);
			onChanged?.();
		} catch (error) {
			toast.error(String(error));
		}
	}, [revokeSecret, instanceParams, name, onChanged]);

	return (
		<div className="grid gap-2">
			<span className="text-sm font-medium">Granted applications</span>
			<p className="text-sm text-muted-foreground">
				Only granted applications can read this secret through the <code className="font-mono">secrets</code>{' '}
				accessor. Changes apply immediately.
			</p>
			{grants.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{grants.map((granted) => (
						<Badge key={granted} variant="secondary">
							{granted}
							<button
								type="button"
								onClick={() => void onRevokeClick(granted)}
								disabled={busy}
								title={`Revoke ${granted}`}
								className="cursor-pointer disabled:cursor-default"
							>
								<XIcon />
								<span className="sr-only">Revoke {granted}</span>
							</button>
						</Badge>
					))}
				</div>
			)}
			<ComponentGrantCombobox
				components={components}
				granted={grants}
				onAdd={onGrant}
				disabled={busy}
				actionLabel="Grant"
			/>
		</div>
	);
}
