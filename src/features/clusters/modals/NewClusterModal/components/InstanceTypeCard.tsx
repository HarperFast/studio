import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import { Controller } from 'react-hook-form';

export const InstanceTypeCard = ({ name, options, selectedPlan, errors, control }) => {
	console.log('slectedPlan', selectedPlan);
	return (
		<Controller
			name="plan"
			control={control}
			render={({ field }) => (
				<div className="grid gap-4 md:grid-cols-3">
					{options.map((instanceType) => (
						<label
							key={instanceType.id}
							className={`relative cursor-pointer rounded-lg border-2 p-6 transition-all duration-200 hover:shadow-md ${
								selectedPlan === instanceType.id
									? 'border-blue-500 bg-blue-50 shadow-md'
									: errors.plan
									? 'border-red-300 bg-red-50'
									: 'border-gray-200  hover:border-gray-300'
							}`}
						>
							<Input
								type="radio"
								{...field}
								value={instanceType.id}
								checked={selectedPlan === instanceType.id}
								className="sr-only"
							/>
							{selectedPlan === instanceType.id}
							{/* Selection indicator */}
							<div className="absolute top-4 right-4">
								<div
									className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
										selectedPlan === instanceType.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
									}`}
								>
									{selectedPlan === instanceType.id && <Check className="h-3 w-3 text-white" />}
								</div>
							</div>

							{/* Badge */}
							{/* {instanceType.badge && (
								<div className="absolute -top-2 left-4">
									<span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
										{instanceType.badge}
									</span>
								</div>
							)} */}

							{/* Content */}
							<div className="mt-2">
								<h3 className="text-lg font-semibold text-gray-900">{instanceType.title}</h3>
								<p className="mt-2 text-sm text-gray-600">{instanceType.description}</p>
								{/* {instanceType.price && <p className="mt-4 text-2xl font-bold text-gray-900">{instanceType.price}</p>} */}
								{instanceType.selfHosted && <p className="mt-4 text-2xl font-bold text-gray-900">self hosted</p>}
							</div>

							{/* Features list for selected card */}
							{selectedPlan === instanceType.id && (
								<div className="mt-4 pt-4 border-t border-blue-200">
									<ul className="space-y-2 text-sm text-white">
										<li className="flex items-center">
											<Check className="h-4 w-4 text-blue-500 mr-2" />
											Unlimited projects
										</li>
										<li className="flex items-center">
											<Check className="h-4 w-4 text-blue-500 mr-2" />
											24/7 support
										</li>
										<li className="flex items-center">
											<Check className="h-4 w-4 text-blue-500 mr-2" />
											Advanced analytics
										</li>
									</ul>
								</div>
							)}
						</label>
					))}
				</div>
			)}
		/>
	);
};
