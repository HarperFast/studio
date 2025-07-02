import { Outlet } from 'react-router';
import { Col, Container, Row } from 'reactstrap';

function AuthLayout() {
	return (
		<Container fluid="xs" className="h-100">
			<Row xs="1" sm="2" className="h-100">
				<Col className="p-5 auth-studio-info d-none d-sm-flex justify-content-center align-items-center">
					<div className="auth-studio-info-container">
						<h1 className="auth-title">Harper Studio</h1>
						<span className="mb-4 auth-subtitle d-inline-block">Manage all your Harper instances.</span>
						<ul className="auth-info-list-items">
							<li>
								<h3 className="item-title">Manage All Instances</h3>
								<span className="item-subtitle">Set access, cluster, monitor, and more.</span>
							</li>
							<li>
								<h3 className="item-title">Embedded API Server</h3>
								<span className="item-subtitle">Harper components give you unlimited application flexibility.</span>
							</li>
							<li>
								<h3 className="item-title">Fully Managed Cloud & 5G Instances</h3>
								<span className="item-subtitle">Go from zero to code in minutes.</span>
							</li>
							<li>
								<h3 className="item-title">Deploy Anywhere</h3>
								<div className="mt-3">
									<a
										href="https://hub.docker.com/r/harperdb/harperdb"
										target="_blank"
										rel="noreferrer"
										className="deploy-subitem"
									>
										Docker
									</a>
									<a
										href="https://www.npmjs.com/package/harperdb"
										target="_blank"
										rel="noreferrer"
										className="deploy-subitem"
									>
										npm
									</a>
									<a
										href="https://docs.harperdb.io/docs/deployments/install-harperdb"
										target="_blank"
										rel="noreferrer"
										className="deploy-subitem"
									>
										all options
									</a>
								</div>
							</li>
						</ul>
					</div>
				</Col>
				<Col className="p-5 d-flex justify-content-center align-items-center auth-form-container">
					<Outlet />
				</Col>
			</Row>
		</Container>
	);
}

export default AuthLayout;
