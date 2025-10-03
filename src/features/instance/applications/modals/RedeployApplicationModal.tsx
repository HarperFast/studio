import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Ban, RefreshCwIcon } from 'lucide-react';
import { FormEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';

export function RedeployApplicationModal({
	isModalOpen = false,
	setIsModalOpen,
	redeployPackage,
	isRedeployPackagePending,
	packageUrl,
}: {
	readonly isModalOpen: boolean;
	readonly setIsModalOpen: (value: boolean) => void;
	readonly redeployPackage: (applicationUrl: string) => void;
	readonly isRedeployPackagePending?: boolean;
	readonly packageUrl?: string;
}) {
	const methods = useForm({
		defaultValues: {
			applicationUrl: packageUrl,
		},
	});

	const { setFocus, control, handleSubmit } = methods;

	const submitForm = ({ applicationUrl }: { applicationUrl: string | undefined }) => {
		if (applicationUrl) {
			redeployPackage(applicationUrl);
		}
	};

	useEffect(() => {
		setFocus('applicationUrl');
	}, [setFocus]);

	return (
		<Dialog
			onOpenChange={() => {
				setIsModalOpen(!isModalOpen);
				methods.reset({ applicationUrl: packageUrl });
			}}
			open={isModalOpen}
		>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Redeploy Package</DialogTitle>
					<DialogDescription> Redeploy this package?</DialogDescription>
				</DialogHeader>

				<div>
					<Form {...methods}>
						<form className="flex flex-col w-full gap-4" onSubmit={handleSubmit(submitForm)}>
							<FormField
								control={control}
								name="applicationUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Package Reference</FormLabel>
										<FormControl>
											<Input
												type="text"
												defaultValue={packageUrl}
												placeholder="https://github.com/HarperDB/nextjs-example"
												{...field}
												onChange={(e: FormEvent<HTMLInputElement>) => {
													field.onChange(e.currentTarget.value);
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								variant="positiveOutline"
								type="submit"
								className="w-full rounded-full"
								disabled={isRedeployPackagePending}
							>
								<RefreshCwIcon /> Redeploy Application
							</Button>
							<Button
								type="button"
								variant="default"
								className="w-full rounded-full"
								onClick={() => {
									setIsModalOpen(false);
									methods.reset({ applicationUrl: packageUrl });
								}}
								disabled={isRedeployPackagePending}
							>
								<Ban /> Cancel
							</Button>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
