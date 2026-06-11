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

---

# Daily Duration — Mobile Design System

> **Single Source of Truth** for the Daily Duration app (SNS-based personal / family / team daily record sharing).
> All Flutter components MUST derive colors, typography, spacing, and motion exclusively from this section.

---

## Product Feel

Daily Duration should feel like a **warm, social photo album** — familiar enough to pick up instantly (Instagram/TikTok reference), personal enough to feel intimate (Day One / family album reference).

- Warm, not clinical. Personal, not corporate.
- The word **"Duration"** (기간/지속) is the core metaphor: every card celebrates how long a moment, habit, or streak has lasted.
- Information density: low on feed cards, high on detail/archive views.

---

## Color Palette — Two Brand Options

Choose **one** palette per brand expression. Mix is forbidden.

### Option A — Airbnb Palette (Warm & Human)

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Primary | `--dd-primary` | `#FF5A5F` | CTA buttons, Duration badge, active tab indicator |
| Primary Dark | `--dd-primary-dark` | `#E04347` | Pressed state, dark mode primary |
| Surface | `--dd-surface` | `#FFFFFF` | Card background |
| Background | `--dd-bg` | `#F7F7F7` | App background |
| Text | `--dd-text` | `#484848` | Body text, names |
| Text Muted | `--dd-text-muted` | `#767676` | Timestamps, secondary labels |
| Line | `--dd-line` | `#EBEBEB` | Dividers, card borders |
| Success | `--dd-success` | `#008489` | Streak badge, published status |
| Warning | `--dd-warning` | `#FFB400` | Pending approval |
| Error | `--dd-error` | `#C13515` | Destructive actions |
| Duration Gradient | — | `#FF5A5F → #FC642D` | Duration badge gradient (left→right) |

```dart
// Flutter — Airbnb palette
class DDColors {
  static const primary      = Color(0xFFFF5A5F);
  static const primaryDark  = Color(0xFFE04347);
  static const surface      = Color(0xFFFFFFFF);
  static const bg           = Color(0xFFF7F7F7);
  static const text         = Color(0xFF484848);
  static const textMuted    = Color(0xFF767676);
  static const line         = Color(0xFFEBEBEB);
  static const success      = Color(0xFF008489);
  static const warning      = Color(0xFFFFB400);
  static const error        = Color(0xFFC13515);
  // Duration gradient
  static const durationStart = Color(0xFFFF5A5F);
  static const durationEnd   = Color(0xFFFC642D);
}
```

### Option B — Figma Palette (Digital & Precise)

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Primary | `--dd-primary` | `#7B61FF` | CTA buttons, Duration badge, active tab |
| Primary Dark | `--dd-primary-dark` | `#5B42D4` | Pressed state |
| Surface | `--dd-surface` | `#FFFFFF` | Card background |
| Background | `--dd-bg` | `#F5F5F5` | App background |
| Text | `--dd-text` | `#1E1E1E` | Body text |
| Text Muted | `--dd-text-muted` | `#B3B3B3` | Secondary labels |
| Line | `--dd-line` | `#E5E5E5` | Dividers |
| Success | `--dd-success` | `#1BC47D` | Published status |
| Warning | `--dd-warning` | `#F5A623` | Pending |
| Error | `--dd-error` | `#F24E1E` | Destructive |
| Duration Gradient | — | `#7B61FF → #A78BFA` | Duration badge gradient |

```dart
// Flutter — Figma palette
class DDColorsFigma {
  static const primary      = Color(0xFF7B61FF);
  static const primaryDark  = Color(0xFF5B42D4);
  static const surface      = Color(0xFFFFFFFF);
  static const bg           = Color(0xFFF5F5F5);
  static const text         = Color(0xFF1E1E1E);
  static const textMuted    = Color(0xFFB3B3B3);
  static const line         = Color(0xFFE5E5E5);
  static const success      = Color(0xFF1BC47D);
  static const warning      = Color(0xFFF5A623);
  static const error        = Color(0xFFF24E1E);
  static const durationStart = Color(0xFF7B61FF);
  static const durationEnd   = Color(0xFFA78BFA);
}
```

> **Default for MVP**: Option A (Airbnb) — warmer for family/personal use.

---

## Typography

