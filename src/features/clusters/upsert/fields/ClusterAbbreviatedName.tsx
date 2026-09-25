import { HostnamePreview } from '@/components/HostnamePreview';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { specifiedAbbreviatedName, UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { useId } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterAbbreviatedName({
	calculatedNames,
	disabled,
	form,
}: {
	calculatedNames: { suggestedAbbreviatedName: string; fullHostName: string };
	disabled?: boolean | undefined;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	const labelId = useId();
	return (
		<>
			<FormField
				control={form.control}
				name="abbreviatedName"
				render={({ field }) => (
					<FormItem className="col-span-3">
						<FormLabel className="pb-1">Host Name</FormLabel>
						<FormControl>
							<Input
								{...field}
								type="text"
								maxLength={specifiedAbbreviatedName.maxLength!}
								autoCapitalize="none"
								autoComplete="off"
								autoCorrect="off"
								placeholder={calculatedNames.suggestedAbbreviatedName}
								disabled={disabled}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<div className="col-span-3 min-w-0 space-y-2">
				<p id={labelId} className="text-sm font-medium">Full Host Name</p>
				<HostnamePreview
					hostname={calculatedNames.fullHostName}
					testId="cluster-hostname-preview"
					describedBy={labelId}
				/>
			</div>
		</>
	);
}
