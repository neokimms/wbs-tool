# Harness Engineering Agent

## Mission

Build an on-premises WBS platform for enterprise project delivery teams. Use OpenProject Community Edition as the WBS/PM engine, PostgreSQL as the database standard, and a company-owned extension layer for templates, approvals, reporting, Excel round trips, and operational packaging.

## Required Context

Before changing frontend work, read `design.md` and preserve its Apple-inspired portal design system. Before changing platform architecture, read `README.md` and keep the OpenProject-core-plus-extension-layer strategy intact.

## Non-Negotiables

- PostgreSQL is the default and only supported relational database for this platform.
- OpenProject core changes must be avoided unless there is no extension-safe path.
- Company-specific behavior belongs in plugins, external APIs, migrations, or deployment configuration.
- Enterprise add-on boundaries must be respected. Do not bypass license checks or copy proprietary functionality.
- Every feature must be deployable on customer-controlled infrastructure.
- Security, auditability, backup, and upgrade paths are product requirements, not later polish.

## Architecture Guardrails

- Keep OpenProject responsible for work packages, hierarchy, relations, schedules, issue/risk/change tracking, and baseline PM workflows.
- Keep `wbs-api` responsible for company WBS templates, WBS code generation, Excel import/export validation, PMO dashboard aggregation, and integration workflows.
- Keep `wbs-portal` responsible for the executive and PMO-facing portal experience.
- Integrate with OpenProject through API v3 or plugins before considering a fork.
- Prefer Docker Compose for local/POC and Kubernetes/Helm for productized customer deployments.

## Data Model Standards

Standard WBS item types:

- Program
- Project
- Phase
- Deliverable
- Task
- Milestone
- Risk
- Issue
- Change Request

Required company fields:

- WBS Code
- Deliverable Type
- Reviewer
- Approver
- Contract Phase
- Acceptance Required
- Weight
- Progress Formula

Default workflow:

```text
Draft -> Review -> Approved -> In Progress -> Acceptance -> Done
```

## Engineering Workflow

1. Start by identifying whether a request belongs in OpenProject configuration, an OpenProject plugin, the external API, the portal, or deployment automation.
2. Make the smallest change that preserves upgradeability.
3. Add or update migrations for persistent data changes.
4. Keep API responses stable and explicit.
5. Keep portal screens task-first, dense, calm, and responsive.
6. Verify with local commands when possible and document anything that could not be run.

## Portal Design Rule

The portal must feel like a focused Apple productivity tool: clear hierarchy, restraint, smooth surfaces, strong typography, and purposeful motion. Do not make marketing pages. The first screen should be the usable WBS control surface.

## Output Expectations

When completing a task, report:

- What changed
- Where it changed
- How it was verified
- Any remaining operational risk
