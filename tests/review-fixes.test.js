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

test('refund request planning creates both order state and review queue records', () => {
  const { buildRefundRequestPlan } = require('../miniapp/cloudfunctions/payApi/refund-flow');
  const serverDate = Symbol('serverDate');

  assert.deepEqual(buildRefundRequestPlan({
    orderId: 'order-1',
    orderNo: 'ORD202604150001',
    requesterOpenid: 'openid-1',
    previousStatus: 'paid',
    refundAmount: 1990,
    reason: '重复下单'
  }, serverDate), {
    orderUpdate: {
      status: 'refund_requested',
      refundReason: '重复下单',
      refundRequestedAt: serverDate,
      updatedAt: serverDate
    },
    refundRequestData: {
      orderId: 'order-1',
      orderNo: 'ORD202604150001',
      requesterOpenid: 'openid-1',
      reason: '重复下单',
      status: 'pending',
      previousStatus: 'paid',
      refundAmount: 1990,
      createdAt: serverDate,
      updatedAt: serverDate
    }
  });

  assert.deepEqual(buildRefundRequestPlan({
    orderId: 'order-2',
    requesterOpenid: 'openid-2',
    previousStatus: 'paid',
    refundAmount: 0,
    reason: ''
  }, serverDate), {
    orderUpdate: {
      status: 'refund_requested',
      refundReason: '',
      refundRequestedAt: serverDate,
      updatedAt: serverDate
    },
    refundRequestData: {
      orderId: 'order-2',
      orderNo: '',
      requesterOpenid: 'openid-2',
      reason: '',
      status: 'pending',
      previousStatus: 'paid',
      refundAmount: 0,
      createdAt: serverDate,
      updatedAt: serverDate
    }
  });
});

test('refund workflow writes review queue records, executes refund settlement, and uses composite refund filters', () => {
  const payApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'index.js'), 'utf8');
  const refundFlow = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'refund-flow.js'), 'utf8');
  const commerceApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'commerceApi', 'index.js'), 'utf8');
  const opsApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'index.js'), 'utf8');
  const ordersPage = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'orders', 'orders.js'), 'utf8');
  const profilePage = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'profile', 'profile.js'), 'utf8');
  const profileWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'profile', 'profile.wxml'), 'utf8');

  assert.match(payApi, /collection\('refund_requests'\)\.add/);
  assert.match(refundFlow, /status:\s*'refund_requested'/);
  assert.match(opsApi, /cloud\.cloudPay\.refund/);
  assert.match(opsApi, /status:\s*'refunded'/);
  assert.match(commerceApi, /case 'getMyOrderCounts'/);
  assert.match(commerceApi, /status === 'refund'/);
  assert.match(ordersPage, /key:\s*'refund'/);
  assert.doesNotMatch(ordersPage, /key:\s*'refund_requested'/);
  assert.match(profilePage, /getMyOrderCounts/);
  assert.doesNotMatch(profilePage, /getMyOrders', status: 'all'/);
  assert.doesNotMatch(profilePage, /getMyOrders', status: 'pending'/);
  assert.match(profileWxml, /data-status="refund"/);
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

test('interactive templates avoid dynamic event handler bindings', () => {
  for (const relPath of [
    path.join('miniapp', 'pages', 'lottery', 'lottery.wxml'),
    path.join('miniapp', 'pages', 'package-usage', 'package-usage.wxml')
  ]) {
    const source = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    assert.doesNotMatch(source, /bindtap="\{\{/);
    assert.doesNotMatch(source, /catchtap="\{\{/);
  }
});

test('mall page and content API use category-based mall taxonomy', () => {
  const mallWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'mall', 'mall.wxml'), 'utf8');
  const mallJs = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'mall', 'mall.js'), 'utf8');
  const contentApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'contentApi', 'index.js'), 'utf8');

  for (const category of ['五行泡浴', '百草元气灸', '靶向敷贴', '精油系列', '超值套餐']) {
    assert.match(mallJs, new RegExp(category));
  }

  for (const legacyTab of ['全部推荐', '推拿服务', '周期套餐', '甄选产品']) {
    assert.doesNotMatch(mallWxml, new RegExp(legacyTab));
  }

  assert.match(mallJs, /activeTab:\s*MALL_CATEGORIES\[0\]/);
  assert.match(mallJs, /category,\s*\n\s*page,/);
  assert.match(contentApi, /showInMall:\s*true/);
  assert.match(contentApi, /productCondition\.category\s*=\s*resolvedCategory/);
  assert.match(contentApi, /excludeCampaignLinkedPackages/);
  assert.match(contentApi, /item\.type !== 'package'/);
  assert.match(contentApi, /featuredProducts:\s*visibleFeaturedProducts/);
});

test('product detail share action uses native share button', () => {
  const productDetailWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'product-detail', 'product-detail.wxml'), 'utf8');

  assert.match(productDetailWxml, /open-type="share"/);
  assert.doesNotMatch(productDetailWxml, /bindtap="onShare"/);
});

