import React, { useMemo } from 'react';
import { Navbar, Nav, NavItem, Button } from 'reactstrap';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../functions/state/appState';
import addError from '../functions/api/lms/addError';
import ErrorFallback from './shared/ErrorFallback';
import useInstanceAuth from '../functions/state/instanceAuths';
import config from '../config';
import usePersistedUser from '../functions/state/persistedUser';

function TopNav({ isMaintenance, loggedIn = false }) {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const auth = useStoreState(appState, (s) => s.auth);
	const customer = useStoreState(appState, (s) => s.customer);
	const theme = useStoreState(appState, (s) => s.theme);
	const themes = useStoreState(appState, (s) => s.themes);
	const [, setInstanceAuths] = useInstanceAuth({});
	const [persistedUser, setPersistedUser] = usePersistedUser({});
	const themeIndex = themes?.findIndex((t) => t === theme);
	const nextTheme = !theme || themeIndex === themes.length - 1 ? themes[0] : themes[themeIndex + 1];

	const showInviteBadge = useMemo(
		() => auth?.orgs?.filter((org) => org.status === 'invited').length,

		[auth.orgs]
	);

	const showManageIcon = useMemo(
		() => auth?.orgs?.find((o) => o.customer_id?.toString() === customer?.customer_id?.toString())?.status === 'owner',

		[auth.orgs, customer.customer_id]
	);

	const toggleTheme = (newValue) => {
		setPersistedUser({ ...persistedUser, theme: newValue });
		appState.update((s) => {
			s.theme = newValue;
		});
	};

	const logOut = () => {
		if (config.is_local_studio) {
			setInstanceAuths({ local: false });
		} else {
			appState.update((s) => {
				s.auth = false;
			});
			setPersistedUser({ theme });
			setInstanceAuths({});
		}
		navigate('/');
	};

	return (
		<ErrorBoundary
			onError={(error, componentStack) =>
				addError({
					error: { message: error.message, componentStack },
					customer_id: customer?.customer_id,
					compute_stack_id: null,
				})
			}
			FallbackComponent={ErrorFallback}
		>
			<Navbar id="app-nav" dark fixed="top" expand="xs">
				<div className="navbar-brand">
					{loggedIn ? (
						<NavLink to={config.is_local_studio ? `o/local/i/local/browse` : '/organizations'}>
							<div id="logo" title="Go to Organizations Home" />
						</NavLink>
					) : (
						<NavLink to="/">
							<div id="logo" title="Go to sign in page" />
						</NavLink>
					)}
				</div>

				<Nav className="ms-auto" navbar>
					{loggedIn && !isMaintenance && !config.is_local_studio && (
						<>
							<NavItem className="ms-0">
								<NavLink id="viewOrganizations" title="View or Switch Organizations" to="/organizations">
									<i className="fa fa-building d-inline-block" />
									<span className="d-none d-md-inline-block">Organizations</span>
									{showInviteBadge ? <span className="badge">{showInviteBadge}</span> : null}
								</NavLink>
							</NavItem>
							<div className={`active-org ${customer && pathname.indexOf(customer?.customer_id) !== -1 ? 'open' : ''}`}>
								<div className="text-white org-name">{customer.customer_name}</div>
								<div className="org-actions">
									<NavItem className="ms-0">
										<NavLink
											id="viewOrganizationInstances"
											title="View Organization Instances"
											to={`/o/${customer.customer_id}/instances`}
										>
											<i className="fa fa-th d-inline-block" />
											<span className="d-none d-lg-inline-block">Instances</span>
										</NavLink>
									</NavItem>
									{showManageIcon && (
										<>
											<NavItem>
												<NavLink
													id="manageOrganizationUsers"
													title="Manage Organization Users"
													to={`/o/${customer.customer_id}/users`}
												>
													<i className="fa fa-users d-inline-block" />
													<span className="d-none d-lg-inline-block">Users</span>
												</NavLink>
											</NavItem>
											<NavItem>
												<NavLink
													id="manageOrganizationBilling"
													title="Manage Organization Billing"
													to={`/o/${customer.customer_id}/billing`}
												>
													<i className="fa fa-credit-card d-inline-block" />
													<span className="d-none d-lg-inline-block">Billing</span>
													{customer?.current_payment_status?.status === 'invoice.payment_failed' ? (
														<span className="badge">!</span>
													) : null}
												</NavLink>
											</NavItem>
										</>
									)}
								</div>
							</div>
							<NavItem>
								<NavLink id="manageProfile" title="Manage My Profile" to="/profile">
									<i className="fa fa-user" />
									<span className="d-none d-xl-inline-block">Profile</span>
									{auth?.email_bounced ? <span className="badge">!</span> : null}
								</NavLink>
							</NavItem>
						</>
					)}
					{!config.is_local_studio && (
						<li className="nav-item">
							<a
								target="_blank"
								rel="noreferrer"
								href="https://harperdb.io/docs"
								id="viewResources"
								title="Harper Documentation"
							>
								<i className="fas fa-tools" />
								<span className="d-none d-xl-inline-block">Resources</span>
							</a>
						</li>
					)}
					{themes.length > 1 && (
						<NavItem>
							<Button
								color="link"
								id="changeTheme"
								tabIndex="0"
								title={`Switch to ${nextTheme} theme`}
								onKeyDown={(e) => e.keyCode !== 13 || toggleTheme(nextTheme)}
								onClick={() => toggleTheme(nextTheme)}
							>
								<i className="fas fa-palette" />
								<span className="d-none d-xl-inline-block">Theme</span>
							</Button>
						</NavItem>
					)}
					<NavItem>
						{loggedIn ? (
							<Button
								id="logOut"
								tabIndex="0"
								color="link"
								title="Log Out"
								onKeyDown={(e) => e.keyCode !== 13 || logOut()}
								onClick={logOut}
							>
								<i className="fa fa-sign-out-alt" />
								<span className="d-none d-xl-inline-block login-text-label">Sign Out</span>
							</Button>
						) : (
							<NavLink id="goToLogin" title="Log In" to="/">
								<i className="fa fa-sign-in-alt" />
								<span className="d-none d-xl-inline-block login-text-label">Sign In</span>
							</NavLink>
						)}
					</NavItem>
				</Nav>
			</Navbar>
		</ErrorBoundary>
	);
}

export default TopNav;
