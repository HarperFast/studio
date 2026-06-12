import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { cn } from '@/lib/cn';
import { SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import z from 'zod';

export function LogsFiltersForm({
	form,
	resetFilters,
	submitFilters,
	showLogName,
	showFilter,
	isOpen,
	onOpenChange,
}: {
	form: UseFormReturn<z.infer<typeof LogFiltersFormSchema>>;
	resetFilters: () => void;
	submitFilters: (data: z.infer<typeof LogFiltersFormSchema>) => void;
	showLogName?: boolean;
	showFilter?: boolean;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	// On mobile the panel is toggled from the compact toolbar in the parent; on desktop it is always shown.
	return (
		<Card className={cn(isOpen ? 'block' : 'hidden', 'mt-3 md:mt-0 md:block')}>
			<CardHeader className="hidden md:block">
				<button
					type="button"
					onClick={() => onOpenChange(!isOpen)}
					aria-expanded={isOpen}
					aria-controls="logs-filters-content"
					className="flex w-full items-center justify-between md:pointer-events-none"
				>
					<CardTitle className="flex items-center gap-2 text-base">
						<SlidersHorizontalIcon className="size-4 text-muted-foreground" />
						Filters
					</CardTitle>
				</button>
			</CardHeader>
			<CardContent id="logs-filters-content">
				<Form {...form}>
					<form
						id="instance-edit-log-filters-form"
						name="instance-edit-log-filters-form"
						onSubmit={form.handleSubmit(submitFilters)}
						className="flex-col space-y-4"
					>
						{showFilter && (
							<FormField
								control={form.control}
								name="filter"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<div className="relative">
												<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
												<Input
													type="search"
													placeholder="Search logs…"
													className="pl-9"
													value={field.value ?? ''}
													onChange={field.onChange}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{showLogName && (
							<FormField
								control={form.control}
								name="log_name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Log file</FormLabel>
										<Select onValueChange={field.onChange} value={field.value ?? undefined}>
											<SelectTrigger className="w-full bg-white dark:bg-grey-700">
												<SelectValue placeholder="Select log file" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectItem value="hdb.log">Application (hdb.log)</SelectItem>
													<SelectItem value="system.log">System (system.log)</SelectItem>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="limit"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Limit</FormLabel>
										<Select onValueChange={field.onChange} value={field.value ?? undefined}>
											<SelectTrigger className="w-full bg-white dark:bg-grey-700">
												<SelectValue placeholder="Limit" />
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
										<FormLabel>Level</FormLabel>
										<Select onValueChange={field.onChange} value={field.value ?? undefined}>
											<SelectTrigger className="w-full bg-white dark:bg-grey-700">
												<SelectValue placeholder="Level" />
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
						</div>
						<FormField
							control={form.control}
							name="from"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Start date</FormLabel>
									<FormControl>
										<Input type="datetime-local" value={field.value ?? undefined} onChange={field.onChange} />
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
									<FormLabel>End date</FormLabel>
									<FormControl>
										<Input type="datetime-local" value={field.value ?? undefined} onChange={field.onChange} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex items-center gap-2 pt-1">
							<Button type="submit" variant="positiveOutline" className="grow">
								Apply Filters
							</Button>
							<Button type="reset" variant="destructiveOutline" onClick={resetFilters}>
								Clear
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
