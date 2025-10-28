import { useResendEmailVerification } from '@/features/auth/hooks/useResendEmailVerification';
import { Link, useSearch } from '@tanstack/react-router';
import { MouseEvent, useCallback } from 'react';
import { toast } from 'sonner';

export function Verifying() {
	const { email }: { email?: string; } = useSearch({ strict: false });

	const { mutate: resendEmailVerification, isPending } = useResendEmailVerification();

	const resendCode = useCallback((e: MouseEvent) => {
		e.preventDefault();
		if (email) {
			resendEmailVerification({ email }, {
				onSuccess: (message) => {
					toast.success('Code Sent', {
						description: `${message}`,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
				},
			});
		}
		return false;
	}, [email, resendEmailVerification]);

	return (
		<div className="text-white w-lg flex flex-col gap-4">
			<h1 className="text-3xl font-light">
				<span
					aria-hidden="true"
					className="text-2xl animate-flower-dance mr-4"
					title="Loading"
				>🌼</span>
				Check your email!
			</h1>
			<p>Your account has been created! You should receive an email with a link to <strong>[Verify My Email]</strong>!
			</p>
			<p>From: <strong>harper@notifications.harperfabric.com</strong></p>
			<p>To: <strong>{email || 'your email'}</strong></p>
			<p>Can you click it? Then we can carry on to more fun things!</p>

			<div className="underline flex gap-4">
				<Link className="text-sm hover:text-blue-300" to="/sign-in" search={{ me: email }}>
					I did it, let me sign in!
				</Link>
				<Link className="text-sm opacity-50 hover:text-blue-300" to={undefined} onClick={resendCode} disabled={isPending}>
					Send me another code, please.
				</Link>
			</div>
		</div>
	);
}
