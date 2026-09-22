import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { defaultInstanceRoute, isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';

interface ErrorProps {
	className?: string | undefined;
	// `unknown`, not `Error`, so this stays assignable to TanStack Router's
	// ErrorRouteComponent: router-core types ErrorComponentProps['error'] as
	// `unknown` by default (DefaultErrorBoundaryTypes), and under
	// strictFunctionTypes a narrower parameter type is not assignable.
	// It also matches reality — a throw can be any value, not just an Error.
	error: unknown;
	title?: string;
	showReturnToHome?: boolean;
	children?: ReactNode;
}

/** Pull something renderable out of an arbitrary thrown value. */
function getErrorMessage(error: unknown): ReactNode {
	if (error instanceof Error) { return error.message; }
	if (typeof error === 'object' && error !== null && 'message' in error) {
		return (error as { message: string | ReactNode }).message;
	}
	if (typeof error === 'string') { return error; }
	return 'An unexpected error occurred.';
}

export function ErrorComponent({ className, error, title, showReturnToHome, children }: ErrorProps) {
	const { user, isLoading: isUserLoading } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	const message = getErrorMessage(error);

	return (
		<Card className={cn('text-red p-5 border border-red rounded-md m-12 mt-36', className)}>
			<CardHeader>
				<CardTitle className="text-2xl">
					<h2>{title ?? 'Component Error'}</h2>
				</CardTitle>
				<CardDescription>{message}</CardDescription>
			</CardHeader>
			<CardContent>
				{children}
				{showReturnToHome !== false && (user && !isUserLoading
					? (
						<Link to={isLocalStudio ? defaultInstanceRoute : defaultCloudRoute}>
							<Button>
								{' '}
								<ArrowLeft /> Return to Home
							</Button>
						</Link>
					)
					: (
						<Link to="/sign-in">
							<Button>
								{' '}
								<ArrowLeft /> Go to Sign In Page
							</Button>
						</Link>
					))}
			</CardContent>
		</Card>
	);
}
