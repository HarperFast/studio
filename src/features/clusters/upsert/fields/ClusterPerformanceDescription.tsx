import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { Suspense } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function ClusterPerformanceDescription({
	availablePerformanceDescriptions,
	form,
	selectedDeployment,
}: {
	availablePerformanceDescriptions: { name: string; performanceTier: string; description?: string }[];
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	selectedDeployment: string;
}) {
	return (
		<FormField
			control={form.control}
			name="performanceDescription"
			render={({ field }) => (
				<FormItem className="col-span-3">
					<FormLabel className="pb-1">
						{selectedDeployment.startsWith('Self') ? 'Support' : 'Performance'} &amp; Usage
					</FormLabel>

					<Suspense fallback={<TextLoadingSkeleton />}>
						<FormControl>
							<Select
								{...field}
								onValueChange={(performanceDescription) => {
									field.onChange(performanceDescription);
									void form.trigger();
								}}
								disabled={!availablePerformanceDescriptions?.length}
							>
								<SelectTrigger className="w-full h-auto">
									<SelectValue placeholder="Choose Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availablePerformanceDescriptions.map((performanceDescription) => (
											<SelectItem
												key={performanceDescription.name}
												value={performanceDescription.performanceTier}
											>
												<dt className="text-left font-bold text-sm/6">{performanceDescription.name}</dt>
												{performanceDescription.description && (
													<dd className="font-light">{performanceDescription.description}</dd>
												)}
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
