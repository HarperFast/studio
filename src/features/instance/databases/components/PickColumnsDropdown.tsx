import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
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
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost">
					<Columns3CogIcon className="inline-block " />
					Columns
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
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
