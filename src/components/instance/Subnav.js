import React from 'react';
import { Navbar, Nav, NavItem } from 'reactstrap';
import SelectDropdown from 'react-select';
import { NavLink, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../functions/state/appState';
import instanceState from '../../functions/state/instanceState';

import ErrorFallback from '../shared/ErrorFallback';
import addError from '../../functions/api/lms/addError';
import useInstanceAuth from '../../functions/state/instanceAuths';
import config from '../../config';

function Subnav({ routes = [] }) {
	const { compute_stack_id, customer_id } = useParams();
	const [instanceAuths] = useInstanceAuth({});
	const navigate = useNavigate();
	const location = useLocation();
	const defaultBrowseURL = useStoreState(instanceState, (s) => s.defaultBrowseURL);
	const alarms = useStoreState(appState, (s) => s.alarms && s.alarms[compute_stack_id]?.alarmCounts.total, [
		compute_stack_id,
	]);
	const { options, activeOption } = useStoreState(
		appState,
		(s) => {
			const selectedInstance = s.instances && s.instances.find((i) => i.compute_stack_id === compute_stack_id);
			const otherInstances = s.instances && s.instances.filter((i) => i.compute_stack_id !== compute_stack_id);

			return {
				options:
					otherInstances &&
					otherInstances.map((i) => ({
						label: (
							<span>
								<i
									className={`d-none d-sm-inline-block fa me-2 fa-${
										i.is_local
											? 'server'
											: ['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'CONFIGURING_NETWORK'].includes(i.status)
												? 'circle-exclamation'
												: 'cloud'
									} ${['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'CONFIGURING_NETWORK'].includes(i.status) && 'opacity-25'}`}
								/>
								{i.instance_name}{' '}
								{['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'CONFIGURING_NETWORK'].includes(i.status) &&
									`(${i.status.replace(/_/g, ' ').toLowerCase()})`}
							</span>
						),
						value: i.compute_stack_id,
						has_auth: instanceAuths[i.compute_stack_id],
						is_unavailable: ['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'CONFIGURING_NETWORK'].includes(i.status),
					})),
				activeOption: {
					label: (
						<span>
							<i
								className={`d-none d-sm-inline-block fa me-2 fa-${!selectedInstance ? '' : selectedInstance?.is_local ? 'server' : 'cloud'}`}
							/>
							{selectedInstance?.instance_name}
						</span>
					),
					value: compute_stack_id,
				},
			};
		},
		[compute_stack_id]
	);

	const linkPrefix = `/o/${customer_id}/i/${compute_stack_id}`;
	const linkRoute = location.pathname.split(`/i/${compute_stack_id}`)[1].split('/')[1];
	const currentRoute = routes?.find((r) => r.link === linkRoute);

	const navigateFn = ({ value, has_auth, is_unavailable }) => {
		if (is_unavailable) {
			return false;
		}
		if (has_auth) {
			return navigate(`/o/${customer_id}/i/${value}/${currentRoute?.link}`);
		}
		return navigate(`/o/${customer_id}/instances/login`);
	};

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Navbar className="app-subnav">
				{!config.is_local_studio && (
					<Nav navbar className="instance-select">
						<SelectDropdown
							className="react-select-container"
							classNamePrefix="react-select"
							onChange={navigateFn}
							options={options || []}
							value={activeOption}
							defaultValue={activeOption.value}
							isSearchable={false}
							isClearable={false}
							isLoading={!options}
							noOptionsMessage={() => 'No other instances available'}
						/>
					</Nav>
				)}
				<Nav navbar className="instance-nav d-none d-lg-flex">
					{routes?.map((route) => (
						<NavItem key={route.path}>
							<NavLink
								title={route.link}
								className="nav-link"
								to={`${linkPrefix}/${route.link === 'browse' && defaultBrowseURL ? `${route.link}/${defaultBrowseURL}` : route.link}`}
							>
								<i className={`d-none d-sm-inline-block fa me-2 fa-${route.icon}`} />
								{route.label || route.link}
								{!!alarms && route.link === 'status' && <span className="badge">{alarms}</span>}
							</NavLink>
						</NavItem>
					))}
				</Nav>
				<Nav navbar className="instance-nav-select d-flex d-lg-none">
					<SelectDropdown
						className="react-select-container"
						classNamePrefix="react-select"
						width="200px"
						onChange={({ value }) => navigate(`${linkPrefix}/${value}`)}
						options={routes?.map((route) => ({
							label: (
								<span>
									<i className={`d-none d-sm-inline-block fa me-2 fa-${route.icon}`} />
									{route.label}
								</span>
							),
							value: route.link,
						}))}
						isLoading={!currentRoute?.link}
						value={{
							label: (
								<span>
									<i className={`d-none d-sm-inline-block fa me-2 fa-${currentRoute?.icon}`} />
									{currentRoute?.label}
								</span>
							),
							value: currentRoute?.link,
						}}
						defaultValue={currentRoute?.link}
						isSearchable={false}
						isClearable={false}
					/>
				</Nav>
			</Navbar>
		</ErrorBoundary>
	);
}

export default Subnav;