test('catalog asset paths resolve inside the published mini program root', () => {
  const { visibleProductsData, retainedFissionProduct } = require('../scripts/catalog_data');
  const miniprogramRoot = path.join(repoRoot, 'miniapp');

  for (const product of [...visibleProductsData, retainedFissionProduct]) {
    for (const imagePath of product.images || []) {
      const normalizedPath = imagePath.replace(/^\//, '').replace(/\//g, path.sep);
      const absolutePath = path.join(miniprogramRoot, normalizedPath);
      assert.equal(
        fs.existsSync(absolutePath),
        true,
        `missing published asset for ${product.name}: ${imagePath}`
      );
    }
  }
});

test('catalog source derives all products from visible products plus retained fission product', () => {
  const {
    visibleProductsData,
    retainedFissionProduct,
    allProductsData
  } = require('../scripts/catalog_data');

  assert.equal(allProductsData.length, visibleProductsData.length + 1);
  assert.strictEqual(allProductsData[0], visibleProductsData[0]);
  assert.strictEqual(allProductsData[allProductsData.length - 1], retainedFissionProduct);
});

test('fission campaign seed data stays environment-agnostic', () => {
  const { fissionCampaigns } = require('../scripts/catalog_data');

  assert.equal(Array.isArray(fissionCampaigns), true);
  assert.equal(fissionCampaigns.length > 0, true);
  assert.equal(typeof fissionCampaigns[0].productId, 'string');
  assert.doesNotMatch(fissionCampaigns[0].productId, /^[a-f0-9]{32}$/);
  assert.equal(fissionCampaigns[0].soldCount, 0);
  assert.equal(fissionCampaigns[0].newCustomers, 0);
  assert.equal(fissionCampaigns[0].totalCashback, 0);
});

test('mall single-character search falls back to the active category list', () => {
  const mallJs = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'mall', 'mall.js'), 'utf8');

  assert.doesNotMatch(mallJs, /trimmed\.length === 1\)\s*return/);
});

test('workbench catalog exposes formal category and mall visibility', () => {
  const catalogWxml = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'workbench', 'catalog', 'catalog.wxml'), 'utf8');
  const catalogJs = fs.readFileSync(path.join(repoRoot, 'miniapp', 'pages', 'workbench', 'catalog', 'catalog.js'), 'utf8');

  assert.match(catalogWxml, /item\.category/);
  assert.match(catalogWxml, /showInMall|商城/);
  assert.match(catalogJs, /categoryLabel|mallVisibilityLabel|showInMall/);
});

test('review mode backend fails closed and exposes a minimal runtime contract', () => {
  const growthApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'growthApi', 'index.js'), 'utf8');

  assert.match(growthApi, /case 'getTongueRuntimeConfig'/);
  assert.match(growthApi, /case 'reanalyzeTongueReport'/);
  assert.match(growthApi, /if \(runtime\.isInReview\)\s*\{\s*const reviewRecord = await createTongueReportRecord/s);
  assert.match(growthApi, /isReviewMode:\s*true/);
  assert.match(growthApi, /reviewSavedAt:\s*db\.serverDate\(\)/);
  assert.match(growthApi, /condition\.isReviewMode = true/);
  assert.match(growthApi, /buildReviewSafeReport/);
  assert.match(growthApi, /allowReanalyzeAfterReview/);
  assert.match(growthApi, /reanalyzedAt:\s*db\.serverDate\(\)/);
  assert.match(growthApi, /reanalyzeSource:\s*'review_record'/);
});

test('review mode home content can override banners and share image with safe assets', () => {
  const contentApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'contentApi', 'index.js'), 'utf8');

  assert.match(contentApi, /return getHomeContent\(OPENID,\s*event\)/);
  assert.match(contentApi, /shareImageUrl:\s*runtime\.reviewConfig\.safeShareImageUrl \|\| ''/);
  assert.match(contentApi, /reviewConfig\.enabled && reviewConfig\.safeBannerUrl/);
  assert.match(contentApi, /rest\.banners = \[reviewConfig\.safeBannerUrl\]/);
});

test('page json files avoid unsupported share config flags', () => {
  for (const relPath of [
    path.join('miniapp', 'pages', 'index', 'index.json'),
    path.join('miniapp', 'pages', 'tongue', 'tongue.json'),
    path.join('miniapp', 'pages', 'fission', 'fission.json'),
    path.join('miniapp', 'pages', 'product-detail', 'product-detail.json'),
    path.join('miniapp', 'pages', 'tongue-report', 'tongue-report.json')
  ]) {
    const jsonText = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    assert.doesNotMatch(jsonText, /"enableShareAppMessage"\s*:/);
    assert.doesNotMatch(jsonText, /"enableShareTimeline"\s*:/);
  }
});


test('payCallback uses CAS update for idempotency', () => {
  const payApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'payApi', 'index.js'), 'utf8');
  assert.match(payApi, /casUpdate\.stats\.updated === 0/);
  assert.match(payApi, /status:\s*_\.\s*neq\s*\(\s*'paid'\s*\)/);
});

test('verifyPackage uses conditional atomic decrement and expiry check', () => {
  const opsApi = fs.readFileSync(path.join(repoRoot, 'miniapp', 'cloudfunctions', 'opsApi', 'index.js'), 'utf8');
  assert.match(opsApi, /packageExpireAt\s*&&\s*new\s+Date\s*\(\s*item\.packageExpireAt\s*\)\s*<\s*new\s+Date\s*\(\s*\)/);
  assert.match(opsApi, /packageRemaining\.\${serviceName}.*_\.\s*gt\s*\(\s*0\s*\)/);
  assert.match(opsApi, /packageRemaining\.\${serviceName}.*_\.\s*inc\s*\(\s*-1\s*\)/);
});
