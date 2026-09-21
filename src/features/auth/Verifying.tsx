import { Link, useSearch } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { MouseEvent, useCallback } from 'react';
import { toast } from 'sonner';
import { AuthHeading } from './components/AuthHeading';
import { useResendEmailVerification } from './hooks/useResendEmailVerification';

export function Verifying() {
	const { email }: { email?: string } = useSearch({ strict: false });

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
		<div className="auth-form flex flex-col gap-4">
			<AuthHeading icon={MailCheck} title="Check your email!" subtitle="Open the verification link in your inbox." />
			<p>
				From:{' '}
				<strong>
					harper@<wbr />notifications.<wbr />harperfabric.com
				</strong>
			</p>
			<p>
				To: <strong>{email || 'your email'}</strong>
			</p>
			<p>Can you click it? Then we can carry on to more fun things!</p>

			<div className="auth-links">
				<Link
					className="text-sm text-muted-foreground hover:text-foreground dark:text-inherit dark:hover:text-blue-300"
					to="/sign-in"
					search={{ me: email }}
				>
					I did it, let me sign in!
				</Link>
				<Link
					className="text-sm"
					to={undefined}
					onClick={resendCode}
					disabled={isPending}
				>
					Send me another code, please.
				</Link>
			</div>
		</div>
	);
}
