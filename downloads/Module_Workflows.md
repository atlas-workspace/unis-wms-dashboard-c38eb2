# UNIS WMS Dashboard — Module Workflows

> Business user guide for each dashboard module. Covers step-by-step processes, required inputs, approval rules, and tips.

---

## Dashboard Overview

**Purpose:** Central overview of warehouse operations, KPIs, and quick navigation.

**Steps:**
1. Sign in with your IAM credentials
2. Select your facility from the top-bar selector
3. Review KPIs: inventory, tasks, alerts
4. Click any widget to navigate to the detailed module
5. Use Quick Actions at bottom-left for common tasks

**Tips:** Switch facilities to see different warehouse data. The date range updates automatically to the current week.

---

## Physical Inventory Calendar

**Purpose:** Plan and track physical inventory dates. Create support tickets for PI coordination.

**Steps:**
1. Click "+ Add Physical Inventory Date"
2. Select date, customer, confirmation status
3. Add internal emails and quote amount
4. Save the PI date (stored locally)
5. Edit to open Ticket Setup and create a UNIS ticket
6. Review ticket status badge in table row

**Status Meanings:**
- **Confirmed** — PI date is confirmed with all parties
- **Pending** — Awaiting confirmation
- **Canceled** — PI was canceled
- **Re-scheduled** — PI moved to a different date

**Tips:** Ticket creation requires Department and Topic selection. If ticket fails, check the diagnostics panel in Edit form.

---

## Cycle Count Scheduler

**Purpose:** Create cycle count tickets and tasks for today's scheduled counts.

**Steps:**
1. Select a customer from the dropdown
2. Choose count type (BY_LOCATION) and method
3. Set schedule date (must be today)
4. Click "Add Count Line" to open location picker
5. Search and select locations from WMS
6. Click "Schedule Cycle Count" to create ticket and task

**Required Inputs:** Customer, count type, schedule date (today only), at least one location with valid ID.

**Rules:**
- Only today's date is allowed for task creation
- One ticket per customer per day
- Bulk/Pallet Qty Check mode skips individual LP scanning
- Prior-day active tickets do not block today's creation

**Tips:** Use the Bulk/Pallet Qty Check method for pallet storage areas where counters only need to confirm quantity, not scan each ILP.

---

## Cycle Count Dashboard

**Purpose:** Monitor active and completed cycle count tickets with evidence status.

**Steps:**
1. View today's KPIs: total, open, completed
2. Review the Recent Cycle Counts table
3. Filter by status if needed
4. Click "View" to see count results for a ticket
5. Locations and count method shown per ticket

**Status Meanings:**
- **NEW / OPEN** — Ticket created, not started
- **TASK_CREATED** — Task assigned to counter
- **COUNTING / IN_PROGRESS** — Active count in progress
- **COMPLETED** — Count finished with results
- **Completed Empty/Invalid** — Closed with zero results (can regenerate)
- **CANCELLED** — Ticket was cancelled

**Tips:** Tickets missing locations are enriched from WMS detail automatically.

---

## Count Schedule Calendar

**Purpose:** See all cycle count and physical count schedules in a monthly calendar view.

**Steps:**
1. Navigate months with arrows
2. View dots on calendar days with scheduled counts
3. Review the event list below the grid
4. Filter by type: Cycle Count or Physical Count
5. Add local confirmed schedules if needed

**Tips:** WMS tickets are shown from real scheduleDate. Local planning records are labeled clearly. Cancelled tickets remain visible for traceability.

---

## Count Result Approval

**Purpose:** Review and approve cycle count results before inventory adjustments are applied.

**Steps:**
1. Review pending count results
2. Check variance and counted quantities
3. Approve or reject each result
4. Track approval status

**Tips:** Only authorized approvers can approve results. Check variance thresholds before approving.

---

## Consolidation

**Purpose:** Consolidate inventory across locations to optimize warehouse space utilization.

**Steps:**
1. View BULK and Rack tabs for consolidation candidates
2. Review inventory items by customer and location
3. Select items for consolidation workflow
4. Open consolidation plan panel
5. Enter destination location and submit

**Tips:** If no consolidation tasks exist, live inventory is shown as candidates. Use filters and search to find specific items.

---

## Replenishment Tasks

**Purpose:** Track replenishment tasks that restock pick-face locations from bulk reserve.

