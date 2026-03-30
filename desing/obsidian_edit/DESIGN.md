```markdown
# Design System Document: The Precision Darkroom

## 1. Overview & Creative North Star
**Creative North Star: "The Obsidian Loom"**
This design system moves away from the cluttered "instrument panel" look of legacy editors and toward a sophisticated, editorial workspace. It treats the video editing process as a craft of light and shadow. By utilizing deep charcoal foundations and surgical purple accents, we create a high-contrast environment where the user’s content—the video itself—is the only thing that feels "physical." The UI remains a ghost in the room, appearing only when needed through subtle tonal shifts and glassmorphism.

The system breaks the "template" look by using **intentional asymmetry** in the sidebar layouts and **breathing room** (generous white space) that is rarely seen in pro-tool environments. We prioritize focus over density.

---

## 2. Colors & Surface Philosophy

### The "No-Line" Rule
Traditional video editors are a grid of 1px grey lines. This design system prohibits them. Structural boundaries must be defined solely through background color shifts. To separate a timeline from a preview window, use a transition from `surface` (#0e0e0e) to `surface-container-low` (#131313). This creates a "milled" look, as if the interface was carved from a single block of obsidian.

### Surface Hierarchy & Nesting
Depth is achieved through a "nested" logic. The further "back" an element is, the darker its value.
- **Base Layer:** `surface` (#0e0e0e) for the primary application background.
- **Primary Containers:** `surface-container` (#1a1919) for sidebars and the main timeline area.
- **Interactive Wells:** `surface-container-high` (#201f1f) for nested panels like inspector controls or media bins.
- **Elevated Floating Elements:** `surface-container-highest` (#262626) for context menus or floating tool palettes.

### The "Glass & Gradient" Rule
To inject "soul" into the professional environment:
- **Floating Modals:** Use `surface-container-highest` with a 70% opacity and a `20px` backdrop-blur.
- **Signature CTAs:** Primary actions (like "Export") should not be flat. Use a linear gradient from `primary` (#ba9eff) to `primary_dim` (#8455ef) at a 135-degree angle. This creates a tactile, luminous quality that mimics a backlit button.

---

## 3. Typography
We use **Inter** for its neutral, architectural clarity. The hierarchy is designed to be "functional-editorial."

- **Display (display-sm/md):** Reserved for export percentages or large timecode readouts. High-contrast `on_surface` (#ffffff).
- **Headlines (headline-sm):** Used for major panel headers (e.g., "Media Pool"). Use `0.05em` letter spacing to add a premium, cinematic feel.
- **Labels (label-md/sm):** These are the workhorses. For non-essential metadata, use `on_surface_variant` (#adaaaa) to reduce visual noise. 
- **The Contrast Ratio:** Title and Body text should always be `on_surface` (Pure White) to pop against the charcoal background, ensuring readability in low-light editing suites.

---

## 4. Elevation & Depth

### Tonal Layering
Instead of drop shadows, we use **Tonal Lift**. A card is "lifted" not by a shadow, but by being one step higher in the surface-container scale than its parent. 

### Ambient Shadows
When a component must float (e.g., a color-picker popover), use an **Ambient Glow**:
- **Shadow:** 0px 12px 32px rgba(0, 0, 0, 0.5).
- **Tint:** Add a 1px inner-stroke (Ghost Border) using `outline_variant` (#484847) at 15% opacity to catch the "light" on the top edge.

### Glassmorphism
For the timeline playhead or hovering tooltips, use semi-transparent `surface_bright` (#2c2c2c) with a heavy blur. This allows the colorful video waveforms to bleed through the UI, making the software feel integrated with the user's media.

---

## 5. Components

### Primary Buttons
- **Style:** Gradient fill (Primary to Primary-Dim), `rounded-md` (0.375rem).
- **Interaction:** On hover, increase the brightness. On click, scale slightly (98%) to provide haptic-like feedback.

### The Precision Slider (Unique Component)
- **Track:** `surface-container-highest` (#262626), height 4px.
- **Thumb:** `primary` (#ba9eff) circle with a 2px `on_primary` border.
- **Active State:** The track to the left of the thumb should glow with the `primary_fixed` color.

### Visual Waveforms & Scopes
- **Background:** `surface_container_lowest` (#000000) to provide maximum contrast.
- **Waveform Color:** `secondary` (#c08cf7) for audio, `tertiary` (#ff97b5) for specialized data overlays.

### Cards & Lists
- **Rule:** **Strictly forbid 1px dividers.** 
- Separate list items using `spacing-2.5` (0.5rem) of vertical space. 
- Use a `surface_variant` (#262626) background on hover to indicate selection, rather than a border.

### Sidebar Tabs
- **Style:** Vertical labels using `label-md`. 
- **Active State:** A `2px` vertical pill of `primary` (#ba9eff) on the far left, with the text shifting from `on_surface_variant` to `on_surface`.

---

## 6. Do's and Don'ts

### Do
- **Do** use `surface-container-low` to distinguish the timeline from the viewport.
- **Do** use `spacing-8` (1.75rem) between major UI sections to give the user's eyes a "reset" point.
- **Do** use `primary_dim` for "destructive" but primary actions to maintain the color story without screaming "Error."

### Don't
- **Don't** use pure black (#000000) for anything except the video preview and deep waveform wells. It creates "black smear" on many monitors.
- **Don't** use 100% opaque borders. If a boundary is needed, use a `Ghost Border` at 10-20% opacity.
- **Don't** use standard tooltips. Every tooltip must have a backdrop-blur and use the `surface-container-highest` token.
- **Don't** clutter the top-level UI. Hide advanced "Inspector" settings in a `surface-container-high` drawer that is closed by default.```