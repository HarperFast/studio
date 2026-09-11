import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { HeaderGroup } from '@/lib/table';
import { RowData } from '@tanstack/react-table';
import { ChevronDownIcon } from 'lucide-react';
import { KeyboardEvent, useCallback } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export const ColumnFiltersSchema = z.record(z.string(), z.string());

export function ColumnFilters<TData extends RowData>({
	applyFilters,
	columnFiltersForm,
	headerGroups,
	selectColumnWidth,
}: {
	applyFilters: () => void;
	columnFiltersForm: UseFormReturn<z.infer<typeof ColumnFiltersSchema>>;
	headerGroups: HeaderGroup<TData>[];
	/** Set when the grid renders its sticky selection gutter, so this row keeps the same columns. */
	selectColumnWidth?: number;
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
						{selectColumnWidth !== undefined && (
							<TableCell
								aria-hidden
								style={{ width: `${selectColumnWidth}px` }}
								// The right divider is an inset shadow, not `border-r` — see
								// SELECT_COLUMN_DIVIDER in TableView: a collapsed border doesn't travel
								// with a sticky cell.
								className="sticky top-10 left-0 z-20 bg-card dark:bg-black-dark border-b border-border shadow-[inset_-1px_0_0_var(--color-border)]"
							/>
						)}
						{headerGroup.headers.map((header) => {
							const relationshipInfo = header.column.columnDef.meta?.relationshipInfo;
							return (
								<TableCell
									key={header.id}
									style={{ width: `${header.column.getSize()}px` }}
									// Sticks directly under the header row inside the table's own scroll container
									// (`top-10` = the header's `h-10`).
									className="sticky top-10 z-10 bg-card dark:bg-black-dark border-b border-border"
								>
									{header.column.columnDef.enableColumnFilter && (
										<FormField
											control={columnFiltersForm.control}
											name={header.id}
											render={({ field }) => (
												<FormItem className="border-r border-r-black">
													<div className="flex items-center">
														{relationshipInfo && (
															<SubPropertyPicker
																relationshipInfo={relationshipInfo}
																value={field.value ?? ''}
																onChange={field.onChange}
															/>
														)}
														<FormControl>
															<Input
																{...field}
																type="text"
																autoCapitalize="none"
																autoComplete="off"
																className="rounded-none"
																onKeyDown={handleSubmit}
																value={field.value ?? ''}
																placeholder={relationshipInfo
																	? `.${relationshipInfo.relatedPrimaryKey} value`
																	: undefined}
															/>
														</FormControl>
													</div>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}
								</TableCell>
							);
						})}
					</TableRow>
				))}
			</Form>
		</TableHeader>
	);
}

/**
 * Relationship columns filter on a property of the related table (the server joins through the
 * relationship). This picker inserts the `.property` prefix; the comparator/value syntax after it
 * is the same as any other column filter.
 */
function SubPropertyPicker({
	relationshipInfo,
	value,
	onChange,
}: {
	relationshipInfo: RelationshipAttributeInfo;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="rounded-none shrink-0"
					title={`Filter by a ${relationshipInfo.relatedTableName} property`}
				>
					<ChevronDownIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="bottom" align="start">
				{relationshipInfo.relatedAttributes.map((attribute) => (
					<DropdownMenuItem
						key={attribute.attribute}
						onClick={() => {
							const rest = value.replace(/^\s*\.\S*\s*/, '');
							onChange(`.${attribute.attribute} ${rest}`);
						}}
					>
						{attribute.attribute}
						{attribute.type && <span className="text-muted-foreground text-xs">{attribute.type}</span>}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