Font stack priority: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Rounded`, `Noto Sans KR`, sans-serif.

| Level | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Display | 32px / 32sp | 800 | 1.15 | -0.8px | Onboarding hero, empty states |
| Heading | 22px / 22sp | 700 | 1.25 | -0.4px | Screen titles, section headers |
| Title | 17px / 17sp | 600 | 1.35 | -0.2px | Card titles, group names |
| Body | 15px / 15sp | 400 | 1.6 | 0 | Diary text, descriptions |
| Caption | 13px / 13sp | 400 | 1.4 | 0 | Timestamps, secondary info |
| Small | 11px / 11sp | 500 | 1.3 | 0.2px | Badges, tab labels |
| Duration | 13px / 13sp | 700 | 1.0 | 0.5px | Duration badge text (ALL CAPS) |

```dart
class DDText {
  static const display = TextStyle(fontSize: 32, fontWeight: FontWeight.w800, height: 1.15, letterSpacing: -0.8);
  static const heading = TextStyle(fontSize: 22, fontWeight: FontWeight.w700, height: 1.25, letterSpacing: -0.4);
  static const title   = TextStyle(fontSize: 17, fontWeight: FontWeight.w600, height: 1.35, letterSpacing: -0.2);
  static const body    = TextStyle(fontSize: 15, fontWeight: FontWeight.w400, height: 1.6,  letterSpacing: 0);
  static const caption = TextStyle(fontSize: 13, fontWeight: FontWeight.w400, height: 1.4,  letterSpacing: 0);
  static const small   = TextStyle(fontSize: 11, fontWeight: FontWeight.w500, height: 1.3,  letterSpacing: 0.2);
  static const duration = TextStyle(fontSize: 13, fontWeight: FontWeight.w700, height: 1.0, letterSpacing: 0.5);
}
```

---

## Spacing Scale

| Token | Value | Flutter const | Usage |
|-------|-------|---------------|-------|
| `xs` | 4px | `DDSpacing.xs = 4.0` | Icon gap, badge inner |
| `sm` | 8px | `DDSpacing.sm = 8.0` | Between inline elements |
| `md` | 16px | `DDSpacing.md = 16.0` | Card inner padding |
| `lg` | 24px | `DDSpacing.lg = 24.0` | Section gap |
| `xl` | 32px | `DDSpacing.xl = 32.0` | Screen top/bottom padding |
| `xxl` | 48px | `DDSpacing.xxl = 48.0` | Onboarding vertical rhythm |

---

## Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 6px | Badges, chips, input fields |
| `md` | 12px | Cards, bottom sheets |
| `lg` | 18px | Media thumbnails, avatar |
| `xl` | 24px | Modal panels |
| `full` | 999px | Pills, duration badge, avatar |

---

## Shadow / Elevation

| Level | CSS / Flutter value | Usage |
|-------|---------------------|-------|
| 0 | none | Flat items, list rows |
| 1 | `0 1px 3px rgba(0,0,0,0.08)` | Card resting state |
| 2 | `0 4px 12px rgba(0,0,0,0.10)` | Card hover / focus |
| 3 | `0 8px 24px rgba(0,0,0,0.14)` | Bottom sheet, modal |

---

## Motion

- All transitions: ≤ 180ms, `Curves.easeOut`
- Screen entrance: `fadeIn + slideY(begin: 0.03)` simultaneous
- Card appear: `fadeIn(duration: 200ms)` with 16ms stagger per item
- Like / reaction tap: `scale(0.8 → 1.15 → 1.0)` spring, 240ms total
- Duration badge pulse on new streak: `scale(1.0 → 1.05 → 1.0)` loop 2×, 600ms

---

## Key Component Rules

### Feed Card
- Width: full screen width minus `DDSpacing.md` on each side
- Padding inner: `DDSpacing.md` (16px) top/sides; `DDSpacing.sm` (8px) bottom
- Border: `0.5px solid DDColors.line`
- Radius: `DDRadius.md` (12px)
- Shadow: Level 1
- Media area: aspect ratio `4:3` for single photo, `1:1` grid for multiple
- **Duration badge**: always visible, top-right of media area, gradient pill

### Duration Badge
- Background: linear gradient `durationStart → durationEnd`
- Text: white, `DDText.duration` (ALL CAPS), e.g. `"D+42"` or `"3주"`
- Padding: `4px 10px`
- Radius: `DDRadius.full` (pill)
- Position: absolute, 8px from top-right corner of media area

### Bottom Navigation
- Height: 56px + SafeArea bottom
- Active: `DDColors.primary`, weight 600
- Inactive: `DDColors.textMuted`, weight 400
- Center tab (⊕): `44×44px`, `DDColors.primary`, radius 14px
- No labels on inactive tabs (icon only) when space < 375px

### Avatar
- Default size: 36px diameter
- Border: none in feed cards; `2px solid DDColors.primary` in profile
- Fallback: first letter of name, `DDColors.primary.withValues(alpha:0.12)` bg

### Buttons
- Primary filled: `DDColors.primary` bg, white text, radius `DDRadius.sm` (6px), height 48px
- Pressed: `opacity 0.75` (150ms)
- Width: never auto-fit to label — use `SizedBox(width: double.infinity)` for full-width, fixed pixel for icon buttons

---

## Screen Inventory

| Screen | Key Design Rule |
|--------|----------------|
| Home Feed | Card stream + Duration badge per card |
| Reels (숏폼) | Full-screen, immersive, no chrome except side actions |
| Create (⊕) | Bottom sheet modal, warm empty state illustration |
| Archive | Calendar grid, `DDColors.primary` dot on recorded days |
| Profile | Stats row: Posts / Duration Avg / Streak |
| Login | Logo centered, Google/Apple buttons, minimal chrome |
