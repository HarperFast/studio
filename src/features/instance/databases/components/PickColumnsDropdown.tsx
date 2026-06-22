import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { VisibilityState } from '@tanstack/react-table';
import { Columns3CogIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export function PickColumnsDropdown({
	columns,
	columnVisibility,
	setColumnVisibility,
}: {
	columns: ReturnType<typeof formatBrowseDataTableHeader>['dataTableColumns'];
	columnVisibility: VisibilityState;
	setColumnVisibility: (columnVisibility: VisibilityState) => void;
}) {
	const columnHeaders = useMemo(() => {
		return columns
			.map(c => (typeof c.header === 'string' ? c.header : undefined))
			.filter(excludeFalsy);
	}, [columns]);
	const toggleColumn = useCallback((columnHeader: string, nextChecked: boolean) => {
		setColumnVisibility({
			...columnVisibility,
			[columnHeader]: nextChecked,
		});
	}, [columnVisibility, setColumnVisibility]);
	const setAllColumns = useCallback((nextChecked: boolean) => {
		setColumnVisibility({
			...columnVisibility,
			...Object.fromEntries(columnHeaders.map(columnHeader => [columnHeader, nextChecked])),
		});
	}, [columnHeaders, columnVisibility, setColumnVisibility]);
	const allVisible = useMemo(
		() => columnHeaders.every(columnHeader => columnVisibility[columnHeader] ?? true),
		[columnHeaders, columnVisibility],
	);
	const noneVisible = useMemo(
		() => columnHeaders.every(columnHeader => !(columnVisibility[columnHeader] ?? true)),
		[columnHeaders, columnVisibility],
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost">
					<Columns3CogIcon className="inline-block " />
					Columns
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				{columnHeaders.length > 0 && (
					<>
						<DropdownMenuItem
							inset
							disabled={allVisible}
							onSelect={e => {
								e.preventDefault();
								setAllColumns(true);
							}}
						>
							Select all
						</DropdownMenuItem>
						<DropdownMenuItem
							inset
							disabled={noneVisible}
							onSelect={e => {
								e.preventDefault();
								setAllColumns(false);
							}}
						>
							Deselect all
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				{columnHeaders.map(columnHeader => (
					<ColumnPicker
						key={columnHeader}
						columnHeader={columnHeader}
						isChecked={columnVisibility[columnHeader] ?? true}
						toggleColumn={toggleColumn}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ColumnPicker({
	columnHeader,
	isChecked,
	toggleColumn,
}: {
	columnHeader: string;
	isChecked: boolean;
	toggleColumn: (columnHeader: string, nextChecked: boolean) => void;
}) {
	const onCheckedChange = useCallback((checked: boolean) => {
		toggleColumn(columnHeader, checked);
	}, [columnHeader, toggleColumn]);
	return (
		<DropdownMenuCheckboxItem
			checked={isChecked}
			onCheckedChange={onCheckedChange}
			onSelect={e => e.preventDefault()}
		>
			{columnHeader}
		</DropdownMenuCheckboxItem>
	);
}
