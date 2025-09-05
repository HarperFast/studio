import { Badge } from '@/components/ui/badge';
import { renderBadgeLogLevelText, renderBadgeLogLevelVariant } from '@/components/ui/utils/badgeLogLevel';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { LogsDataTable } from '@/features/instance/log/LogsDataTable';
import { ViewLogModal } from '@/features/instance/log/modals/ViewLogModal';
import {
	getReadLogQueryOptions,
	LogFiltersFormSchema,
	ReadLogItem,
} from '@/features/instance/operations/queries/getReadLog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LogsFiltersForm } from './components/LogsFiltersForm';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

type RowData = {
	original: ReadLogItem;
};

const defaultFormValues: z.infer<typeof LogFiltersFormSchema> = {
	limit: '100',
	level: 'undefined',
	from: '',
	until: '',
	order: 'asc',
};

const columns: ColumnDef<ReadLogItem>[] = [
	{
		accessorKey: 'level',
		header: 'Status',
		cell: ({ row }) => {
			const { level } = row.original;
			return <Badge variant={renderBadgeLogLevelVariant(level)}>{renderBadgeLogLevelText(level)}</Badge>;
		},
	},
	{
		accessorKey: 'timestamp',
		header: 'Date',
		cell: ({ row }) => {
			const { timestamp } = row.original;
			return <span>{new Date(timestamp).toLocaleDateString()}</span>;
		},
	},
	{
		accessorKey: 'time',
		header: 'Time',
		cell: ({ row }) => {
			const { timestamp } = row.original;
			return <span>{new Date(timestamp).toLocaleTimeString()}</span>;
		},
	},
	{
		accessorKey: 'thread',
		header: 'Thread',
	},
	{
		accessorKey: 'tags',
		header: 'Tags',
	},
	{
		accessorKey: 'message',
		header: 'Message',
		cell: ({ row }) => {
			const { message } = row.original;
			row.getIsSelected();
			return (
				<pre>
					<code>{message}</code>
				</pre>
			);
		},
	},
];

const isValidDateRange = (startDate?: string, endDate?: string) => {
	if (!startDate && !endDate) return true;
	if (!startDate || !endDate) return true;

	const start = new Date(startDate);
	const end = new Date(endDate);
	return start <= end;
};

export function Logs() {
	const [logFilters, setLogFilters] = useState<z.infer<typeof LogFiltersFormSchema>>({
		limit: '100',
		level: 'undefined',
		from: '',
		until: '',
		order: 'asc',
	});

	const [isViewLogModalOpen, setIsViewLogModalOpen] = useState(false);
	const [selectedLogData, setSelectedLogData] = useState<ReadLogItem | undefined>();
	const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);

	const instanceParams = useInstanceClientIdParams();
	const {
		data: instanceLogs,
		isLoading,
		refetch: refetchReadLogQueryOptions,
		isFetching: isFetchingInstanceLogs,
	} = useQuery(
		getReadLogQueryOptions({
			logFilters,
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
			isAutoRefreshEnabled,
		})
	);

	const form = useForm({
		resolver: zodResolver(LogFiltersFormSchema),
		defaultValues: defaultFormValues,
		mode: 'onChange',
	});

	const onRowClick = (rowData: RowData): void => {
		setSelectedLogData(rowData.original);
		setIsViewLogModalOpen(true);
	};

	const submitFilters = async (data: z.infer<typeof LogFiltersFormSchema>) => {
		if (!isValidDateRange(data.from, data.until)) {
			form.setError('from', {
				type: 'onChange',
				message: 'Start date must be before end date',
			});
			form.setError('until', {
				type: 'onChange',
				message: 'End date must be after start date',
			});
			return;
		}
		setLogFilters(data);
	};

	const resetFilters = async () => {
		form.reset();
		setLogFilters(defaultFormValues);
	};

	const onRefreshClick = useRefreshClick(refetchReadLogQueryOptions);

	return (
		<div className="grid grid-cols-1 gap-4 text-white md:grid-cols-12">
			<section className="col-span-1 md:col-span-4 lg:col-span-3">
				<h2 className="pb-6 text-2xl">Log Filters</h2>
				<LogsFiltersForm form={form} resetFilters={resetFilters} submitFilters={submitFilters} />
			</section>
			<section className="col-span-1 md:col-span-8 lg:col-span-9">
				{isLoading ? (
					<div>Loading...</div>
				) : (
					<div className="h-32">
						<div className="flex items-center justify-between md:justify-normal md:space-x-2">
							<Button variant="defaultOutline" onClick={onRefreshClick} disabled={isFetchingInstanceLogs || isLoading || isAutoRefreshEnabled}>
								<RefreshCwIcon />
							</Button>
							<Toggle variant="outline" aria-label="Toggle Auto Refresh" onPressedChange={setIsAutoRefreshEnabled}>
								<RefreshCwIcon />
								Auto Refresh {isAutoRefreshEnabled ? 'On' : 'Off'}
							</Toggle>
						</div>
						<LogsDataTable columns={columns} data={instanceLogs || []} onRowClick={onRowClick} />
					</div>
				)}
			</section>
			<ViewLogModal isModalOpen={isViewLogModalOpen} setIsModalOpen={setIsViewLogModalOpen} data={selectedLogData} />
		</div>
	);
}
