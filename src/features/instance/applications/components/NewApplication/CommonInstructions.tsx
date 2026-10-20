import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { LengthLimitedInput } from '@/components/ui/form/LengthLimitedInput';
import { Control } from 'react-hook-form';
import { z } from 'zod';
import { NewApplicationSchema } from './schema';

export function CommonInstructions({
	control,
	defaultApplicationName,
}: {
	control: Control<z.infer<typeof NewApplicationSchema>>;
	defaultApplicationName: string;
}) {
	return (
		<>
			<CardHeader>
				<CardTitle>Application Name</CardTitle>
				<CardDescription>
					Choose a name for your new API application
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					<FormField
						control={control}
						name="applicationName"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Name</FormLabel>
								<LengthLimitedInput
									type="text"
									autoCapitalize="words"
									autoComplete="off"
									autoFocus={true}
									placeholder={defaultApplicationName}
									maxLength={NewApplicationSchema.shape.applicationName.maxLength!}
									{...field}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>

					<p className="text-muted-foreground text-sm">
						Use lowercase letters, numbers, underscores, and hyphens
					</p>
				</div>
			</CardContent>
		</>
	);
}