**Steps:**
1. View active replenishment tasks
2. Filter by status or customer
3. Monitor task progress and assignments
4. Review completed vs pending tasks

**Tips:** Tasks are facility-scoped. Use the Suggestions sub-page for next-day demand analysis.

---

## Replenishment Suggestions

**Purpose:** Analyze next-day order demand and suggest replenishment tasks to ensure pick locations are ready.

**Steps:**
1. Select a customer or "All Customers"
2. Click "Refresh Suggestions"
3. Review shortage items, from/to locations, assignees
4. Toggle Consolidated view for efficiency
5. Use Autonomous Functions panel to select mode
6. Select rows and confirm to create tasks (requires password)

**Autonomous Modes:**
- **Read-only suggestions** — View only, no mutations
- **Suggest + confirm** — Select rows, confirm before creating
- **Auto-create unassigned** — Creates tasks without assignee
- **Auto-create + assign** — Creates and assigns tasks
- **Auto + dispatch** — Locked (requires operations approval)

**Tips:** Auto Assign fills assignees from order plan data. Export includes all columns. Task creation requires the facility action password.

---

## VLG Management

**Purpose:** Manage Virtual Location Groups — customer allocation of warehouse zones.

**Steps:**
1. Search or browse virtual location groups
2. Click Edit to view/modify a group
3. Update allocations, name, or settings
4. Save changes (requires action password)

**Tips:** All mutations (edit, save, delete) require the facility action password.

---

## Location Tag

**Purpose:** View and manage location tags and their assigned locations.

**Steps:**
1. Search tags by name or filter by location
2. Click Edit to manage a tag's assigned locations
3. Add/remove locations from the tag
4. Save changes (requires action password)

**Tips:** Use Location Tag Requests for a structured change workflow with manager approval.

---

## Location Tag Update Requests

**Purpose:** Submit structured location update requests with before/after tracking and manager approval workflow.

**Steps:**
1. Click "+ New Request"
2. Search a WMS location by name or ID
3. Review current WMS values displayed
4. Select requested changes from live dropdowns
5. Choose customers and tag from live WMS data
6. Submit for manager approval
7. Manager approves → WMS is updated automatically

**Key Fields (from live WMS):**
- name, type, status, supportPickType, category, capacityType
- customerIds (multi-select from facility customers)
- tagName (select from live WMS virtual tags)
- disallowToMixItemOnSameLocation (TRUE/FALSE)

**Approval Statuses:**
- **PENDING APPROVAL** — Awaiting manager review
- **APPROVED / APPLIED** — Approved and applied to WMS
- **REJECTED** — Manager rejected the request
- **APPROVED BUT FAILED** — Approved but WMS update failed

**Tips:** Tag changes are applied only if safely resolved in WMS. If tag update cannot be mapped, it is blocked with a clear message.

---

## Cycle Count Daily Report

**Purpose:** Generate and export daily cycle count performance reports with email automation configuration.

**Steps:**
1. Click "Generate Report" to load today's data
2. Review KPIs and detail table
3. Export CSV for offline analysis
4. Configure daily email recipients
5. Enable automation toggle for scheduled delivery

**Tips:** Email delivery requires backend scheduled automation. Recipients and preferences are saved per facility. Report defaults to today.

---

## Admin Settings

**Purpose:** Dashboard configuration, security, per-facility passwords, and user access management.

**Steps:**
1. Set default facility
2. Change facility action password (per facility)
3. Manage user access per facility and module
4. Review enforced guardrails (read-only)
5. Export/import settings or reset

**Access:** Only visible to the dashboard owner.

**Tips:** Password changes apply per facility. Export excludes passwords for security. Reset reverts all passwords to default.

---

## AI Assistant

**Purpose:** In-app help for dashboard questions using page context.

**What it can answer:**
- Physical inventory schedules and ticket status
- Customer selection and facility info
- Cycle count rules and replenishment guidance
- Navigation help and feature explanations

**What it cannot do:**
- No destructive/mutation operations
- No access to external systems beyond current page context
- No real-time WMS data queries (guides you to the correct page instead)

**Tips:** Click the purple chat button (bottom-right). Chat history is saved per facility. Use suggested prompts for common questions.

---

*Generated from UNIS WMS Dashboard workflow definitions. For the latest information, refer to the dashboard module pages directly.*
