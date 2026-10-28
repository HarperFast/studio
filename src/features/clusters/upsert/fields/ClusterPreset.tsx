import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import {
	CLUSTER_PRESETS,
	harperSupportsPresets,
	PRESET_MIN_HARPER_VERSION,
} from '@/features/clusters/presets/clusterPresets';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { cn } from '@/lib/cn';
import { SquareDashedIcon } from 'lucide-react';
import { useEffect } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { z } from 'zod';

const BLANK: { id: string; name: string; description: string; icon?: string } = {
	id: '',
	name: 'Blank cluster',
	description: 'Start with everything, and deploy your own applications.',
};

/**
 * What the cluster is for. A preset is installed after the cluster's admin signs in (see `PresetSetup`);
 * picking none keeps today's blank cluster.
 */
export function ClusterPreset({ className, form }: {
	className: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	const version = useWatch({ control: form.control, name: 'version' });
	const supported = harperSupportsPresets(version);
	// A preset chosen, or restored, before the version changed must not ride along with one that can't run it.
	useEffect(() => {
		if (!supported && form.getValues('preset')) {
			form.setValue('preset', undefined);
		}
	}, [supported, form]);
	return (
		<FormField
			control={form.control}
			name="preset"
			render={({ field }) => (
				<FormItem className={className}>
					<div role="radiogroup" aria-label="What is this cluster for?" className="grid gap-3 sm:grid-cols-3">
						{[BLANK, ...CLUSTER_PRESETS].map((option) => {
							const selected = (field.value ?? '') === option.id;
							const disabled = !!option.id && !supported;
							return (
								<button
									key={option.id || 'blank'}
									type="button"
									role="radio"
									aria-checked={selected}
									disabled={disabled}
									onClick={() => field.onChange(option.id || undefined)}
									className={cn(
										'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors',
										selected
											? 'border-primary bg-primary/10 dark:border-violet-400 dark:bg-violet-400/10'
											: 'border-border hover:border-primary/50',
										disabled && 'cursor-not-allowed opacity-50 hover:border-border',
									)}
								>
									<span className="flex items-center gap-2 font-medium">
										{option.icon
											? <ExtensionIcon name={option.icon} className="size-4" />
											: <SquareDashedIcon className="size-4" />}
										{option.name}
									</span>
									<span className="text-xs text-muted-foreground">{option.description}</span>
								</button>
							);
						})}
					</div>
					{!supported && (
						<p className="text-xs text-muted-foreground">
							Presets need Harper {PRESET_MIN_HARPER_VERSION} or later. Pick that version to choose one.
						</p>
					)}
				</FormItem>
			)}
		/>
	);
}
