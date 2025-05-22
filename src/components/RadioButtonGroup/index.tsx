'use client';

import type React from 'react';

import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Controller, type Control, type FieldValues, type FieldPath } from 'react-hook-form';

interface RadioButtonOption {
	value: string;
	label: string;
	icon?: React.ReactNode;
}

interface RadioButtonGroupProps<
	TFieldValues extends FieldValues = FieldValues,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
	options: RadioButtonOption[];
	defaultValue?: string;
	name: string;
	onChange?: (value: string) => void;
	control?: Control<TFieldValues>;
	rules?: Record<string, unknown>;
}

function RadioButtonGroup<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({ options, defaultValue, name, onChange, control, rules }: RadioButtonGroupProps<TFieldValues, TName>) {
	const [localValue, setLocalValue] = useState(defaultValue || '');

	// If control is provided, use React Hook Form's Controller
	if (control) {
		return (
			<Controller
				control={control}
				name={name as TName}
				rules={rules}
				defaultValue={defaultValue as undefined}
				render={({ field }) => (
					<RadioGroup
						value={field.value}
						onValueChange={(value) => {
							field.onChange(value);
							if (onChange) onChange(value);
						}}
						className="flex flex-wrap gap-2"
						name={field.name}
					>
						{options.map((option) => (
							<div key={option.value} className="flex items-center space-x-2">
								<RadioGroupItem value={option.value} id={`${name}-${option.value}`} className="sr-only peer" />
								<Label
									htmlFor={`${name}-${option.value}`}
									className={cn(
										'flex h-10 cursor-pointer items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-grey-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
										'peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground'
									)}
								>
									{option.icon && <span className="mr-2">{option.icon}</span>}
									{option.label}
								</Label>
							</div>
						))}
					</RadioGroup>
				)}
			/>
		);
	}

	// If no control is provided, use the component as before
	const handleValueChange = (newValue: string) => {
		setLocalValue(newValue);
		if (onChange) {
			onChange(newValue);
		}
	};

	return (
		<RadioGroup value={localValue} onValueChange={handleValueChange} className="flex flex-wrap gap-2" name={name}>
			{options.map((option) => (
				<div key={option.value} className="flex items-center space-x-2">
					<RadioGroupItem value={option.value} id={`${name}-${option.value}`} className="sr-only peer" />
					<Label
						htmlFor={`${name}-${option.value}`}
						className={cn(
							'flex h-10 cursor-pointer items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
							'peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground'
						)}
					>
						{option.icon && <span className="mr-2">{option.icon}</span>}
						{option.label}
					</Label>
				</div>
			))}
		</RadioGroup>
	);
}

export { RadioButtonGroup };
