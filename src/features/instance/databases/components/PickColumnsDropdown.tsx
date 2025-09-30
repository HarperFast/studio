import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { useToggleCallback } from '@/hooks/useToggleCallback';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { notYetImplemented } from '@/lib/notYetImplemented';
import { VisibilityState } from '@tanstack/react-table';
import { Columns3CogIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';

export function PickColumnsDropdown({
	columns,
	columnVisibility,
	setColumnVisibility,
}: {
	columns: ReturnType<typeof formatBrowseDataTableHeader>['dataTableColumns'],
	columnVisibility: VisibilityState,
	setColumnVisibility: (columnVisibility: VisibilityState) => void,
}) {
	const columnHeaders = useMemo(() => {
		return columns
			.map(c => c.header as string)
			.filter(excludeFalsy);
	}, [columns]);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" onClick={notYetImplemented}>
					<Columns3CogIcon className="inline-block " />
					Columns
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				{columnHeaders.map(columnHeader => <ColumnPicker
					key={columnHeader}
					columnHeader={columnHeader}
					columnVisibility={columnVisibility}
					setColumnVisibility={setColumnVisibility}
				/>)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ColumnPicker({
	columnHeader,
	columnVisibility,
	setColumnVisibility,
}: {
	columnHeader: string,
	columnVisibility: VisibilityState,
	setColumnVisibility: (columnVisibility: VisibilityState) => void,
}) {
	const [isChecked, onCheckedChanged] = useToggleCallback(columnVisibility[columnHeader] ?? true);
	useEffect(() => {
		if (columnVisibility[columnHeader] !== isChecked) {
			setColumnVisibility({
				...columnVisibility,
				[columnHeader]: isChecked,
			});
		}
	}, [columnHeader, columnVisibility, isChecked, setColumnVisibility]);
	return (
		<DropdownMenuCheckboxItem key={columnHeader} checked={isChecked} onClick={onCheckedChanged}>
			{columnHeader}
		</DropdownMenuCheckboxItem>
	);
}
