import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { UseFormReturn } from 'react-hook-form';
import { LogFiltersFormSchema } from '@/features/instance/operations/queries/getReadLog';
import z from 'zod';

export function LogsFiltersForm({
	form,
	resetFilters,
	submitFilters,
}: {
	form: UseFormReturn;
	resetFilters: () => void;
	submitFilters: (data: z.infer<typeof LogFiltersFormSchema>) => void;
}) {
	return (
		<div>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(submitFilters)} className="flex-col space-y-5">
					<FormField
						control={form.control}
						name="limit"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Log Limit</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select log limit" />
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
								<Select onValueChange={field.onChange} value={field.value}>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select log level" />
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
									<Input type="datetime-local" value={field.value} onChange={field.onChange} />
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
									<Input type="datetime-local" value={field.value} onChange={field.onChange} />
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
								<Select onValueChange={field.onChange} value={field.value}>
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
		</div>
	);
}
