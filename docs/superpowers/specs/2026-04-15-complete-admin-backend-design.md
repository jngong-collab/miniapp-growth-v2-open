# Complete Admin Backend Design

> Scope: complete the web admin backend and its dependent operational capabilities for the CloudBase-based miniapp project.

## Goal

Build a complete admin system that covers:

- Web owner console
- Web staff console
- unified auth and permissions
- orders, refunds, fulfillment, and verification
- catalog, packages, campaigns, and media assets
- leads, customers, followups, and messaging groundwork
- payment operations, refund durability, and reconciliation support
- settings, audit, initialization, migration, and health operations

This is not a page-only expansion. It is a full operational backend built on the existing `admin-web`, `adminApi`, `opsApi`, `payApi`, and CloudBase data model.

## Current Baseline

The repo already has a working owner-oriented admin surface:

- `admin-web` routes for login, dashboard, orders, catalog, campaigns, leads, settings, and staff
- `miniapp/cloudfunctions/adminApi` actions for auth, dashboard, orders, catalog, campaigns, leads, settings, staff, and audit
- real refund review in the admin path
- real product/config updates in the admin path
- manual CloudBase admin-account bootstrap

The existing backend is usable for a narrow phase-one owner workflow, but it is not yet a complete long-term operating console.

## System Boundary

The completed system keeps one admin frontend and extends the current CloudBase backend stack instead of introducing a second platform.

- `admin-web` remains the only web admin frontend
- `adminApi` remains the web admin BFF entrypoint
- `opsApi` remains the miniapp workbench/operations entrypoint until overlapping domain logic is unified
- `payApi` remains the payment and callback entrypoint
- CloudBase Auth remains the identity provider
- CloudBase database remains the source of truth for admin, business, and audit data
- CloudBase Hosting remains the web admin deployment target

The miniapp stays as the customer-facing transaction surface. The web backend becomes the operating system for owners, staff, finance, and platform admins.

## Architecture

### Frontend

`admin-web` will be evolved into a role-aware admin shell with route guards, menu guards, per-action permission gates, and domain-specific feature modules.

Suggested structure:

- `src/layouts`: shell, session handling, route guards
- `src/pages`: page entrypoints
- `src/features/<domain>`: domain-local hooks, DTO mapping, table columns, forms, dialogs
- `src/lib`: shared API client, error handling, permission helpers, storage helpers
- `src/components`: cross-domain UI components

### Backend

`adminApi` should stop growing as a single routing file and become a thin dispatcher plus reusable domain modules.

Suggested structure:

- `index.js`: routing, top-level error wrapping, request context
- `lib/context.js`: auth/session resolution, store scope, permission checks
- `lib/admin-access.js`: permission vocabulary
- `lib/admin-audit.js`: audit helpers
- `lib/helpers.js`: status mapping and shared DTO shaping
- `lib/modules-auth.js`
- `lib/modules-orders.js`
- `lib/modules-fulfillment.js`
- `lib/modules-catalog.js`
- `lib/modules-campaigns.js`
- `lib/modules-leads.js`
- `lib/modules-finance.js`
- `lib/modules-settings.js`
- `lib/modules-staff.js`
- `lib/modules-ops.js`

`opsApi` and `payApi` will keep their current responsibilities initially, but overlapping lifecycle logic must be unified so that admin-web, workbench, and payment callbacks do not drift.

## Product Modules

The complete backend is split into six subsystems.

### 1. Unified Identity And Permissions

Responsibilities:

- CloudBase username/password login for web admins
- owner and staff account lifecycle
- role templates
- page-level and action-level permissions
- login logs
- account status and lock handling
- strict store isolation

Key findings from the current codebase:

- login already works through `loginWithPassword(...)` and `auth.me`
- menu visibility exists, but route-level authorization is still missing
- empty permissions currently fall back to full admin permissions
- missing `storeId` can fall back to the first store record
- admin account creation/disable/reset is not implemented

### 2. Orders, Refunds, Fulfillment, Verification

Responsibilities:

- order list/detail/export
- refund review and refund execution
- fulfillment and verification operations
- fulfillment history and status logs
- consistent refund state machine across admin, workbench, and payment flows

Key findings from the current codebase:

