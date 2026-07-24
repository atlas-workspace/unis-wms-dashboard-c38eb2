# ABC Inventory Slotting and Trend Analysis Formulas

This module keeps calculations scoped by `facility_code`, `customer_id`, and `sku`.

## ABC Classification

Default ranking method is outbound units. Other methods include outbound cases, outbound pallets, pick lines, order frequency, location visits, activity value, cube movement, and composite score.

- Annualized Outbound Units = Outbound Units ÷ Days in Period × 365
- Annualized Pick Lines = Pick Lines ÷ Days in Period × 365
- Activity % = SKU Rank Value ÷ Total Rank Value × 100
- Cumulative % = Running sum of Activity %
- A = cumulative up to threshold A (default 80%)
- B = cumulative above A up to threshold B (default 95%)
- C = remaining SKUs

## Inbound Trends

- Average Daily Inbound = Received Units ÷ Days
- Average Weekly Inbound = Received Units ÷ Weeks
- Inbound Frequency = Receipts containing SKU ÷ Period
- Average Receipt Quantity = Received Units ÷ Receipt Count
- Growth % = (Current Period - Previous Period) ÷ Previous Period × 100

## Outbound Trends

- Average Daily Outbound = Picked/Shipped Units ÷ Days
- Average Weekly Outbound = Picked/Shipped Units ÷ Weeks
- Order Frequency = Orders containing SKU ÷ Period
- Average Order Quantity = Picked/Shipped Units ÷ Order Count
- Growth % = (Current Period - Previous Period) ÷ Previous Period × 100

## Trend Classification Defaults

- Rapidly Increasing: > 25%
- Increasing: 10% to 25%
- Stable: -10% to 10%
- Decreasing: -10% to -25%
- Rapidly Decreasing: < -25%
- New Item: current activity with no prior activity
- No Activity: no current or prior activity

## Cube Velocity

- Case Cube = case cube field, or Length × Width × Height ÷ 1728 for cubic feet
- Outbound Cube Movement = Cases Shipped × Case Cube
- Inbound Cube Movement = Cases Received × Case Cube
- Cube Velocity = Outbound Cube Movement ÷ Days

## Pick Face Capacity

- Recommended Pick-Face Quantity = Average Daily Outbound × Days Between Replenishments × Safety Factor
- A safety factor default: 1.20
- B safety factor default: 1.10
- C safety factor default: 1.00

## Replenishment

- Estimated Replenishments = Outbound Demand During Period ÷ Recommended Pick-Face Quantity

## Slotting Score

Default weighted score:

- Outbound velocity: 30%
- Pick-line frequency: 20%
- Cube velocity: 15%
- Replenishment frequency: 15%
- Inventory quantity: 10%
- Inbound frequency: 5%
- Trend growth: 5%

## Recommendation Rules

The recommendation engine considers ABC class, pick method distribution, inventory quantity, cube, weight, hazmat, temperature, stackability, and pick-face capacity. ABC class alone never determines the recommendation.
