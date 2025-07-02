import React, { useState } from 'react';
import { Form, Input, Button, Label } from 'reactstrap';
import { useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import Loader from '../shared/Loader';
import useInstanceAuth from '../../functions/state/instanceAuths';
import userInfo from '../../functions/api/instance/userInfo';
import appState from '../../functions/state/appState';

function SignIn() {
	const url = useStoreState(appState, (s) => s.instances.find((i) => i.compute_stack_id === 'local')?.url);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const [instanceAuths, setInstanceAuths] = useInstanceAuth({});
	const navigate = useNavigate();

	const submit = async () => {
		setFormState({ submitted: true });
		const { user, pass } = formData;
		if (!user || !pass) {
			setFormState({ error: 'All fields are required' });
		} else {
			const result = await userInfo({ auth: { user, pass }, url });

			if (result.error && result.type === 'catch') {
				setFormState({ error: 'SSL ERROR. ACCEPT SELF-SIGNED CERT?', url });
			} else if ((result.error && result.message === 'Login failed') || result.error === 'Login failed') {
				setFormState({
					error: 'Login failed. Using instance credentials?',
					url: 'https://harperdb.io/docs/harperdb-studio/instances/#instance-login',
				});
			} else if (result.error) {
				setFormState({ error: result.message || result.error });
			} else {
				setInstanceAuths({
					...instanceAuths,
					local: {
						valid: true,
						user: formData.user,
						pass: formData.pass,
						super: result.role.permission.super_user,
						structure: result.role.permission.structure_user,
					},
				});
				setTimeout(navigate('/o/local/i/local/browse'), 0);
			}
		}
	};
	const keyDown = (e) => {
		if (e.code === 'Enter') {
			submit();
		}
	};

	return (
		<div className="login-form">
			{formState.submitted ? (
				<Loader header="Signing in" spinner relative />
			) : (
				<Form>
					<h2 className="mb-2 instructions">Please sign into Harper</h2>
					{formState.error && (
						<a
							href={formState.url || null}
							target="_blank"
							rel="noopener noreferrer"
							className="my-2 text-center text-bold text-small d-block text-nowrap text-decoration-none"
						>
							<span className="login-nav-link error">{formState.error}</span>
							{formState.url && <i className="ms-2 fa fa-lg fa-external-link-square text-danger" />}
						</a>
					)}
					<Label className="mb-3 d-block">
						<span className="mb-2 d-inline-block">Instance user</span>
						<Input
							id="username"
							autoComplete="username"
							required
							onChange={(e) => setFormData({ ...formData, user: e.target.value })}
							type="text"
							title="instance user"
							placeholder="Instance user"
							value={formData.user || ''}
							disabled={formState.submitted}
							onKeyDown={keyDown}
						/>
					</Label>
					<Label className="mb-4 d-block">
						<span className="mb-2 d-inline-block">Password</span>
						<Input
							id="password"
							name="password"
							required
							autoComplete="current-password"
							onChange={(e) => setFormData({ ...formData, pass: e.target.value })}
							className="mb-2"
							type="password"
							title="instance password"
							placeholder="Instance password"
							disabled={formState.submitted}
							value={formData.pass || ''}
							onKeyDown={keyDown}
						/>
					</Label>
					<Button
						id="signIn"
						className="border-0 rounded-pill btn-gradient-blue"
						onClick={submit}
						title="Sign In My Account"
						block
						disabled={formState.submitted}
					>
						Sign In
					</Button>
				</Form>
			)}
		</div>
	);
}

export default SignIn;