- orders screen, detail drawer, export, and refund review already exist
- verification counters exist in dashboards, but admin verification actions do not
- order items already store verification/package fields from checkout
- admin and workbench currently use different refund state models
- large stores will hit current hard-coded list caps

### 3. Catalog, Packages, Campaigns, Media Assets

Responsibilities:

- product and package management
- package lifecycle and usage visibility
- campaign management
- campaign analytics
- shared asset library and media picker

Key findings from the current codebase:

- products, packages, and campaigns already support basic create/edit/toggle flows
- package data is split between product and package documents
- there is no asset management surface or upload helper
- list APIs are capped and lack real search/pagination
- current catalog/campaign modules do not consistently enforce `storeId`

### 4. CRM, Customers, Followups, Messaging

Responsibilities:

- leads
- customers/members
- tags and segmentation
- followup history
- messaging tasks and delivery records

Key findings from the current codebase:

- leads and followup editing are already wired end-to-end
- customer/member data exists only implicitly in `users`
- followups are upserted as a single current record, not a timeline
- there is no dedicated customer management UI
- no outbound CRM messaging API was found

### 5. Finance, Refund Durability, Reconciliation

Responsibilities:

- payment/refund operational views
- payment configuration completeness
- durable refund execution
- reconciliation reports
- exception handling
- finance exports

Key findings from the current codebase:

- no finance route or sidebar area exists in `admin-web`
- refund execution is real, but the admin path still performs direct gateway call plus DB mutation without durable intermediate recovery state
- `opsApi` already contains a better refund state machine, but it is not the admin source of truth
- `payApi` callbacks have no durable callback ledger or explicit post-pay recovery state
- bootstrap scripts do not provision full finance fixtures

### 6. Settings, Ops Tooling, Migration, Health

Responsibilities:

- store settings
- payment and notification settings
- feature flags
- initialization
- migration and repair tasks
- health and observability
- release and rollback support

Key findings from the current codebase:

- settings page already updates store, payment, and AI config
- initialization/seed logic exists only as manual scripts
- there is no real migration/versioning system
- there is no health endpoint or system status page
- environment configuration is not cleanly isolated from source control

## Roles

Recommended roles:

- `super_admin`
- `owner`
- `store_manager`
- `operator`
- `finance`
- `auditor`
- `clerk`

Permissions must be split into:

- page access permissions
- action permissions

Permission domains:

- `dashboard`
- `auth`
- `staff`
- `orders`
- `fulfillment`
- `catalog`
- `campaigns`
- `crm`
- `finance`
- `settings`
- `audit`
- `ops`

High-risk actions must require explicit permissions and richer audit records:

- refund review
- payment/refund config changes
- admin account creation/disable/reset
- role changes
- sensitive exports
- migrations and repair tasks

## Data Model

### Admin Identity

Upgrade `admin_accounts` into the canonical admin identity table with at least:

- `uid`
- `username`
- `displayName`
- `role`
- `permissions`
- `storeId`
- `status`
- `isPrimaryOwner`
- `invitedBy`
- `lastLoginAt`
- `lastLoginIp`
- `loginFailCount`
- `lockedUntil`
- `createdAt`
- `updatedAt`

Add:

- `admin_role_templates`
- `admin_login_events`

### Order, Refund, Fulfillment

Standardize order/refund state and add supporting records:

- `order_status_logs`
- `refund_reviews`
- `verification_records`

Core lifecycle states must be explicit:

- order: `pending_payment -> paid -> fulfilled/completed/closed`
- refund: `none -> pending -> refunding -> refunded` and `pending -> rejected`
- fulfillment: `unfulfilled -> partially_fulfilled -> fulfilled`
- verification: `unused -> used -> reversed`

### Catalog, Campaign, Assets

Add or standardize:

- `media_assets`
- `campaign_analytics_daily`

### CRM

Add or formalize:

- `customers`
- `customer_tags`
- `customer_tag_relations`
- `customer_followups`
- `customer_followup_events`
- `message_tasks`

### Finance

Add:

- `payment_records`
- `refund_records`
- `reconciliation_reports`
- `finance_exceptions`

### Settings And Ops

Add or standardize:

- `store_settings`
- `payment_settings`
- `notification_settings`
- `feature_flags`
- `ops_tasks`
- `audit_logs`

Audit logs should include:

