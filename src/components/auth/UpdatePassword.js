import React, { useEffect, useState } from 'react';
import { Label, Input, Button } from 'reactstrap';
import { useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import appState from '../../functions/state/appState';

import updatePassword from '../../functions/api/lms/updatePassword';
import Loader from '../shared/Loader';
import usePersistedUser from '../../functions/state/persistedUser';

function UpdatePassword() {
	const navigate = useNavigate();
	const auth = useStoreState(appState, (s) => s.auth);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const [persistedUser, setPersistedUser] = usePersistedUser({});

	const setPasswordError = () => {
		setFormData({});
		setFormState({ error: true });
	};

	// NOTE: Marketing requested to send a conversion event when this page is
	// loaded to indicate that the user in fact signed up.  Triggering here for now
	// because the only route to get here is via signup form.  if this becomes a destination
	// from multiple places, we need a solution that scopes the conversion call to the
	// correct action.
	useEffect(() => {
		if (window.lintrk) {
			window.lintrk('track', { conversion_id: 11485730 });
		}
	}, []);

	const submit = async () => {
		setFormState({ submitted: true });
		const { password } = formData;
		if (!password || !/^(?=.*[\d])(?=.*[A-Z])(?=.*[a-z])(?=.*[!@#$%^&*])[\w!@#$%^&*]{8,}$/.test(password)) {
			setPasswordError();
		} else {
			setFormState({ processing: true });

			const newAuth = await updatePassword({ auth, user_id: auth.user_id, password });

			if (!newAuth || newAuth.passwordError) {
				setPasswordError();
			} else {
				setPersistedUser({ ...persistedUser, pass: password });
				setTimeout(navigate('/'), 100);
			}
		}
	};

	return (
		<div className="d-flex justify-content-center align-items-center auth-centered-container">
			<div className="login-form">
				{formState.processing ? (
					<Loader header="setting account password" spinner relative />
				) : (
					<>
						<h2 className="mb-2 instructions">Add an account password</h2>
						<span className={`text-small text-bold d-inline-block my-2 ${formState.error ? 'text-danger' : ''}`}>
							<i>8 char min., 1 lower case, 1 upper case, 1 number, 1 special char.</i>
						</span>
						<Label className="mb-4 d-block">
							<Input
								id="password1"
								onChange={(e) => setFormData({ ...formData, password: e.target.value })}
								disabled={formState.submitted}
								className="mb-2 text-center"
								type="password"
								title="password"
								placeholder="Add Password"
							/>
						</Label>
						<Button
							type="submit"
							id="updateMyPassword"
							className="border-0 rounded-pill btn-gradient-blue"
							block
							onClick={submit}
							disabled={formState.submitted || formData.processing}
							title="Add Account Password"
						>
							Submit Account Password
						</Button>
					</>
				)}
			</div>
		</div>
	);
}

export default UpdatePassword;
