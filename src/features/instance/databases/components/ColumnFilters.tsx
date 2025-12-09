import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { HeaderGroup } from '@tanstack/react-table';
import { KeyboardEvent, useCallback } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export const ColumnFiltersSchema = z.record(z.string(), z.string());

export function ColumnFilters<TData>({
	applyFilters,
	columnFiltersForm,
	headerGroups,
}: {
	applyFilters: () => void;
	columnFiltersForm: UseFormReturn<z.infer<typeof ColumnFiltersSchema>>;
	headerGroups: HeaderGroup<TData>[];
}) {
	const handleSubmit = useCallback((e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyFilters();
			return false;
		}
	}, [applyFilters]);
	return (
		<TableHeader>
			<Form {...columnFiltersForm}>
				{headerGroups.map((headerGroup) => (
					<TableRow key={headerGroup.id} className="border-none">
						{headerGroup.headers.map((header) => (
							<TableCell key={header.id} style={{ width: `${header.column.getSize()}px` }}>
								{header.column.columnDef.enableColumnFilter && (
									<FormField
										control={columnFiltersForm.control}
										name={header.id}
										render={({ field }) => (
											<FormItem className="border-r-1 border-r-black">
												<FormControl>
													<Input
														{...field}
														type="text"
														autoCapitalize="none"
														autoComplete="off"
														className="rounded-none"
														onKeyDown={handleSubmit}
														value={field.value ?? ''}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</TableCell>
						))}
					</TableRow>
				))}
			</Form>
		</TableHeader>
	);
}
