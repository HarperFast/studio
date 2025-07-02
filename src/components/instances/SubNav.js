import React from 'react';
import { Navbar, Nav } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';

import Local from './filter/Local';
import Cloud from './filter/Cloud';
import Search from './filter/Search';
import Refresh from './filter/Refresh';
import Free from './filter/Free';
import ErrorFallback from '../shared/ErrorFallback';
import addError from '../../functions/api/lms/addError';

function SubNav({ refreshInstances, unlimitedLocalInstall, unPaid }) {
  return (
    <ErrorBoundary onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })} FallbackComponent={ErrorFallback}>
      <Navbar className="app-subnav">
        <Nav navbar>
          <Local />
          <Cloud />
          <Search />
          <Refresh refreshInstances={refreshInstances} />
          {(unlimitedLocalInstall || unPaid) && <Free local={unlimitedLocalInstall} />}
        </Nav>
      </Navbar>
    </ErrorBoundary>
  );
}

export default SubNav;
