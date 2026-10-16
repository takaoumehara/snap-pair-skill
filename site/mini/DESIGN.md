# Mini Apps Design System

## Overview

A **colorful but calm** design system shared across all three snap-pair mini apps (Shopping List, Janken, Co-Drawing). The system uses design tokens defined in `tokens.css` and mirrored in `tokens.json` to ensure visual consistency and maintainability.

## Design Principles

1. **Colorful but Calm** - Soft, approachable colors that feel friendly without being overwhelming
2. **Consistency** - Shared tokens across all apps create a cohesive experience
3. **Mobile-First** - Optimized for touch interactions and small screens
4. **Accessibility** - Good contrast, readable typography, touch-friendly sizes
5. **No Hardcoded Values** - All colors, spacing, and typography use CSS variables

## Color Palette

### Primary & Accent
- **Primary**: Calm blue (`#4f86f7`) - Used for primary actions, active states, and scores
- **Accent**: Soft purple (`#a78bfa`) - Used for secondary actions and highlights

### Surfaces
- **Background**: Off-white (`#fafbfc`) - Main background
- **Surface**: Pure white (`#ffffff`) - Cards, containers
- **Secondary Surface**: Light gray (`#f3f4f6`) - Subtle backgrounds

### Text
- **Primary Text**: Near-black (`#1f2937`)
- **Secondary Text**: Medium gray (`#6b7280`)
- **Tertiary Text**: Light gray (`#9ca3af`)

### Semantic Colors
- **Success**: Green (`#10b981`) - Completed items, winning states
- **Danger**: Red (`#ef4444`) - Delete actions, losing states
- **Warning**: Amber (`#f59e0b`) - Draw states, waiting states
- **Info**: Blue (`#3b82f6`)

### Per-Player Colors (Multiplayer)
Six distinct colors for multiplayer scenarios:
1. Blue (`#4f86f7`)
2. Pink (`#ec4899`)
3. Green (`#10b981`)
4. Amber (`#f59e0b`)
5. Purple (`#8b5cf6`)
6. Teal (`#14b8a6`)

### Drawing Colors
Six colors for the co-drawing app:
- Black, Red, Blue, Green, Orange, Purple

## Typography

### Font Stacks
- **Sans-serif**: System font stack for UI
- **Monospace**: Code displays, room codes, scores

### Scale
- **xs**: 12px - Labels, metadata
- **sm**: 14px - Secondary content
- **base**: 16px - Body text
- **lg**: 18px - Emphasized text
- **xl**: 20px - Subheadings
- **2xl**: 24px - Result displays
- **3xl**: 30px - Page titles
- **4xl**: 36px - Large emojis, room codes

### Weights
- **Normal** (400): Body text
- **Medium** (500): Buttons, emphasized text
- **Semibold** (600): Subheadings
- **Bold** (700): Numbers, scores

## Components

### Buttons
Three variants with consistent sizing and states:

1. **Primary** - Blue background, white text
2. **Secondary** - Purple background, white text  
3. **Ghost** - Transparent with border

All buttons:
- Height: 44px (touch-friendly)
- Border radius: 8px
- Medium font weight
- Hover states with color shifts

### Cards & Surfaces
- Rounded corners (12px radius)
- Subtle shadows
- 1px borders in gray
- Clean white or light gray backgrounds

### Inputs
- 44px height (touch-friendly)
- Rounded corners
- Border with focus state (blue ring)
- Clean, minimal styling

### Status Badges
- Rounded pill shape
- Small dot indicator
- Color-coded: green (connected), amber (waiting), red (error)
- Pulsing animation for waiting state

## Spacing Scale

Consistent 4px-based spacing system:
- **1**: 4px - Tight spacing
- **2**: 8px - Small gaps
- **3**: 12px - Default gaps
- **4**: 16px - Standard padding
- **5**: 20px - Medium spacing
- **6**: 24px - Large padding
- **8**: 32px - Section spacing
- **10**: 40px
- **12**: 48px - Major sections
- **16**: 64px - Hero spacing

## Layout

- **Container max-width**: 600px (mobile-optimized)
- **Border radius**: 8px default, 12px for cards
- **Shadows**: Subtle elevation with 4 levels (sm, base, md, lg)

## Theme Switching (Light/Dark Mode)

The design system supports **explicit theme switching** between light and dark modes:

### Implementation
- **Default**: Light theme (no auto prefers-color-scheme detection)
- **Mechanism**: `[data-theme]` attribute on `<html>` element
- **Values**: `"light"` or `"dark"`
- **Persistence**: Theme choice saved in `localStorage` as `snap-pair-theme`
- **Toggle**: Shared `theme.js` script provides toggle button (🌙/☀️ icons)

### Theme Definitions

Both themes defined in `tokens.css` and `tokens.json`:

#### Light Theme (`:root`, `[data-theme="light"]`)
- Backgrounds: Off-white to pure white
- Text: Near-black to medium gray
- Bright, saturated accent colors
- Subtle shadows and borders

#### Dark Theme (`[data-theme="dark"]`)
- Backgrounds: Deep slate to dark slate
- Text: Off-white to light gray
- Slightly brighter accent colors for contrast
- Same color relationships as light theme
- Drawing colors inverted (e.g., black → off-white on dark canvas)

### Usage

All apps include theme switcher:
```html
<script src="../theme.js"></script>
<button class="theme-toggle" data-theme-toggle aria-label="Toggle theme">🌙</button>
```

Access theme programmatically:
```javascript
// Get current theme
const theme = window.SnapPairTheme.current; // "light" or "dark"

// Toggle theme
window.SnapPairTheme.toggle();

// Set theme explicitly
window.SnapPairTheme.set('dark');
```

### Visual Consistency
- All semantic colors maintained across themes
- Player and drawing colors adjusted for optimal contrast
- Same spacing, typography, and component styles
- Smooth transitions between theme switches

## App-Specific Styling

### Shopping List
- Success green for checkboxes
- Danger red for delete buttons
- List items with hover states

### Janken (Rock-Paper-Scissors)
- Large touch-friendly choice buttons (80x80px)
- Result displays with semantic colors (win/lose/draw)
- Prominent score display in primary blue

### Co-Drawing
- Color picker with 6 drawing colors
- Active color indicated with border and scale
- Touch-friendly color buttons (44x44px)

## Usage

All apps include tokens in order:
```html
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../mini-style.css">
```

Use CSS variables for all styling:
```css
.my-element {
  color: var(--color-primary);
  padding: var(--space-4);
  border-radius: var(--radius);
  font-size: var(--text-base);
}
```

Never hardcode colors, sizes, or spacing. Always use tokens to maintain consistency.

## Files

- **`tokens.css`** - Complete design token system as CSS custom properties
- **`tokens.json`** - JSON mirror of all tokens for programmatic access
- **`mini-style.css`** - App-specific component styles using tokens
- **`DESIGN.md`** - This documentation
