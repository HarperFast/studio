import React, { useState } from 'react';
import { Form, Input, Button, Label } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { NavLink } from 'react-router-dom';

import isEmail from '../../functions/util/isEmail';
import resetPassword from '../../functions/api/lms/resetPassword';
import Loader from '../shared/Loader';

function ResetPassword() {
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});

	useAsyncEffect(async () => {
		const { submitted, processing } = formState;
		let errorMessageTimeout;
		if (submitted && !processing) {
			const { email } = formData;

			if (!isEmail(email)) {
				setFormState({ error: 'A valid email is required' });
				errorMessageTimeout = setTimeout(() => setFormState({}), 5000);
			} else {
				setFormState({ processing: true });
				const response = await resetPassword({ email });

				if (response.error && response.message !== 'User does not exist') {
					setFormState({ error: response.message });
					errorMessageTimeout = setTimeout(() => setFormState({}), 5000);
				} else {
					setFormState({ success: true });
				}
			}
		}
		return () => {
			clearTimeout(errorMessageTimeout);
		};
	}, [formState]);

	useAsyncEffect(() => {
		if (!formState.submitted) setFormState({});
	}, [formData]);

	return (
		<div className="login-form">
			{formState.processing ? (
				<Loader header="Resetting password" spinner relative />
			) : formState.success ? (
				<Loader
					header="success!"
					body="Check the provided email for a temporary password."
					links={[{ to: '/', text: 'Go to Sign In', className: 'text-center' }]}
					relative
				/>
			) : (
				<>
					<Form>
						<h2 className="mb-2 instructions">Enter your account email</h2>
						<span className="mb-2 d-inline-block">
							If a matching account exists, we&apos;ll send you a password reset link.
						</span>
						<span className="login-nav-link error d-inline-block">{formState.error}</span>
						<Label className="mb-3 d-block">
							<span className="mb-2 d-inline-block">Email</span>
							<Input
								name="email"
								autoComplete="email"
								required
								id="email"
								onChange={(e) => {
									e.currentTarget.focus();
									setFormData({ ...formData, email: e.target.value.trim().toLowerCase() });
								}}
								value={formData.email || ''}
								disabled={formState.submitted}
								type="text"
								title="email"
								placeholder="email address"
							/>
						</Label>
						<Button
							id="sendPasswordResetEmail"
							onClick={() => setFormState({ submitted: true })}
							disabled={formState.submitted}
							className="border-0 rounded-pill btn-gradient-blue"
							title="Send Password Reset Email"
							block
							type="submit"
							color="purple"
						>
							Send Password Reset Email
						</Button>
					</Form>
					<div className="px-4 mt-3 d-flex justify-content-between">
						<NavLink to="/" className="login-nav-link d-inline-block">
							Back to Sign In
						</NavLink>
						<NavLink to="/sign-up" className="login-nav-link d-inline-block">
							Sign Up for Free
						</NavLink>
					</div>
				</>
			)}
		</div>
	);
}

export default ResetPassword;
