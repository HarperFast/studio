// import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { getInstanceTypeOptions } from '@/features/cluster/queries/getInstanceTypeQuery';
// import { renderInstanceTypeOption } from '@/shared/functions/InstanceType';
// import { useQuery } from '@tanstack/react-query';
// import { Controller } from 'react-hook-form';

// function InstanceTypeSelectInput({ defaultValue, name, control, rules }) {
// 	const { data: instanceTypes } = useQuery(getInstanceTypeOptions());
// 	return (
// 		<Controller
// 			control={control}
// 			name={name as TName}
// 			rules={rules}
// 			defaultValue={defaultValue as undefined}
// 			render={({ field }) => (
// 				<Select onValueChange={field.onChange} {...field}>
// 					<SelectTrigger className="w-full">
// 						<SelectValue placeholder="Select Instance Type" />
// 					</SelectTrigger>
// 					<SelectContent>
// 						<SelectGroup>
// 							{instanceTypes?.map((type) => (
// 								<SelectItem key={type.id} value={type.id}>
// 									{renderInstanceTypeOption(type.id)}
// 								</SelectItem>
// 							))}
// 						</SelectGroup>
// 					</SelectContent>
// 				</Select>
// 			)}
// 		/>
// 	);
// }

// export default InstanceTypeSelectInput;
