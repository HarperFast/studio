import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supportsRecordLocks } from '@/features/cluster/recordLocks/recordLocksState';
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
	recordLocksOn,
}: {
	className: string;
	disabled?: boolean | undefined;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	harperVersions: HarperVersionsResponse | undefined;
	/** Central manager refuses a version below record locks' floor while they are on, so those are disabled. */
	recordLocksOn?: boolean;
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
										{harperVersions?.value.map((harperVersion) => {
											const blockedByRecordLocks = recordLocksOn && !supportsRecordLocks(harperVersion.version);
											return (
												<SelectItem
													key={harperVersion.version}
													value={harperVersion.version}
													disabled={blockedByRecordLocks}
												>
													{harperVersion.version} <span className="font-light opacity-50">{harperVersion.name}</span>
													{blockedByRecordLocks && (
														<span className="font-light opacity-50">· needs record locks off</span>
													)}
												</SelectItem>
											);
										})}
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
