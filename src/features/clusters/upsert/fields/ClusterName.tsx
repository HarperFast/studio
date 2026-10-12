import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { LengthLimitedInput } from '@/components/ui/form/LengthLimitedInput';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterName({
	className,
	disabled,
	form,
}: {
	className: string;
	disabled?: boolean | undefined;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	return (
		<FormField
			control={form.control}
			name="clusterName"
			render={({ field }) => (
				<FormItem className={className}>
					<FormLabel className="pb-1">Cluster Name</FormLabel>
					<LengthLimitedInput
						autoFocus={true}
						type="text"
						maxLength={UpsertClusterSchema.shape.clusterName.maxLength!}
						autoCapitalize="words"
						disabled={disabled}
						{...field}
					/>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
