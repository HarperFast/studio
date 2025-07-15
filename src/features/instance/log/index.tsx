import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
	getReadLogQueryOptions,
	LogFiltersSchema,
	ReadLogItem,
} from '@/features/instance/operations/queries/getReadLog';
import { getRouteApi } from '@tanstack/react-router';
import { LogsDataTable } from '@/features/instance/log/LogsDataTable';
import { ViewLogModal } from '@/features/instance/log/modals/ViewLogModal';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { renderBadgeLogLevelText, renderBadgeLogLevelVariant } from '@/components/ui/utils/badgeLogLevel';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

type RowData = {
	original: ReadLogItem;
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

const isValidDateRange = (startDate?: Date, endDate?: Date) => {
	if (!startDate && !endDate) return true;
	if (!startDate || !endDate) return true;

	const start = new Date(startDate);
	const end = new Date(endDate);
	return start <= end;
};

const route = getRouteApi('');

export function Logs() {
	const { instanceId } = route.useParams();
	const [logFilters, setLogFilters] = useState<z.infer<typeof LogFiltersSchema>>({
		limit: 1000,
		order: 'desc',
	});

	const [isViewLogModalOpen, setIsViewLogModalOpen] = useState(false);
	const [selectedLogData, setSelectedLogData] = useState<ReadLogItem | undefined>();
	const {
		data: instanceLogs,
		isLoading,
		refetch: refetchInstanceLogs,
	} = useSuspenseQuery(getReadLogQueryOptions({ instanceId, logFilters }));

	const form = useForm<z.infer<typeof LogFiltersSchema>>({
		resolver: zodResolver(LogFiltersSchema),
		defaultValues: {
			order: 'desc',
		},
		mode: 'onChange',
	});

	const onRowClick = (rowData: RowData): void => {
		setSelectedLogData(rowData.original);
		setIsViewLogModalOpen(true);
	};

	const submitFilters = async (data: z.infer<typeof LogFiltersSchema>) => {
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
		await setLogFilters(data);
		refetchInstanceLogs();
	};

	const resetFilters = async () => {
		form.reset();
		await setLogFilters({
			limit: 1000,
			level: undefined,
			from: undefined,
			until: undefined,
			order: 'desc',
		});
		refetchInstanceLogs();
	};

	return (
		<div className="grid grid-cols-1 gap-4 text-white md:grid-cols-12">
			<section className="col-span-1 md:col-span-4 lg:col-span-3">
				<h2 className="pb-6 text-2xl">Log Filters</h2>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitFilters)} className="flex-col space-y-5">
						<FormField
							control={form.control}
							name="limit"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Log Limit</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(parseInt(value));
										}}
										defaultValue="1000"
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select log limit" defaultValue="1000" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="1000">1000</SelectItem>
												<SelectItem value="500">500</SelectItem>
												<SelectItem value="250">250</SelectItem>
												<SelectItem value="100">100</SelectItem>
												<SelectItem value="10">10</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="level"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Log Level</FormLabel>
									<Select
										onValueChange={(value) => {
											if (value === 'undefined') {
												field.onChange(undefined);
												return;
											}
											field.onChange(value);
										}}
										defaultValue={field.value}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select log level" defaultValue={undefined} />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="undefined">All</SelectItem>
												<SelectItem value="notify">Notify</SelectItem>
												<SelectItem value="error">Error</SelectItem>
												<SelectItem value="warn">Warn</SelectItem>
												<SelectItem value="info">Info</SelectItem>
												<SelectItem value="debug">Debug</SelectItem>
												<SelectItem value="trace">Trace</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="from"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Start Date:</FormLabel>
									<FormControl>
										<Input
											type="datetime-local"
											value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''}
											onChange={(e) => {
												const val = e.target.value;
												field.onChange(val ? new Date(val) : undefined);
											}}
											onBlur={field.onBlur}
											name={field.name}
											ref={field.ref}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="until"
							render={({ field }) => (
								<FormItem>
									<FormLabel>End Date:</FormLabel>
									<FormControl>
										<Input
											type="datetime-local"
											value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''}
											onChange={(e) => {
												const val = e.target.value;
												field.onChange(val ? new Date(val) : undefined);
											}}
											onBlur={field.onBlur}
											name={field.name}
											ref={field.ref}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="order"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Log Order</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
										}}
										defaultValue={field.value}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Log order" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="asc">Ascending</SelectItem>
												<SelectItem value="desc">Descending</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" variant="positiveOutline" className="w-full mt-4">
							Apply Filters
						</Button>
						<Button type="reset" variant="destructiveOutline" onClick={() => resetFilters()} className="w-full mt-2">
							Clear Filters
						</Button>
					</form>
				</Form>
			</section>
			<section className="col-span-1 md:col-span-8 lg:col-span-9">
				{isLoading ? (
					<div>Loading...</div>
				) : (
					<div className="h-32">
						<LogsDataTable columns={columns} data={instanceLogs} onRowClick={onRowClick} />
					</div>
				)}
			</section>
			<ViewLogModal isModalOpen={isViewLogModalOpen} setIsModalOpen={setIsViewLogModalOpen} data={selectedLogData} />
		</div>
	);
}


