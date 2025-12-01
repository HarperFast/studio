import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { CheckIcon, CopyIcon, TerminalIcon } from 'lucide-react';
import { FormState, UseFormWatch } from 'react-hook-form';
import { z } from 'zod';
import { NewApplicationSchema } from './schema';
import { useCLISteps } from './useCLISteps';

export function CLIInstructions({
	defaultApplicationName,
	formState,
	watch,
}: {
	defaultApplicationName: string,
	formState: FormState<z.infer<typeof NewApplicationSchema>>,
	watch: UseFormWatch<z.infer<typeof NewApplicationSchema>>,
}) {
	const applicationName = watch('applicationName') || defaultApplicationName;
	const cliSteps = useCLISteps(applicationName);
	const cliCopyClicks = useCopyToClipboard(
		...cliSteps.map(step => step.code),
	);

	return <>

		<CardHeader>
			<CardTitle>Deploy with Harper CLI</CardTitle>
			<CardDescription>
				Follow these steps to deploy your application using the Harper CLI
			</CardDescription>
		</CardHeader>
		<CardContent className="space-y-6">

			{cliSteps.map((cliStep, index) => (
				<div key={cliStep.title} className="space-y-3">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
							{index + 1}
						</div>
						<h3>{cliStep.title}</h3>
					</div>
					<div className="ml-8">
						<div className="bg-black rounded-lg p-4 flex items-center justify-between group">
							<code className="text-sm overflow-auto pl-8 -indent-8 wrap-anywhere">{cliStep.code}</code>
							<Button
								type="button"
								variant="default"
								size="sm"
								onClick={cliCopyClicks[index]}
							>
								<CopyIcon className="w-4 h-4" />
							</Button>
						</div>
						{cliStep.note && <p className="text-muted-foreground text-sm mt-2">{cliStep.note}</p>}

						{cliStep.alert && (<Alert className="mt-2">
							<TerminalIcon className="w-4 h-4" />
							<AlertDescription>{cliStep.alert}</AlertDescription>
						</Alert>)}
					</div>

					<Separator className="bg-black" />
				</div>
			))}


			{applicationName && (
				<div className="bg-accent rounded-lg p-4">
					<p className="text-sm">
						<strong>Application Name:</strong> {applicationName}
					</p>
					<p className="text-muted-foreground text-sm mt-2">
						Your application will be deployed with this name
					</p>
				</div>
			)}

			<Button
				className="w-full"
				variant="secondary"
				disabled={!formState.isValid}
			>
				<CheckIcon className="w-4 h-4 mr-2" />
				I Have Completed These Steps
			</Button>
		</CardContent>

	</>;
}
