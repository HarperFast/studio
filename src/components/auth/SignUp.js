import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Row, Col, Label } from 'reactstrap';
import { NavLink, useLocation } from 'react-router-dom';
import useAsyncEffect from 'use-async-effect';
import queryString from 'query-string';
import { useStoreState } from 'pullstate';

import handleSignup from '../../functions/auth/handleSignup';
import Loader from '../shared/Loader';
import appState from '../../functions/state/appState';

function SignUp() {
	const { search } = useLocation();
	const { code, htuk, pageName, pageUri } = queryString.parse(search);
	const auth = useStoreState(appState, (s) => s.auth);
	const theme = useStoreState(appState, (s) => s.theme);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({ coupon_code: code, htuk, pageName, pageUri });
	const [showToolTip, setShowToolTip] = useState(false);

	useAsyncEffect(async () => {
		if (formState.submitted) {
			const newFormState = await handleSignup({ formData, theme });
			if (!auth.email && newFormState) setFormState(newFormState);
		}
	}, [formState]);

	useEffect(() => {
		if (!formState.submitted) setFormState({});
		// eslint-disable-next-line
	}, [formData]);

	return (
		<div className="login-form">
			{formState.submitted ? (
				<Loader header="creating your account" spinner relative />
			) : (
				<>
					<Form>
						<h2 className="mb-2 instructions">Sign Up</h2>
						<span className="mb-2 login-nav-link error d-inline-block">{formState.error}</span>
						<Label className="mb-3 d-block">
							<span className="mb-2 d-inline-block">First Name</span>
							<Input
								id="firstname"
								name="fname"
								required
								maxLength={40}
								autoComplete="given-name"
								type="text"
								title="first name"
								placeholder="Jane"
								value={formData.firstname || ''}
								disabled={formState.submitted}
								onChange={(e) => setFormData({ ...formData, firstname: e.target.value })}
							/>
						</Label>
						<Label className="mb-3 d-block">
							<span className="mb-2 d-inline-block">Last Name</span>
							<Input
								id="lastname"
								name="lname"
								maxLength={40}
								required
								autoComplete="family-name"
								type="text"
								title="last name"
								placeholder="Doe"
								value={formData.lastname || ''}
								disabled={formState.submitted}
								onChange={(e) => setFormData({ ...formData, lastname: e.target.value })}
							/>
						</Label>
						<Label className="mb-3 d-block">
							<span className="mb-2 d-inline-block">Email</span>
							<Input
								id="email"
								autoComplete="email"
								name="email"
								maxLength={80}
								required
								className="mb-2"
								type="text"
								title="email"
								placeholder="jane.doe@harperdb.io"
								value={formData.email || ''}
								disabled={formState.submitted}
								onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
							/>
						</Label>
						<Label className="mb-3 d-block">
							<Row>
								<span className="mb-2 d-inline-block">Subdomain</span>
								<Col className="subdomain-form">
									<Input
										id="subdomain"
										name="subdomain"
										required
										className=""
										type="text"
										title="subdomain"
										placeholder="janedev"
										value={formData.subdomain || ''}
										disabled={formState.submitted}
										onChange={(e) =>
											setFormData({ ...formData, subdomain: e.target.value.substring(0, 14).toLowerCase() })
										}
									/>
								</Col>
								<Col className="subdomain-label">
									.harperdbcloud.com{' '}
									<Button color="link" onClick={() => setShowToolTip(!showToolTip)}>
										<i className="fa fa-question-circle" />
									</Button>
								</Col>
							</Row>
						</Label>
						{showToolTip && <i className="subdomain-explanation">The URL of your Harper Cloud Instances</i>}
						<Label className="mb-3 d-block">
							<span className="mb-2 d-inline-block">Coupon Code (Optional)</span>
							<Input
								id="coupon_code"
								type="text"
								className="mb-2"
								name="coupon_code"
								title="coupon code"
								placeholder="XXXXXXXXX"
								value={formData.coupon_code || ''}
								onChange={(e) => setFormData({ ...formData, coupon_code: e.target.value })}
								disabled={formState.submitted}
							/>
						</Label>

						<div className="mt-3 mb-3 d-block">
							<div className="disclaimer">
								By creating an account, you agree to the&nbsp;
								<a href="https://harperdb.io/legal/privacy-policy/" target="_blank" rel="noopener noreferrer">
									Privacy Policy
								</a>
								&nbsp;and&nbsp;
								<a
									href="https://harperdb.io/legal/harperdb-cloud-terms-of-service/"
									target="_blank"
									rel="noopener noreferrer"
								>
									Terms of Service
								</a>
							</div>
						</div>

						<Button
							id="sign-up"
							block
							type="submit"
							className="border-0 rounded-pill btn-gradient-blue"
							disabled={formState.submitted}
							onClick={() => setFormState({ submitted: true })}
						>
							{formState.submitted ? <i className="text-white fa fa-spinner fa-spin" /> : <span>Sign Up For Free</span>}
						</Button>
					</Form>
					<div className="px-4 mt-3">
						<NavLink to="/" className="login-nav-link d-inline-block">
							Already Have An Account? Sign In Instead.
						</NavLink>
					</div>
				</>
			)}
		</div>
	);
}

export default SignUp;
