import React from 'react';
import { useStoreState } from 'pullstate';
import locale from 'react-json-editor-ajrm/locale/en';
import JSONInput from 'react-json-editor-ajrm';

import appState from '../../../functions/state/appState';

function InstanceConfig({ instanceConfig }) {
  const theme = useStoreState(appState, (s) => s.theme);

  return (
    <JSONInput
      placeholder={instanceConfig}
      height="calc(100vh - 568px)"
      theme="light_mitsuketa_tribute"
      viewOnly
      colors={{
        background: 'transparent',
        default: theme === 'dark' ? '#aaa' : '#000',
        colon: theme === 'dark' ? '#aaa' : '#000',
        keys: theme === 'dark' ? '#aaa' : '#000',
        string: '#13c664',
        number: '#ea4c89',
        primitive: '#ffa500',
      }}
      style={{
        warningBox: { display: 'none' },
        body: { padding: '8px 0 0 0' },
      }}
      locale={locale}
      width="100%"
      confirmGood={false}
      waitAfterKeyPress={30000}
    />
  );
}

export default InstanceConfig;
