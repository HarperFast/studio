import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { Suspense } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterVersion({
	className,
	disabled,
	form,
	harperVersions,
}: {
	className: string;
	disabled?: boolean | undefined;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	harperVersions: HarperVersionsResponse | undefined;
}) {
	if (!harperVersions?.value?.length) {
		return null;
	}

	return (
		<FormField
			control={form.control}
			name="version"
			render={({ field }) => (
				<FormItem className={className}>
					<FormLabel className="pb-1">Harper Version</FormLabel>

					<Suspense fallback={<TextLoadingSkeleton />}>
						<FormControl>
							<Select
								{...field}
								disabled={disabled}
								onValueChange={(version) => {
									field.onChange(version);
									void form.trigger();
								}}
							>
								<SelectTrigger className="w-full h-auto">
									<SelectValue placeholder="Choose Version" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{harperVersions?.value.map((harperVersion) => (
											<SelectItem
												key={harperVersion.version}
												value={harperVersion.version}
											>
												{harperVersion.version} <span className="font-light opacity-50">{harperVersion.name}</span>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
					</Suspense>

					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
