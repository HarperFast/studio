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
	error: Error | { message: string | ReactNode };
	title?: string;
	showReturnToHome?: boolean;
	children?: ReactNode;
}

export function ErrorComponent({ className, error, title, showReturnToHome, children }: ErrorProps) {
	const { user, isLoading: isUserLoading } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);

	return (
		<Card className={cn('text-red p-5 border border-red rounded-md m-12 mt-36', className)}>
			<CardHeader>
				<CardTitle className="text-2xl">
					<h2>{title ?? 'Component Error'}</h2>
				</CardTitle>
				<CardDescription>{error.message}</CardDescription>
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
