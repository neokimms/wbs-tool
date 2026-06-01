# Apple Portal Design

This file defines the visual direction for the WBS portal. It is inspired by Apple Human Interface Guidelines, but adapted for an enterprise PMO product.

## Product Feel

The portal should feel calm, precise, and immediately usable. It is not a landing page. The first viewport is the working surface for PMO, project managers, and engineering leads.

## Layout

- Use a persistent left navigation on desktop.
- Use a compact top bar and horizontal navigation on small screens.
- Keep the primary dashboard visible without requiring a marketing hero.
- Use full-width application regions, not nested cards.
- Use cards only for individual metrics, panels, rows, dialogs, and repeated objects.
- Keep card radius at `8px` or less.
- Keep dense operational views scan-friendly.

## Typography

- Use system fonts: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `SF Pro Text`, `Segoe UI`, sans-serif.
- Use strong but restrained headings.
- Do not scale fonts with viewport width.
- Letter spacing must be `0`.
- Use smaller headings inside dashboards and panels.

## Color

- Base: soft white and light gray.
- Text: near black, graphite, and secondary gray.
- Accent: system blue for primary actions.
- Status: green for stable, amber for attention, red for critical, violet only as a supporting signal.
- Avoid one-note palettes and avoid purple-dominant gradients.

## Controls

- Use segmented controls for mode switching.
- Use icon buttons for refresh, sync, upload, download, and settings.
- Use toggles for binary settings.
- Use compact inputs for numeric or date values.
- Buttons must not resize when labels or icons change.
- Tooltips or accessible labels are required for icon-only buttons.

## Motion

- Use subtle transitions under `180ms`.
- Motion should clarify state changes, not decorate the screen.

## Portal Screens

Required first screens:

- PMO dashboard
- Project portfolio
- WBS template library
- Excel import/export queue
- OpenProject sync status
- Admin and deployment health

## Implementation Tokens

```css
:root {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-muted: #f0f2f5;
  --text: #1d1d1f;
  --text-muted: #6e6e73;
  --line: #d8dce2;
  --blue: #0071e3;
  --green: #1f9d55;
  --amber: #b7791f;
  --red: #d92d20;
  --violet: #7356bf;
  --radius: 8px;
  --shadow: 0 18px 45px rgba(0, 0, 0, 0.08);
}
```
