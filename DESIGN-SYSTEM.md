---
name: San Alfonso Academic Voting System
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#464651'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#767683'
  outline-variant: '#c7c5d3'
  surface-tint: '#5056ac'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#030568'
  on-primary-container: '#767cd5'
  inverse-primary: '#bfc2ff'
  secondary: '#b41d11'
  on-secondary: '#ffffff'
  secondary-container: '#d83828'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#00201c'
  on-tertiary-container: '#1a9386'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e0e0ff'
  primary-fixed-dim: '#bfc2ff'
  on-primary-fixed: '#030568'
  on-primary-fixed-variant: '#373d92'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a8'
  on-secondary-fixed: '#410000'
  on-secondary-fixed-variant: '#930000'
  tertiary-fixed: '#8cf5e5'
  tertiary-fixed-dim: '#6fd8c9'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005048'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  academic-red: '#990000'
  institution-blue: '#000066'
  surface-white: '#FFFFFF'
  status-warning: '#FFC107'
  border-gray: '#D1D5DB'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  caption:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter-desktop: 24px
  margin-desktop: 48px
  gutter-mobile: 16px
  margin-mobile: 20px
  max-width: 1280px
---

## Brand & Style

The design system is engineered for an institutional and academic context, specifically tailored for a school voting environment. It prioritizes **trust, transparency, and educational authority**. The target audience includes students, faculty, and administrative staff, requiring an interface that feels both official and accessible.

The design style follows a **Corporate / Modern** aesthetic. It leverages a structured grid, generous whitespace, and a refined color palette to evoke a sense of stability. While the foundation is conservative, the implementation uses modern UI techniques like soft elevation and high-quality typography to ensure it feels contemporary rather than bureaucratic. The goal is to make the act of voting feel significant, secure, and intuitive.

## Colors

The palette is anchored by **Institution Blue**, representing stability and professionalism. To fulfill the "academic red/maroon" requirement, a deep **Academic Red** is introduced as the secondary color, used for critical actions and accenting institutional pride.

- **Primary (Blue):** Used for headers, primary buttons, and navigational elements.
- **Secondary (Red):** Used sparingly for secondary call-to-actions or to highlight academic significance.
- **Tertiary (Teal):** Retained from the source for success states or subtle background accents.
- **Neutral:** A range of soft grays and pure white ensures the content remains legible and the interface feels uncluttered.

The default mode is **light**, providing a paper-like feel that resonates with traditional academic environments.

## Typography

This design system utilizes **Hanken Grotesk**, a sharp and highly legible sans-serif that balances the friendliness of Poppins with a more professional, technical edge. 

- **Hierarchical Clarity:** Headlines use heavier weights (600-700) to anchor the page, while body text maintains a comfortable 400 weight for long-form reading and instructions.
- **Scaling:** Large headlines scale down for mobile devices to maintain readability without overwhelming the viewport.
- **Uppercase Labels:** Small labels and metadata may use slight letter-spacing to improve scanability in administrative tables or forms.

## Layout & Spacing

The layout follows a **Fixed Grid** model for desktop to maintain a sense of order and institutional structure. 

- **Desktop (1024px+):** 12-column grid with a 1280px max-width. Large 48px margins create "breathing room" that conveys premium quality.
- **Tablet (768px - 1023px):** 8-column grid with reduced margins.
- **Mobile (<767px):** 4-column fluid grid.

The spacing rhythm is based on a **4px baseline**, ensuring all components align perfectly. Vertical spacing between sections should be generous (typically 64px or 80px) to prevent the user from feeling rushed during the sensitive process of voting.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Ambient Shadows**. This design system avoids harsh shadows in favor of a soft, sophisticated depth.

- **Surfaces:** Use `#FFFFFF` for primary cards and `#F2F2F2` for the main background to create a subtle separation between the interface and the content.
- **Shadows:** Use a single, very soft shadow for interactive elements like cards or modals: `0px 4px 20px rgba(0, 0, 102, 0.08)`. The slight blue tint in the shadow color maintains brand consistency.
- **Outlines:** Use thin (1px) borders in `#D1D5DB` for input fields and non-elevated containers to keep the UI grounded and precise.

## Shapes

The shape language is **Soft**, utilizing a 0.25rem (4px) base radius. This creates a professional look that is approachable but not overly "bubbly" or casual.

- **Standard Elements:** 4px radius for buttons and input fields.
- **Large Containers:** 8px (rounded-lg) for cards and instructional blocks.
- **Selection States:** Use subtle background fills with the same 4px radius to indicate focus or selection without cluttering the view.

## Components

### Buttons
- **Primary:** Solid `#000066` with white text. High-contrast, used for "Submit Vote" or "Confirm."
- **Secondary:** Outlined with `#000066` or solid `#990000` for specific academic actions.
- **Tertiary:** Text-only for "Back" or "Cancel" actions to avoid visual competition.

### Cards (Candidate Cards)
Candidate selection cards should feature a subtle border. Upon selection, the border thickens and changes to the Primary Blue color, accompanied by a small checkmark icon in the corner.

### Input Fields
Forms should be clean with labels placed above the field. Use the `body-md` typography. The focus state should utilize a 2px blue stroke to clearly indicate user activity.

### Chips & Badges
Used for indicating status (e.g., "Active," "Closed," "Voted"). These use the tertiary teal or secondary red with 10% opacity backgrounds and full-saturation text for high legibility.

### Voting Progress Indicator
A linear progress bar at the top of the voting flow using the Primary Blue to provide users with a clear sense of their journey through the ballot.