- `storeId`
- `module`
- `action`
- `targetType`
- `targetId`
- `operatorUid`
- `operatorRole`
- `before`
- `after`
- `reason`
- `requestId`
- `createdAt`

## Page Map

Recommended primary navigation:

- `工作台`
- `订单中心`
- `履约中心`
- `商品中心`
- `营销中心`
- `客户中心`
- `财务中心`
- `员工与权限`
- `系统配置`
- `审计与运维`

Representative pages:

- dashboard overview and analysis
- orders list/detail
- refund review
- aftersales record
- verification console
- fulfillment records
- product list/editor
- package manager
- asset library
- campaign list/editor/analytics
- leads list
- customer list/detail
- tags
- followup records
- message tasks
- payment ledger
- refund ledger
- reconciliation reports
- finance exceptions
- admin accounts
- role templates
- login logs
- store settings
- transaction settings
- notification settings
- feature flags
- audit logs
- task center
- system health

## Delivery Strategy

Implementation must proceed in dependency order, not page order.

### Phase A: Shared Foundation

- standardize session/me contract
- add route and action permission enforcement
- clean up `admin_accounts`
- centralize audit and login events
- introduce migration/bootstrap scaffolding

### Phase B: Identity And Permissions

- admin account management
- role templates
- permission editor
- login logs

### Phase C: Orders And Fulfillment

- complete order center
- unify refund state machine
- add verification console and fulfillment records

### Phase D: Catalog And Campaigns

- add asset library
- improve package lifecycle
- improve campaign analytics

### Phase E: CRM And Finance

- add customer center
- add tags and followup history
- add finance pages and reconciliation support

### Phase F: Settings And Ops

- complete settings coverage
- add task center
- add health/status views
- add release, migration, and rollback workflows

## Parallel Ownership Boundaries

To allow subagent-driven development without collisions:

- shared contracts remain controller-owned first:
  - `admin-web/src/lib/admin-api.ts`
  - `admin-web/src/types/admin.ts`
  - `admin-web/src/App.tsx`
  - `admin-web/src/layouts/admin-shell.tsx`
  - `miniapp/cloudfunctions/adminApi/index.js`
  - `miniapp/cloudfunctions/adminApi/lib/context.js`
  - `miniapp/cloudfunctions/adminApi/lib/admin-access.js`
  - `miniapp/cloudfunctions/adminApi/lib/helpers.js`

- domain-owned first-batch write scopes:
  - auth/staff: `modules-auth.js`, `modules-staff.js`, staff/login pages, auth tests, schema/docs
  - orders/fulfillment: `modules-orders.js`, `refund.js`, orders page, refund/fulfillment tests
  - catalog/campaigns/assets: `modules-catalog.js`, `modules-campaigns.js`, catalog/campaign pages, new asset helpers/components
  - crm: `modules-leads.js`, leads page, CRM tests, schema/docs
  - finance: `payApi`, refund-state-machine integration, finance pages/routes, finance tests/docs
  - ops/settings: `modules-settings.js`, opsApi consistency, init/seed scripts, deploy/schema docs

No parallel implementation should start on shared contract files until their owner freezes the first contract batch.

## Testing Strategy

Each phase must include:

- cloud function behavior tests
- admin web route/page contract tests
- real CloudBase test-store integration runs
- deployment verification for Hosting routing and cloud function publish

Critical regression areas:

- unauthorized route access
- store isolation
- refund state transitions
- callback idempotency
- verification and package usage persistence
- settings completeness
- audit completeness

## Completion Criteria

The backend is complete only when:

- all six subsystems are operational
- owner, operator, finance, clerk, and super-admin flows are runnable end-to-end
- auth, refund, fulfillment, settings, and finance state changes are auditable
- bootstrap/migration/repair tasks are executable and documented
- the system is deployable and supportable in a real CloudBase environment

## Risks To Control Early

- permission vocabulary duplicated across frontend, backend, and tests
- inconsistent refund state machines across admin, ops, and pay callbacks
- missing `storeId` enforcement in product/campaign/settings flows
- asset model changes breaking existing URL-based rendering
- CRM metrics drifting when campaign/order source semantics change
- docs and bootstrap scripts lagging behind runtime behavior

## Recommendation

Proceed with one frozen master spec and a controller-owned implementation queue. Then dispatch parallel implementation only on disjoint write scopes after shared contracts are established in Phase A.
