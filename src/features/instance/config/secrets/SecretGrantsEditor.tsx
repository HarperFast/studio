/**
 * Grants editor for one secret, shown inside the edit dialog. A secret is only materialized into
 * the environment of components listed in its grants, so this is where a stored secret actually
 * gets scoped to applications. Grant/revoke apply immediately (they are their own operations, not
 * part of the value form).
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useGrantSecret, useRevokeSecret } from '@/integrations/api/instance/secrets/secrets';
import { PlusIcon, XIcon } from 'lucide-react';
import { KeyboardEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

export function SecretGrantsEditor({
	name,
	initialGrants,
	onChanged,
}: {
	name: string;
	initialGrants: string[];
	/** Called after a successful grant/revoke so the list view can refresh its metadata. */
	onChanged?: () => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const { mutateAsync: grantSecret, isPending: isGranting } = useGrantSecret();
	const { mutateAsync: revokeSecret, isPending: isRevoking } = useRevokeSecret();
	const busy = isGranting || isRevoking;

	// The mutation responses carry the resulting grants, so the chips track server truth.
	const [grants, setGrants] = useState(initialGrants);
	const [component, setComponent] = useState('');

	const onGrantClick = useCallback(async () => {
		const target = component.trim();
		if (!target) {
			return;
		}
		try {
			const response = await grantSecret({ ...instanceParams, name, component: target });
			setGrants(response.grants);
			setComponent('');
			onChanged?.();
		} catch (error) {
			toast.error(String(error));
		}
	}, [component, grantSecret, instanceParams, name, onChanged]);

	const onRevokeClick = useCallback(async (target: string) => {
		try {
			const response = await revokeSecret({ ...instanceParams, name, component: target });
			setGrants(response.grants);
			onChanged?.();
		} catch (error) {
			toast.error(String(error));
		}
	}, [revokeSecret, instanceParams, name, onChanged]);

	// This editor lives inside the value form — Enter must grant, not submit a value replacement.
	const onComponentKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			void onGrantClick();
		}
	}, [onGrantClick]);

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
			<div className="flex gap-2">
				<Input
					type="text"
					autoComplete="off"
					autoCapitalize="off"
					placeholder="application name"
					value={component}
					onChange={(event) => setComponent(event.target.value)}
					onKeyDown={onComponentKeyDown}
					disabled={busy}
				/>
				<Button
					type="button"
					variant="positiveOutline"
					onClick={() => void onGrantClick()}
					disabled={busy || !component.trim()}
				>
					<PlusIcon /> Grant
				</Button>
			</div>
		</div>
	);
}
