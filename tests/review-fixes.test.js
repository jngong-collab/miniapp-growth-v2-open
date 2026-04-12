const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('internal callback auth fails closed without PAY_CALLBACK_SECRET', () => {
  const payAuth = require('../miniapp/cloudfunctions/payApi/internal-auth');

  assert.equal(payAuth.getInternalSecret({}), null);
  assert.equal(payAuth.getInternalSecret({ PAY_CALLBACK_SECRET: '' }), null);
  assert.equal(payAuth.isAuthorizedInternalCall({ _internalSecret: 'known' }, {}), false);
  assert.equal(payAuth.isAuthorizedInternalCall({ _internalSecret: 'known' }, { PAY_CALLBACK_SECRET: 'known' }), true);
});

test('refund requests only mark the order for follow-up processing', () => {
  const { buildRefundRequestPlan } = require('../miniapp/cloudfunctions/payApi/refund-flow');
  const serverDate = Symbol('serverDate');

  assert.deepEqual(buildRefundRequestPlan('重复下单', serverDate), {
    orderUpdate: {
      status: 'refunding',
      refundReason: '重复下单',
      refundRequestedAt: serverDate
    },
    rollbackRelatedState: false
  });

  assert.deepEqual(buildRefundRequestPlan('', serverDate), {
    orderUpdate: {
      status: 'refunding',
      refundReason: '',
      refundRequestedAt: serverDate
    },
    rollbackRelatedState: false
  });
});

test('package usage state is derived consistently across pages', () => {
  const {
    enrichPackageItemState,
    countActivePackageItems
  } = require('../miniapp/utils/package-state');

  const activeService = enrichPackageItemState({
    _id: 'service-active',
    productType: 'service',
    productName: '单次推拿',
    packageRemaining: {}
  });
  const usedService = enrichPackageItemState({
    _id: 'service-used',
    productType: 'service',
    productName: '单次推拿',
    packageRemaining: { used: true }
  });
  const partialPackage = enrichPackageItemState({
    _id: 'package-active',
    productType: 'package',
    productName: '调理套餐',
    packageItems: [
      { name: '推拿', count: 3 },
      { name: '泡浴', count: 2 }
    ],
    packageRemaining: {
      推拿: 1,
      泡浴: 0
    }
  });
  const usedPackage = enrichPackageItemState({
    _id: 'package-used',
    productType: 'package',
    productName: '调理套餐',
    packageItems: [
      { name: '推拿', count: 1 }
    ],
    packageRemaining: {
      推拿: 0
    }
  });

  assert.equal(activeService.isUsed, false);
  assert.equal(usedService.isUsed, true);
  assert.equal(partialPackage.isUsed, false);
  assert.equal(usedPackage.isUsed, true);
  assert.deepEqual(partialPackage.remainingItems, [
    { name: '推拿', total: 3, remaining: 1, used: 2 },
    { name: '泡浴', total: 2, remaining: 0, used: 2 }
  ]);
  assert.equal(countActivePackageItems([
    activeService,
    usedService,
    partialPackage,
    usedPackage
  ]), 2);
});

test('global theme exports legacy token aliases still used by old pages', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'miniapp', 'app.wxss'), 'utf8');

  for (const token of [
    '--color-text:',
    '--color-text-light:',
    '--color-text-secondary:',
    '--color-bg-white:',
    '--font-xs:',
    '--font-sm:',
    '--font-base:',
    '--font-md:',
    '--font-lg:',
    '--font-xl:'
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
