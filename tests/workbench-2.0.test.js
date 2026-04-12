const test = require('node:test');
const assert = require('node:assert/strict');

test('workbench role normalization keeps new customer/staff/admin model stable', () => {
  const {
    normalizeRole,
    isWorkbenchUser,
    hasWorkbenchPermission
  } = require('../miniapp/utils/workbench');

  assert.equal(normalizeRole('user'), 'customer');
  assert.equal(normalizeRole('customer'), 'customer');
  assert.equal(normalizeRole('staff'), 'staff');
  assert.equal(normalizeRole('admin'), 'admin');

  assert.equal(isWorkbenchUser('customer'), false);
  assert.equal(isWorkbenchUser('user'), false);
  assert.equal(isWorkbenchUser('staff'), true);
  assert.equal(isWorkbenchUser('admin'), true);

  assert.equal(hasWorkbenchPermission(['verify', 'viewOrders'], 'verify'), true);
  assert.equal(hasWorkbenchPermission(['verify', 'viewOrders'], 'manageCampaigns'), false);
});

test('cloud-api surfaces cloud function failures as thrown errors', async () => {
  global.wx = {
    cloud: {
      callFunction() {
        return Promise.resolve({
          result: {
            code: -1,
            msg: '模拟失败'
          }
        });
      }
    }
  };

  const { callCloud } = require('../miniapp/utils/cloud-api');

  await assert.rejects(
    () => callCloud('opsApi', { action: 'getWorkbenchSummary' }),
    /模拟失败/
  );

  delete global.wx;
});
