import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form/FormField';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { Separator } from '@/components/ui/separator';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { RocketIcon } from 'lucide-react';
import { Control, FormState } from 'react-hook-form';
import { z } from 'zod';
import { NewApplicationSchema } from './schema';
import { templates } from './templates';

export function TemplateInstructions({
	control,
	formState,
	isCreatingFromTemplate,
}: {
	control: Control<z.infer<typeof NewApplicationSchema>>;
	formState: FormState<z.infer<typeof NewApplicationSchema>>;
	isCreatingFromTemplate: boolean;
}) {
	return (
		<>
			<CardHeader>
				<CardTitle>Choose a Template</CardTitle>
				<CardDescription>
					Start with a pre-configured template for common use cases
				</CardDescription>
			</CardHeader>
			<CardContent>
				<FormField
					control={control}
					name="contents.id"
					render={({ field }) => (
						<RadioGroup value={field.value} onValueChange={field.onChange}>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{templates.map((template) => (
									<div key={template.id} className="relative">
										<RadioGroupItem
											value={template.id}
											id={template.id}
											className="peer sr-only"
										/>
										<Label
											htmlFor={template.id}
											className="flex flex-col gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-accent peer-data-[state=checked]:border-green peer-data-[state=checked]:bg-primary/5"
										>
											<div>
												<div className="mb-1 flex items-center gap-2 justify-between">
													<div>{template.name}</div>
													<a
														href={template.githubUrl}
														target="_blank"
														rel="noopener noreferrer"
														onClick={onClickStopPropagation}
														className="opacity-70 hover:opacity-100 transition-colors -m-4 p-4"
													>
														<img
															src="/github/GitHub_Lockup_White.svg"
															alt="GitHub"
															className="h-4"
														/>
													</a>
												</div>
												<p className="text-muted-foreground text-sm">
													{template.description}
												</p>
											</div>
											<div className="flex flex-wrap gap-2">
												{template.tags.map((tag) => (
													<Badge key={tag} variant="outline">
														{tag}
													</Badge>
												))}
											</div>
										</Label>
									</div>
								))}
							</div>
						</RadioGroup>
					)}
				/>

				<Separator className="my-6 bg-border" />
				<Button
					className="w-full"
					disabled={!formState.isValid || isCreatingFromTemplate}
				>
					<RocketIcon className="w-4 h-4 mr-2" />
					Create from Template
				</Button>
			</CardContent>
		</>
	);
}
