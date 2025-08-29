import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';

interface ErrorProps {
	className?: string | undefined;
	error: Error | { message: string | ReactNode };
	title?: string;
	showReturnToHome?: boolean;
}

export function ErrorComponent({ className, error, title, showReturnToHome }: ErrorProps) {
	const { user, isLoading: isUserLoading } = useOverallAuth();

	return (
		<Card className={cn('text-red p-5 border border-red rounded-md m-12 mt-36', className)}>
			<CardHeader>
				<CardTitle className="text-2xl">
					<h2>{title ?? 'Component Error'}</h2>
				</CardTitle>
				<CardDescription>{error.message}</CardDescription>
			</CardHeader>
			{showReturnToHome !== false && (<CardContent>
				{user && !isUserLoading ? (
					<Link to={isLocalStudio ? '/browse' : '/orgs'}>
						<Button>
							{' '}
							<ArrowLeft /> Return to Home
						</Button>
					</Link>
				) : (
					<Link to="/">
						<Button>
							{' '}
							<ArrowLeft /> Go to Sign In Page
						</Button>
					</Link>
				)}
			</CardContent>)}
		</Card>
	);
}
