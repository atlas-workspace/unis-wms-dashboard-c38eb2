'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const abc = require('../lib/abc-slotting');

test('ABC percentages and cumulative ranking classify A/B/C', () => {
  const rows = abc.aggregateAnalysis({
    skuMaster: [{sku:'A1', case_quantity:10},{sku:'B1', case_quantity:10},{sku:'C1', case_quantity:10}],
    outbound: [
      {sku:'A1', picked_units:80, picked_cases:8, order_id:'o1', number_of_order_lines:1},
      {sku:'B1', picked_units:15, picked_cases:2, order_id:'o2', number_of_order_lines:1},
      {sku:'C1', picked_units:5, picked_cases:1, order_id:'o3', number_of_order_lines:1},
    ],
    startDate:'2026-01-01', endDate:'2026-01-10', method:'outbound_units'
  });
  assert.equal(rows[0].sku, 'A1');
  assert.equal(rows[0].abcClass, 'A');
  assert.equal(rows[1].abcClass, 'B');
  assert.equal(rows[2].abcClass, 'C');
  assert.equal(rows[0].activityPct, 80);
  assert.equal(rows[2].cumulativePct, 100);
});

test('trend classification covers increasing decreasing and no activity', () => {
  assert.equal(abc.classifyTrend(130, 100).status, 'Rapidly Increasing');
  assert.equal(abc.classifyTrend(112, 100).status, 'Increasing');
  assert.equal(abc.classifyTrend(95, 100).status, 'Stable');
  assert.equal(abc.classifyTrend(80, 100).status, 'Decreasing');
  assert.equal(abc.classifyTrend(70, 100).status, 'Rapidly Decreasing');
  assert.equal(abc.classifyTrend(0, 0).status, 'No Activity');
  assert.equal(abc.classifyTrend(10, 0).status, 'New Item');
});

test('pick face quantity and cube velocity calculate correctly', () => {
  const rows = abc.aggregateAnalysis({
    skuMaster: [{sku:'PF', case_quantity:10, cases_per_pallet:50, case_cube:2}],
    outbound: [{sku:'PF', picked_units:100, picked_cases:10, order_id:'o1', each_pick:1}],
    startDate:'2026-01-01', endDate:'2026-01-10', config:{daysBetweenReplenishments:3, safetyFactors:{A:1.2}}
  });
  assert.equal(rows[0].cubeVelocity, 2);
  assert.equal(rows[0].recommendedUnits, 36);
  assert.equal(rows[0].recommendedCases, 3.6);
});

test('storage rules recommend bulk, rack plus reserve, controlled and oversized', () => {
  assert.equal(abc.recommendStorage({sku:{}, abcClass:'A', fullPalletPickPct:80, eachPickPct:0, casePickPct:0, avgInventoryPallets:5}).recommendedStorageType, 'Full-Pallet Bulk');
  assert.equal(abc.recommendStorage({sku:{}, abcClass:'A', fullPalletPickPct:0, eachPickPct:50, casePickPct:0, avgInventoryPallets:3}).recommendedStorageType, 'Rack Pick Face plus Bulk Reserve');
  assert.equal(abc.recommendStorage({sku:{hazmat_status:'Yes'}, abcClass:'C'}).recommendedStorageType, 'Controlled Storage');
  assert.equal(abc.recommendStorage({sku:{case_weight:100}, abcClass:'B'}).recommendedStorageType, 'Oversized Storage');
});

test('upload template validation catches missing headers', () => {
  const result = abc.validateCsvHeaders('sku-master', 'facility_id,customer_id,sku\n');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('item_description')));
});
