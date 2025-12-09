import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { renderBadgeLogLevelVariant } from '@/components/ui/utils/badgeLogLevel';
import { BadgeNodeVariantValues, memoizeNodeNames } from '@/components/ui/utils/badgeNode';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { LogsDataTable } from '@/features/instance/log/LogsDataTable';
import { ViewLogModal } from '@/features/instance/log/modals/ViewLogModal';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getReadLogQueryOptions, ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LogsFiltersForm } from './components/LogsFiltersForm';

type RowData = {
	original: ReadLogItem;
};

const defaultFormValues: z.infer<typeof LogFiltersFormSchema> = {
	limit: '100',
	level: 'undefined',
	from: '',
	until: '',
};

const columns: ColumnDef<ReadLogItem>[] = [
	{
		accessorKey: 'level',
		header: 'Status',
		cell: ({ row }) => {
			const { level } = row.original;
			return <Badge variant={renderBadgeLogLevelVariant(level)}>{capitalizeWords(level)}</Badge>;
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
		accessorKey: 'node',
		header: 'Node',
		cell: ({ row }) => {
			const { node } = row.original;
			const variant: BadgeNodeVariantValues = memoizeNodeNames(node);
			return (
				<>
					{node
						? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge variant={variant}>{node.split('.')[0]}...</Badge>
								</TooltipTrigger>
								<TooltipContent className="bg-grey-700" arrowClassName="bg-grey-700 fill-grey-700">
									{node}
								</TooltipContent>
							</Tooltip>
						)
						: null}
				</>
			);
		},
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
	if (!startDate && !endDate) { return true; }
	if (!startDate || !endDate) { return true; }

	const start = new Date(startDate);
	const end = new Date(endDate);
	return start <= end;
};

export function Logs() {
	const [logFilters, setLogFilters] = useState<z.infer<typeof LogFiltersFormSchema>>(defaultFormValues);

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
		}),
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
			<section className="col-span-1 md:col-span-4 lg:col-span-3 px-2 pt-4 md:pt-12">
				<LogsFiltersForm form={form} resetFilters={resetFilters} submitFilters={submitFilters} />

				<div className="flex items-center justify-between space-x-2 mt-2">
					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						disabled={isFetchingInstanceLogs || isLoading || isAutoRefreshEnabled}
						className="grow"
					>
						<RefreshCwIcon />
						Refresh
					</Button>
					<Toggle variant="outline" aria-label="Toggle Auto Refresh" onPressedChange={setIsAutoRefreshEnabled}>
						<RefreshCwIcon />
						Auto Refresh {isAutoRefreshEnabled ? 'On' : 'Off'}
					</Toggle>
				</div>
			</section>
			<section className="col-span-1 md:col-span-8 lg:col-span-9">
				{isLoading ? <div>Loading...</div> : (
					<div>
						<LogsDataTable columns={columns} data={instanceLogs || []} onRowClick={onRowClick} />
					</div>
				)}
			</section>
			<ViewLogModal isModalOpen={isViewLogModalOpen} setIsModalOpen={setIsViewLogModalOpen} data={selectedLogData} />
		</div>
	);
}
