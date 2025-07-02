import React, { useState } from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';
import useNewInstance from '../../../functions/state/newInstance';
import ContentContainer from '../../shared/ContentContainer';
import RadioCheckbox from '../../shared/RadioCheckbox';
import DetailsSubheader from './DetailsSubheader';
import config from '../../../config';

function DetailsCloud() {
  const navigate = useNavigate();
  const { customer_id } = useParams();
  const { user_id, orgs } = useStoreState(appState, (s) => s.auth);
  const [newInstance, setNewInstance] = useNewInstance({});
  const is_unpaid = useStoreState(appState, (s) => s.customer.is_unpaid || newInstance.cloud_provider === 'akamai');
  const unusedCompute = useStoreState(appState, (s) => s.subscriptions?.cloud_compute?.filter((p) => p.value.active && p.value.compute_quantity_available) || []);
  const unusedStorage = useStoreState(
    appState,
    (s) => s.subscriptions?.cloud_storage?.filter((p) => p.value.active && p.value.storage_quantity_available >= p.value.data_volume_size) || [],
  );
  const products = useStoreState(
    appState,
    (s) =>
      newInstance.cloud_provider === 'verizon'
        ? s.products.wavelength_compute?.filter((p) => p.value.active) || []
        : newInstance.cloud_provider === 'akamai'
          ? s.products.akamai_compute?.filter((p) => p.value.active) || []
          : newInstance.showPrepaidCompute
            ? unusedCompute
            : s.products.cloud_compute.filter((p) => p.value.active),
    [newInstance.showPrepaidCompute],
  );
  const storage = useStoreState(
    appState,
    (s) => (newInstance.cloud_provider === 'akamai' ? false : newInstance.showPrepaidStorage ? unusedStorage : s.products.cloud_storage.filter((p) => p.value.active)),
    [newInstance.showPrepaidStorage],
  );

  const regions = useStoreState(appState, (s) =>
    newInstance.cloud_provider === 'verizon' ? s.wavelengthRegions : newInstance.cloud_provider === 'akamai' ? s.akamaiRegions : s.regions,
  );
  const hasCard = useStoreState(appState, (s) => s.hasCard);
  const [formState, setFormState] = useState({});
  const [formData, setFormData] = useState({ ...storage[0]?.value, ...products[0]?.value, ...newInstance });
  const isFree = !formData.compute_price && !formData.compute_subscription_id && !formData.storage_price && !formData.storage_subscription_id;
  const needsCard = products && storage && !hasCard && !isFree && !is_unpaid;
  const totalFreeCloudInstances = orgs.filter((o) => user_id === o.owner_user_id).reduce((a, b) => a + b.free_cloud_instance_count, 0);
  const freeCloudInstanceLimit = config.free_cloud_instance_limit;
  const canAddFreeCloudInstance = totalFreeCloudInstances < freeCloudInstanceLimit;
  const canProceedToNextPage = formData.stripe_plan_id && formData.instance_region && (newInstance.cloud_provider === 'akamai' || formData.stripe_storage_plan_id);

  useAsyncEffect(() => {
    const { submitted } = formState;
    const { stripe_plan_id, stripe_storage_plan_id, instance_region, instance_type, data_volume_size } = formData;
    if (submitted) {
      if (isFree && freeCloudInstanceLimit && !canAddFreeCloudInstance) {
        setFormState({ error: `You are limited to ${freeCloudInstanceLimit} free cloud instance${freeCloudInstanceLimit !== 1 ? 's' : ''} across organizations you own` });
      } else if (
        stripe_plan_id &&
        (stripe_storage_plan_id || newInstance.cloud_provider === 'akamai') &&
        instance_region &&
        instance_type &&
        (data_volume_size || newInstance.cloud_provider === 'akamai')
      ) {
        setNewInstance({ ...newInstance, ...formData });
        setTimeout(() => navigate(needsCard ? `/o/${customer_id}/instances/new/payment` : `/o/${customer_id}/instances/new/confirm`), 0);
      } else {
        setFormState({ error: 'All fields must be filled out.' });
      }
    }
  }, [formState]);

  useAsyncEffect(() => setFormState({}), [formData]);

  return (
    <>
      <Card id="cloudInstanceSpecs">
        <CardBody>
          <ContentContainer
            header="Instance RAM"
            subheader={<DetailsSubheader hasPrepaid={unusedCompute.length} newInstance={newInstance} setNewInstance={setNewInstance} toggleValue="showPrepaidCompute" />}
            maxHeight="120px"
          >
            {!products ? (
              <div className="text-center">
                <i className="fa fa-spinner fa-spin text-purple mt-5" />
              </div>
            ) : products.length ? (
              <RadioCheckbox
                id="stripe_plan_id"
                className="radio-button"
                type="radio"
                required
                onChange={(value) => setFormData({ ...formData, ...value })}
                options={products}
                defaultValue={newInstance.stripe_plan_id ? products.find((p) => p.value.stripe_plan_id === newInstance.stripe_plan_id) : products[0]}
              />
            ) : (
              <div className="text-center my-4 py-4">No products available at this time</div>
            )}
          </ContentContainer>
          {storage && (
            <ContentContainer
              header="Storage Size"
              subheader={<DetailsSubheader hasPrepaid={unusedStorage.length} newInstance={newInstance} setNewInstance={setNewInstance} toggleValue="showPrepaidStorage" />}
              maxHeight="120px"
            >
              <RadioCheckbox
                id="data_volume_size"
                className="radio-button"
                type="radio"
                required
                onChange={(value) => setFormData({ ...formData, ...value })}
                options={storage}
                defaultValue={newInstance.data_volume_size ? storage.find((p) => p.value.data_volume_size === newInstance.data_volume_size) : storage[0]}
              />
            </ContentContainer>
          )}
          <ContentContainer header="Instance Region" subheader="scroll for more" maxHeight="120px">
            {!regions ? (
              <div className="text-center">
                <i className="fa fa-spinner fa-spin text-purple mt-5" />
              </div>
            ) : regions.length ? (
              <RadioCheckbox
                id="instance_region"
                className="radio-button"
                type="radio"
                required
                onChange={(value) => setFormData({ ...formData, instance_region: value })}
                options={regions}
                value={formData.instance_region}
                defaultValue={newInstance.instance_region ? regions.find((p) => p.value === newInstance.instance_region) : regions[0]}
              />
            ) : (
              <div className="text-center my-4 py-4">No regions available at this time</div>
            )}
          </ContentContainer>
        </CardBody>
      </Card>
      <Row>
        <Col sm="6">
          <Button id="backToBasicInfo" onClick={() => navigate(`/o/${customer_id}/instances/new/meta_cloud`)} title="Back to Basic Info" block className="mt-3" color="purple">
            <i className="fa fa-chevron-circle-left me-2" />
            Basic Info
          </Button>
        </Col>
        <Col sm="6">
          <Button
            id={needsCard ? 'addPaymentMethod' : 'confirmInstanceDetails'}
            onClick={() => setFormState({ submitted: true })}
            title={needsCard ? 'Add Payment Method' : 'Confirm Instance Details'}
            block
            className="mt-3"
            color="purple"
            disabled={!canProceedToNextPage}
          >
            {needsCard ? 'Add Payment Method' : 'Confirm Instance Details'}
            <i className="fa fa-chevron-circle-right ms-2" />
          </Button>
        </Col>
      </Row>
      {formState.error && (
        <Card className="mt-3 error">
          <CardBody>{formState.error}</CardBody>
        </Card>
      )}
    </>
  );
}

export default DetailsCloud;
