import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { AddCouponSchema, AddCouponType } from '@/features/organization/mutations/AddCouponSchema';
import { useAddCouponToOrganization } from '@/features/organization/mutations/addCouponToOrganization';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function AddCouponModal({
	organizationId,
	organizationName,
	isOpen,
	onClose,
}: {
	organizationId: string;
	organizationName?: string;
	isOpen: boolean;
	onClose: () => void;
}) {
	const { mutate, isPending } = useAddCouponToOrganization();

	const form = useForm<AddCouponType>({
		resolver: zodResolver(AddCouponSchema),
		defaultValues: {
			couponId: '',
		},
	});

	const { handleSubmit, control, reset } = form;

	useEffect(() => {
		if (isOpen) {
			reset({ couponId: '' });
		}
	}, [isOpen, reset]);

	const onSubmit = useCallback(
		(values: AddCouponType) => {
			mutate(
				{ organizationId, couponId: values.couponId },
				{
					onSuccess: (error?: string) => {
						if (!error) {
							toast.success('Success', {
								description: `Coupon "${values.couponId}" added to ${organizationName || organizationId}.`,
							});
							onClose();
						} else {
							toast.error('Error', {
								description: error || 'Failed to add coupon.',
							});
						}
					},
				},
			);
		},
		[mutate, organizationId, organizationName, onClose],
	);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Coupon</DialogTitle>
					<DialogDescription>
						Add a coupon code to{' '}
						{organizationName || organizationId}. This coupon will be applied to the next billing cycle.
						<br />
						Coupons can be created in our{' '}
						<a
							href="https://dashboard.stripe.com/"
							target="_blank"
							rel="noreferrer"
							className="text-purple hover:underline"
						>
							Stripe Dashboard
						</a>.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={handleSubmit(onSubmit)}>
						<div className="grid gap-4 py-4">
							<FormField
								control={control}
								name="couponId"
								render={({ field }) => (
									<FormItem className="grid items-center gap-4">
										<FormLabel>Coupon ID</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="e.g. 100OFF"
												disabled={isPending}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={onClose}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending ? 'Adding...' : 'Add Coupon'}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
