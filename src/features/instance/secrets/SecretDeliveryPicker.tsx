/**
 * The delivery-tier chooser shown in the add/edit secret dialogs: pick whether a secret is exposed
 * as a global environment variable (`process.env.NAME`) or scoped to specific apps through the
 * `secrets` accessor (`secrets.NAME`), and see the exact code to read it either way. The two tiers
 * are mutually exclusive server-side (harper#1554), so the grants slot only renders when scoped.
 */
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { ReactNode } from 'react';
import { SecretTier } from './accessExample';
import { SecretAccessExample } from './SecretAccessExample';

export function SecretDeliveryPicker({
	name,
	tier,
	onTierChange,
	disabled,
	grantsSlot,
}: {
	/** The secret name, used to render a copy-paste-correct access example. */
	name: string;
	tier: SecretTier;
	onTierChange: (tier: SecretTier) => void;
	disabled?: boolean;
	/** Grants editor to show under the scoped option (pending-grants on add, live editor on edit). */
	grantsSlot?: ReactNode;
}) {
	return (
		<div className="grid gap-3">
			<span className="text-sm font-medium">How should applications read this secret?</span>
			<RadioGroup
				value={tier}
				onValueChange={(value) => onTierChange(value as SecretTier)}
				disabled={disabled}
			>
				<label className="flex items-start gap-2 cursor-pointer">
					<RadioGroupItem value="scoped" className="mt-0.5" />
					<div className="grid gap-0.5">
						<span className="text-sm font-medium">Scoped to specific apps</span>
						<span className="text-sm text-muted-foreground">
							Exposed only to the applications you grant, through the <code className="font-mono">secrets</code>{' '}
							accessor. Never placed on <code className="font-mono">process.env</code>.
						</span>
					</div>
				</label>
				<label className="flex items-start gap-2 cursor-pointer">
					<RadioGroupItem value="processEnv" className="mt-0.5" />
					<div className="grid gap-0.5">
						<span className="text-sm font-medium">Environment variable</span>
						<span className="text-sm text-muted-foreground">
							Materialized onto <code className="font-mono">process.env</code>{' '}
							for every component (and child processes). Global — it can't be scoped to specific apps.
						</span>
					</div>
				</label>
			</RadioGroup>

			{tier === 'scoped' && grantsSlot}

			<div className="grid gap-1">
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					How to read it in your component
				</span>
				<SecretAccessExample name={name} tier={tier} />
			</div>
		</div>
	);
}
