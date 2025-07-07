import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function ErrorComponent({ error }: { error: Error }) {
	const { user, isLoading: isUserLoading } = useAuth();

	return (
		<Card className="text-red p-5 border border-red rounded-md">
			<CardHeader>
				<CardTitle className="text-2xl">
					<h2>Component Error</h2>
				</CardTitle>
				<CardDescription>{error.message}</CardDescription>
			</CardHeader>
			<CardContent>
				{user && !isUserLoading ? (
					<Link to="/orgs">
						<Button>
							{' '}
							<ArrowLeft /> See Orgs List
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
			</CardContent>
		</Card>
	);
}
