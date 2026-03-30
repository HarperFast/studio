import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { specifiedAbbreviatedName, UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
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
			<FormItem className="col-span-3 ">
				<FormLabel className="pb-1">Full Host Name</FormLabel>
				<FormControl>
					<span>{calculatedNames.fullHostName}</span>
				</FormControl>
				<FormMessage />
			</FormItem>
		</>
	);
}
