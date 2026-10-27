# Humi's Frozen Foods: Design Spec v2 ("Native")

Status: authoritative for all v2 builder agents. Supersedes the "Brand & design direction" section of ARCHITECTURE.md.
Platform target: iOS 26 first (Liquid Glass era). Android and web must render without crashing and look acceptable (fallbacks are stated per component), but are not design targets.
Before using any Expo/RN API named here, verify it against https://docs.expo.dev/versions/v58.0.0/ (AGENTS.md rule). Anything marked VERIFY has not been checked.

---------------------------------------------------------------------------------------------------

## 1. Principles, what changes, and the do-not list

### 1.1 Why v1 failed
v1 (see /tmp .../app-shots) is a website in a phone frame:
- Every screen is a vertical stack of marketing sections, each with a gold overline + serif H2 + content ("SHOP BY CATEGORY / Explore Our Collections").
- Teal/gradient banners repeat (hero, free-delivery bar, More header, promo) so teal reads as "banner colour", not "tint".
- White cards with big shadows on cream, pill chips everywhere, uppercase tracked badges ("HALAL CERTIFIED") on every photo, gold gradient buttons with glow.
- Serif headlines on every screen and a custom (non-native) header, so nothing behaves like iOS (no large-title collapse, no sheets, no swipe actions).
- The tab bar has labels, a gold active pill, and 4 tabs.

### 1.2 The five principles
1. **Content is the interface.** Photography is full-bleed and large; chrome is nearly invisible (system backgrounds, hairlines, SF type). Colour comes from the food, not from banners.
2. **Teal is the tint, not a banner.** Teal colours interactive text/icons/primary buttons exactly as iOS blue does. Large teal fills appear in exactly three places: splash, primary buttons, the tab bar's dark glass. Gold is a single rare accent (section 2.3).
3. **Native behaviour over custom animation.** Native stack headers with large-title collapse, native sheets with detents, swipe actions, context menus, pull to refresh, haptics. Custom motion is limited to press feedback, the Today-card, the splash and the add-to-cart confirmation.
4. **One hero per screen.** Each screen has one visually dominant element (featured card, product photo, order status card). Everything else is quiet lists and shelves.
5. **Dense, scannable, tappable.** Compact rows (56 to 88 pt) and horizontal shelves instead of tall stacked sections. A first-time visitor should see at least 3 distinct content groups on the Home screen without scrolling past the first screen.

### 1.3 Changes vs v1 (summary table)

| Area | v1 | v2 |
|---|---|---|
| Fonts | Playfair everywhere for headings, Inter for UI | System font (SF Pro) for everything. Playfair 700 only at 3 brand moments (2.1.3). Inter removed. |
| Background | Warm cream `#FAF7F1` + white cards | System white / grouped grey-teal `#F2F4F3`; dark mode supported |
| Header | Custom `ScreenHeader` | Native stack header: large title, collapse, blur on scroll |
| Tabs | 4 labelled tabs, gold pill, opaque teal | 5 icon-only tabs in floating glass capsule (Home, Shop, Search, Cart, Account) |
| Home | Hero carousel + 7 sections | Today-style feed: header, 1 featured card, quick glyph row, shelves |
| Cards | White shadowed cards everywhere | Photo tiles without card chrome; inset grouped lists for text content |
| Buttons | Gold gradient glow | Teal filled (primary), tinted (secondary), plain (tertiary); no glow |
| Tags | Uppercase tracked badges on photos | Sentence-case 12 pt `Tag`, only where it carries information, never on grid photos |
| Checkout | Custom payment picker | Stripe PaymentSheet (guest) in a native page sheet |
| Motion | Staggered `Reveal` on every list | Springs for press, native transitions; no stagger on lists |

### 1.4 Explicit DO NOT list
Builders and reviewers reject a PR that does any of these.
1. DO NOT put a serif font on any screen title, section title, button, price or card except the three sanctioned moments.
2. DO NOT use uppercase tracked "overline" labels above section titles. Section titles stand alone.
3. DO NOT build a "section" as overline + H2 + sub-copy + content. A shelf is: Title2 title, optional "See All" tint button, content.
4. DO NOT use a full-width teal/gradient banner for anything except the splash screen. No teal "free delivery" banner, no teal "More" header, no promo strip with gradient.
5. DO NOT use drop shadows on list tiles, rows or grid items. Shadows only on floating objects (tab bar, buy bar, Today card, toasts) and only in light mode.
6. DO NOT use gold fills for primary buttons, and no coloured glow shadows.
7. DO NOT overlay badges or tags on grid/shelf photos. Product tags (Halal, Vegan) appear only on the product page as a plain text row and as a footnote line in Search rows.
8. DO NOT use carousel pagination dots on Home. (Product gallery, if any, may use the native-style page indicator.)
9. DO NOT replicate website section order, the hero slider, testimonials grid, "trust strip", newsletter, or footer link columns. (Testimonials move to About only.)
10. DO NOT use bordered outline pill chips on a cream background as the main filter pattern. Filters are filled capsules (selected) vs `fill` token capsules (unselected).
11. DO NOT use emoji as UI icons. Icons are SF Symbols on iOS (Ionicons fallback elsewhere).
12. DO NOT animate lists in with staggered fade/slide. Content appears instantly or with a single 150 ms fade when an image loads.
13. DO NOT hard-code colours. Use `useTheme()` roles (2.3). Forbidden: importing `colors.cream`, `colors.paper`, `colors.gold` in screens.
14. DO NOT use confetti, bounce loops, or auto-advancing carousels.
15. DO NOT render more than 2 live `BlurView`/`GlassView` instances per screen (tab bar + at most one other).

---------------------------------------------------------------------------------------------------

## 2. Design tokens v2

All tokens live in `src/theme/` and are consumed via `useTheme()`. Static imports of colour values are removed (see 6.4).

### 2.1 Typography

#### 2.1.1 Family
`fontFamily: 'System'` on iOS (SF Pro Text/Display automatic optical sizing), `undefined` on Android (Roboto) and web (`system-ui`). No font files for UI text. Use `fontWeight` strings. Never set `fontFamily` to a loaded custom font except Playfair at the sanctioned moments.
`fontVariant: ['tabular-nums']` on all prices, quantities, order numbers and totals so digits align.

#### 2.1.2 Scale (points; matches Apple HIG default Dynamic Type "Large")

| Role (`TextVariant`) | Size / Line | Weight | Tracking (pt) | Use |
|---|---|---|---|---|
| `largeTitle` | 34 / 41 | 700 | +0.37 | Native large-title headers; Home greeting |
| `title1` | 28 / 34 | 700 | +0.36 | Product page name; order-status headline |
| `title2` | 22 / 28 | 700 | +0.35 | Shelf/section titles |
| `title3` | 20 / 25 | 600 | +0.38 | Sheet titles, card titles on the Today card |
| `headline` | 17 / 22 | 600 | -0.41 | Row titles, button labels (large), nav titles |
| `body` | 17 / 22 | 400 | -0.41 | Paragraphs, field values |
| `callout` | 16 / 21 | 400 | -0.32 | Secondary row text, field labels |
| `subhead` | 15 / 20 | 400 (600 for `subheadStrong`) | -0.24 | Tile names, row subtitles |
| `footnote` | 13 / 18 | 400 (600 `footnoteStrong`) | -0.08 | Weights, helper text, "See All" |
| `caption1` | 12 / 16 | 400 (500 `caption1Strong`) | 0 | Tags, timestamps |
| `caption2` | 11 / 13 | 500 | +0.06 | Tab badge numerals, tiny meta |
| `priceLarge` | 22 / 28 | 700, tabular | +0.35 | Product page price |
| `price` | 15 / 20 | 600, tabular | -0.24 | Tiles and rows |
| `brandDisplay` | 34 / 38 | Playfair 700 | -0.4 | Brand moments only |

Line-heights are multiplied by `fontScale` automatically; never pass a fixed height to a container of text.
Casing: sentence case everywhere. No `textTransform: 'uppercase'` except the Home date line (`caption1Strong`, +0.6 tracking, secondary colour), which mirrors Apple's Today date.

#### 2.1.3 Brand serif, decision and justification
Decision: Playfair Display Bold (`PlayfairDisplay_700Bold`) is retained, used in exactly three places, and nowhere else:
1. **Splash**: the "Humi's" wordmark.
2. **Home Today card**: the featured product's headline (`brandDisplay` 34/38, white, over the photo). One serif headline per Home visit makes the card feel like an editorial cover, as the Today tab does with its custom typography.
3. **Order confirmation**: the "Thank you" title (`brandDisplay`).
Justification: the website's identity is the serif; three high-emotion moments (open, feature, purchase) carry the brand without making the app look like the website. Everything operational (prices, lists, forms, nav) is SF so the app feels native and Dynamic Type behaves. Load only `PlayfairDisplay_700Bold`; remove `_800ExtraBold`, `_700Bold_Italic` and the whole `@expo-google-fonts/inter` package. `brandDisplay` maxFontSizeMultiplier = 1.2.

#### 2.1.4 Dynamic Type
Default `allowFontScaling` true. `maxFontSizeMultiplier`: 1.6 for body-level text, 1.3 for buttons/chips/tags/segmented/badges, 1.2 for `brandDisplay`, 1.0 for the tab bar (icons only). Layout rules at `fontScale >= 1.35`: 2-column grids become 1 column, row thumbnails shrink to 48, horizontal quantity+price rows stack vertically (see 7.1).

### 2.2 Spacing and layout
4 pt grid. `space = { 2, 4, 8, 12, 16, 20, 24, 32, 40, 56 }` named `xxs, xs, sm, md, lg, xl, xxl, xxxl, huge, giant`.
- Screen horizontal margin `margin = 20` (iOS 26 inset-grouped standard). Shelves bleed to the screen edge: the scroller has `contentContainerStyle.paddingHorizontal = 20`, so the first item aligns with the title and the last peeks.
- Vertical rhythm: title to content 12; shelf to shelf 32; row inner vertical padding 12; grouped-section gap 24; grouped-section header (footnote, secondary, uppercase NOT used) 8 below label.
- Min touch target 44 x 44 (extend with `hitSlop` where the visual is smaller).
- Safe areas: top content begins under the native header (see 3.7 for insets). Bottom inset constant `TAB_INSET` defined in 3.6.

### 2.3 Colour roles

All roles are exposed on `useTheme().c`. Hex values are final. Light / Dark.

| Role | Light | Dark | Notes |
|---|---|---|---|
| `background` | `#FFFFFF` | `#050C0C` | Primary canvas (Home, Product, Shop, Search) |
| `groupedBackground` | `#F2F4F3` | `#050C0C` | Account, Cart, Checkout, forms |
| `cell` | `#FFFFFF` | `#141F1F` | Inset grouped rows on `groupedBackground` |
| `elevated` | `#FFFFFF` | `#1B2828` | Sheets, popovers, toasts |
| `fill` | `rgba(16,26,26,0.06)` | `rgba(255,255,255,0.10)` | Unselected chips, search field, steppers, skeleton base |
| `fillStrong` | `rgba(16,26,26,0.12)` | `rgba(255,255,255,0.16)` | Pressed state of fill |
| `separator` | `rgba(16,26,26,0.14)` | `rgba(255,255,255,0.14)` | Hairline (0.5 pt via `StyleSheet.hairlineWidth`) |
| `separatorOpaque` | `#D9DEDD` | `#2A3636` | Where translucency is unsafe |
| `label` | `#101A1A` | `#F2F6F6` | Primary text |
| `labelSecondary` | `#4A5857` | `#A8B6B5` | Secondary text |
| `labelTertiary` | `#627070` | `#7F8E8D` | Tertiary text, meta, placeholder text |
| `labelQuaternary` | `#8A9695` | `#566362` | Disabled, decorative only (never essential text) |
| `tint` | `#125B64` | `#4DB6C1` | Links, icons, selected states, "See All", text buttons |
| `tintFill` | `#125B64` | `#1A7480` | Primary button background; label `#FFFFFF` |
| `tintPressed` | `#0D4D4D` | `#176B76` | Primary button pressed |
| `tintSoft` | `rgba(18,91,100,0.10)` | `rgba(77,182,193,0.16)` | Tinted button bg, tag bg, icon discs |
| `onTint` | `#FFFFFF` | `#FFFFFF` | Text/icons on `tintFill` |
| `accent` | `#E5A83B` | `#E5A83B` | Gold; fills only (stars, progress, splash mark). Label on it: `#08302F` |
| `accentText` | `#8A5F00` | `#E5A83B` | When gold must be text (rare) |
| `accentSoft` | `#FBF1DC` | `rgba(229,168,59,0.16)` | Rarely: "free delivery unlocked" row tint |
| `destructive` | `#C0392B` | `#FF6B5B` | Delete, errors, cart badge fill (badge text `#FFFFFF`; dark badge fill stays `#C0392B`) |
| `success` | `#1E7F52` | `#4CC38A` | Delivered, free delivery |
| `scrim` | `rgba(5,12,12,0.78)` | same | Bottom gradient on photos (transparent to scrim) |
| `glassTint` | `rgba(8,24,25,0.52)` | `rgba(8,24,25,0.52)` | Tab bar glass overlay (same both modes, see 3.4) |
| `glassSolid` | `rgba(14,27,27,0.94)` | `rgba(14,27,27,0.94)` | Reduce-transparency fallback |

Gold rules ("accent used rarely"): gold may appear (a) as rating stars, (b) the free-delivery progress fill and its "unlocked" checkmark, (c) the splash logo mark, (d) the active step dot on order tracking. Maximum one gold element per screen except Product (stars) plus nothing else. Gold is never a button colour and never text on white.
Brand reds: `destructive` is used for destructive actions, validation errors and the cart badge only.
Brand tokens kept from v1 for gradients only: `tealInk #08302F`, `tealDeep #0D4D4D`, `teal #125B64`.
Splash/Hero gradient: `['#08302F','#0D4D4D','#125B64']`, start (0,0), end (1,1).
Dark mode: follows `useColorScheme()`; Account has an Appearance control (System / Light / Dark) persisted in `useSettingsStore`; `app.json` `userInterfaceStyle` changes from `"light"` to `"automatic"`. Photography is never dimmed in dark mode.

### 2.4 Radii (all with `borderCurve: 'continuous'` on iOS; a `radius()` helper returns `{ borderRadius, borderCurve }`)
`xs 6` (thumb badges, progress), `sm 10` (inputs, steppers segments), `md 14` (row thumbnails, buttons non-capsule), `lg 20` (grid/shelf photos, inset grouped sections), `xl 28` (Today card, sheets' top corners fallback, product content sheet), `capsule 999` (buttons, chips, tab bar, search field). Nested rule: inner radius = outer radius minus padding (clamped to min 6).

### 2.5 Elevation, shadows, materials
- Light-mode shadows (iOS `shadow*`, Android `elevation`), colour `#08302F`:
  - `float` (tab bar, buy bar, toasts): opacity 0.18, radius 24, offset (0, 10), elevation 10.
  - `card` (Today card only): opacity 0.14, radius 28, offset (0, 14), elevation 8.
  - Nothing else has a shadow.
- Dark mode: no shadows. Separation via `cell/elevated` fills and 0.5 pt `separator` stroke on floating objects.
- Materials (expo-blur `BlurView` tints, VERIFY names in docs v58): `thin = systemThinMaterial`, `chrome = systemChromeMaterial` (header, sheets) with `Dark` variants chosen by scheme (`systemThinMaterialDark`, `systemChromeMaterialDark`). Intensity 80.
- iOS 26 glass: `expo-glass-effect` `GlassView` (`glassEffectStyle: 'regular'`, `isInteractive: true`) when `isLiquidGlassAvailable()` is true (VERIFY package name and API in docs v58; install with `npx expo install expo-glass-effect`). Else BlurView + tint + hairline recipe (3.4). One shared `GlassSurface` component (6.2) owns this decision.
- Image scrim: `LinearGradient` `['rgba(5,12,12,0)', scrim]`, locations `[0.35, 1]`.

### 2.6 Motion
Library: `react-native-reanimated` 4 only. All values below are final.

Springs (`withSpring`):
| Name | Config | Use |
|---|---|---|
| `press` | damping 22, stiffness 420, mass 0.6 | Press-in/out scale (rows, tiles, buttons) |
| `snappy` | damping 24, stiffness 300, mass 1 | Tab pill slide, stepper, toggles |
| `smooth` | damping 28, stiffness 180, mass 1 | Today card entrance, sheet-like content |
| `bouncy` | damping 14, stiffness 210, mass 0.9 | Add-to-cart success pop, cart badge bump only |

Timing (`withTiming`, ms): `fast 150`, `base 250`, `slow 400`, `splashIn 700`, `splashOut 450`. Easings: `standard = Easing.bezier(0.2, 0, 0, 1)` (decelerate in, default), `exit = Easing.bezier(0.4, 0, 1, 1)`, `inOut = Easing.bezier(0.42, 0, 0.58, 1)`.
Press scale: rows no scale (background highlight `fill` fades 100 ms); tiles 0.97; buttons 0.97; Today card 0.96; tab icons 0.88 then spring back. Opacity of pressed text buttons 0.6.
Haptics (`expo-haptics`): `selection` on tab change, chip change, stepper tick, sort choice; `impact light` on add to cart; `notification success` on order placed and favourite on; `warning` on destructive swipe commit. Wrapped no-op on web.
Reduced motion (`useReducedMotion()`): springs become 150 ms fades, scale-on-press 0.99, parallax and splash scale off (see 7.4).

---------------------------------------------------------------------------------------------------

## 3. Tab bar: floating glass capsule (matches the owner's Instagram iOS 26 reference)

### 3.1 Structure
Five icon-only tabs in this order: **Home, Shop, Search, Cart, Account**. Custom `GlassTabBar` supplied to expo-router `Tabs` via the `tabBar` prop. Decision: do NOT use `NativeTabs`; it cannot produce an icon-only floating capsule with brand-tinted dark glass and does not behave identically in Expo Go/web/Android.

### 3.2 Geometry (points, iPhone 393 wide as reference)
- Capsule: height **62**, horizontal margin **20** (width 353), fully rounded (`radius 31`, continuous).
- Bottom offset: `bottom = Math.max(insets.bottom - 8, 12)` (on a Face ID iPhone: 26 pt gap between capsule and screen bottom, so it floats just above the home indicator zone like the reference; on home-button devices: 12).
- Inner padding 6 on all sides. Five equal slots: slot width = (screenWidth - 40 - 12) / 5 = 68.2, slot height 50.
- Icon size **26** (SF Symbol, `weight: regular` inactive, `fill` variant active), centred in slot.
- Hit area: whole slot (68 x 50 plus 6 vertical hitSlop = 62 high).
- No labels (VoiceOver labels only, 3.9).

### 3.3 Active-tab pill
- A single `Animated.View` behind the icons: slot size (68 x 50), radius 25 continuous, 0.5 pt inner stroke. Dark: fill `rgba(255,255,255,0.16)`, stroke `rgba(255,255,255,0.10)` (the "lighter pill" in the reference). Light: fill `rgba(14,27,27,0.08)`, stroke `rgba(14,27,27,0.06)`.
- It slides to the active slot with the `snappy` spring (translateX). While sliding, scaleX stretches to 1.08 at mid-travel (interpolate over distance) then returns; omit if reduced motion.
- Active icon: filled variant. Inactive icon: outline variant. Dark: `#FFFFFF` / `rgba(255,255,255,0.66)`. Light: `#0E1B1B` / `rgba(14,27,27,0.62)`. (White icons in light mode vanished over light photography; owner feedback 2026-10-26.)
- Tap: icon scale 0.88 on press-in, spring back, `haptics.selection()`. Re-tapping the active tab scrolls that screen to top (and pops its stack to root).

### 3.4 Glass recipe
The glass **follows the app theme**, like the Instagram iOS 26 bar (owner feedback 2026-10-26 replaced the earlier "same dark glass in both modes" rule: the 0.52 dark tint read as a solid slab on dark UI and the capsule vanished on light UI). Values live in `LIGHT_GLASS` / `DARK_GLASS` in `GlassTabBar.tsx`.
1. Frost on every non-solid path: `BlurView` (`systemThinMaterialLight` / `systemThinMaterialDark`, intensity 80) clipped to the capsule, so content behind is blurred, not just seen through (`clear` glass was too transparent).
2. iOS 26+ with `isLiquidGlassAvailable()`: `GlassView` (regular, interactive) on top of the frost for rim and lensing, `colorScheme` = app theme, tint light `rgba(255,255,255,0.18)` / dark `rgba(20,28,28,0.22)`, `style: borderCurve continuous, radius 31`. iOS < 26 / web: the same tint as a plain overlay instead of the GlassView.
3. Android, or `AccessibilityInfo.isReduceTransparencyEnabled()` true: solid fill (light `rgba(250,250,248,0.97)`, dark `rgba(30,38,38,0.96)`).
4. All paths: 0.5 pt rim (light `rgba(14,27,27,0.10)`, dark `rgba(255,255,255,0.20)`) and a 1 pt top highlight inset 14 pt, so the edge reads on any background. Light mode adds an outset `boxShadow` `0 8px 24px rgba(8,48,47,0.10)` (outset, so it never darkens the glass); dark mode has no shadow (2.5).

### 3.5 Cart badge
On the Cart icon, top-right of the icon: circle min 18 x 18 (grows to a capsule for 2 digits), offset (+9, -9) from the icon centre, fill `destructive #C0392B`, text `#FFFFFF` `caption2` 11/13 weight 600 tabular, border 2 pt to separate it from the capsule (dark `rgba(8,24,25,0.9)`, light `rgba(255,255,255,0.95)`). Shows `count` up to 9, then "9+". Hidden at 0. When `count` increases: `bouncy` scale 1 to 1.35 to 1 plus `haptics.light`. VoiceOver label includes the count.

### 3.6 Scroll behaviour and content insets
- The bar does NOT hide on scroll (matches the reference and keeps the 1-tap tab switch; Apple's own bar minimises only when opted in).
- It is position:absolute, overlaying content. Constant: `TAB_INSET = 62 (capsule) + bottomOffset + 16 (breathing space)`, exposed by `useTabInset()` (= 62 + max(insets.bottom - 8, 12) + 16; 104 on Face ID iPhones). Every tab-root scroll view sets `contentContainerStyle.paddingBottom = TAB_INSET` and `scrollIndicatorInsets.bottom = TAB_INSET - 16`. Pinned bars above the tab bar (Cart checkout button) sit at `bottom = TAB_INSET - 16 + 8`.
- Content scrolls under the capsule; no opaque strip behind it. The status-bar area likewise uses the native blurred header.
- Hidden entirely (translateY + opacity to 0 over `base`) when a non-tab route is on top, because pushed routes (Product, Checkout, Order) live in the root stack above `(tabs)`, so the bar is not rendered on them. They provide their own bottom glass bar.
- Keyboard: bar hides while the keyboard is visible (Search, forms) with a 200 ms fade.

### 3.7 Native header interplay
Tab root screens use native stack headers inside each tab (`expo-router` `Stack` per tab) with `headerLargeTitle: true`, `headerTransparent: true`, `headerBlurEffect: 'systemChromeMaterial'` (VERIFY option names in docs v58), `headerLargeTitleShadowVisible: false`, `contentInsetAdjustmentBehavior="automatic"` on the scroll view.

### 3.8 Icon set (SF Symbols via `expo-symbols`, Ionicons fallback via `@expo/vector-icons`; one `Icon` component maps both)

| Tab | Inactive (SF / Ionicons) | Active (SF / Ionicons) |
|---|---|---|
| Home | `house` / `home-outline` | `house.fill` / `home` |
| Shop | `square.grid.2x2` / `grid-outline` | `square.grid.2x2.fill` / `grid` |
| Search | `magnifyingglass` / `search-outline` | `magnifyingglass` (weight semibold) / `search` |
| Cart | `bag` / `bag-outline` | `bag.fill` / `bag` |
| Account | `person.crop.circle` / `person-circle-outline` | `person.crop.circle.fill` / `person-circle` |

`expo-symbols` is installed with `npx expo install expo-symbols` (VERIFY). Other icons used in the app (nav buttons etc.) go through the same `Icon` component with a name map in `src/components/ui/Icon.tsx`.

### 3.9 Accessibility of the bar
Container `accessibilityRole="tablist"`; each slot `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, labels "Home", "Shop", "Search", "Cart, 3 items" / "Cart, empty", "Account". The badge is not separately focusable.

---------------------------------------------------------------------------------------------------

## 4. In-app brand splash

The native splash (expo-splash-screen) stays as a plain `#08302F` fill with the logo mark centred (no animation) to guarantee a seamless hand-off. `BrandSplash` is the first React screen rendered on cold start (not on resume), absolutely covering the app (zIndex 1000) while `Home` mounts and loads beneath it.

### 4.1 Visuals
- Background: linear gradient `['#08302F','#0D4D4D','#125B64']`, start (0,0) end (1,1), full screen including safe areas. Status bar `light`.
- Centre stack, vertically centred at 46% of screen height:
  1. Logo mark (the website logo asset, 120 x 120, placed at `assets/brand/logo-mark.png`; builder obtains it from humisfrozenfoods.com; fallback to existing `Logo variant="mark"` at size 120).
  2. 20 pt gap, then wordmark "Humi's" in `brandDisplay` (Playfair 700, 44/48 on splash only), colour `#FFFFFF`.
  3. 6 pt gap, then "FROZEN FOODS" `caption1Strong` tracking +3.2, colour `#E5A83B` (gold; this is the sanctioned splash gold).
- A soft radial glow behind the mark: 360 pt circle, `rgba(229,168,59,0.18)` centre to transparent, opacity animates 0 to 1.
- Bottom, 32 pt above bottom safe area: `caption1` "Halal. Made in the UK." `rgba(255,255,255,0.55)`.

### 4.2 Timeline (total 3.6 s typical; min 3.0 s, max 5.0 s)
| t (ms) | Event |
|---|---|
| 0 | Gradient fully visible (matches native splash colour); mark at opacity 0, scale 0.82 |
| 150 | Mark: opacity 0 to 1 over 500 (`standard`), scale 0.82 to 1 with `smooth` spring; glow opacity 0 to 1 over 900 |
| 900 | Wordmark: opacity 0 to 1 over 600 `standard`, translateY 10 to 0, letterSpacing 6 to -0.4 |
| 1500 | "FROZEN FOODS": opacity 0 to 1 over 400; bottom line fades in over 400 |
| 1500 to 3000 | Slow settle: mark and wordmark scale 1 to 1.035 over 1500 linear (life without looping) |
| >= 3000 and data ready | Exit starts |
| exit (450) | Whole splash opacity 1 to 0 over 450 `inOut` plus mark scale 1.035 to 1.12; simultaneously Home content opacity 0 to 1 and translateY 12 to 0, scale 0.985 to 1 over 480 `standard`. Splash unmounts at the end. |
Ready = fonts loaded AND stores hydrated AND `Image.prefetch` of the featured card image (w=1080) plus the first 6 shelf thumbnails (w=256) resolved, OR t = 5000 ms (whichever first; at 5000 proceed regardless). Haptic: none. Sound: none.
Reduced motion: no scale or translate; sequence is opacity only, min display 1500 ms, exit 250 ms cross-fade.
Shown once per process start; never again on tab changes or foregrounding.

---------------------------------------------------------------------------------------------------

## 5. Screen specs

Common to all screens:
- Native large-title header unless stated; `groupedBackground` for list-like screens, `background` for photo-led screens.
- Pull-to-refresh is NOT used (static local data), except Orders (refreshes status).
- Skeletons: because images are remote, every image slot has a fixed aspect ratio and a `fill` placeholder (`Skeleton`, opacity pulse 0.55 to 1 over 1100 ms inOut, no gradient sweeps). Data is local, so lists render instantly; "loading" states exist for images, Stripe/network actions and order lookups.
- Errors: inline footnote in `destructive` below the field, or a native `Alert` for blocking failures. No red banners.
- Wireframe unit: 1 character about 6 pt wide. Frames are 393 pt wide.

### 5.1 Home ("Today")

Goal: Apple Store / App Store Today feed. Route `(tabs)/index`. Native header is hidden (`headerShown: false`); Home draws its own title block so the featured card can sit tight under it, but the scroll view uses `contentInsetAdjustmentBehavior="never"` and the status bar area gets a `chrome` blur that fades in after 40 pt of scroll.

```
 status bar (blur fades in on scroll)
+-------------------------------------------+
| SATURDAY 24 OCTOBER                  (H)  |  caption1Strong 12, secondary; logo mark 36 circle -> About
| Good evening                              |  largeTitle 34
|                                           |  gap 16
| +---------------------------------------+ |
| |                                       | |  TodayCard: x=20, w=353, h=470, r=28
| |        full-bleed product photo       | |  photo fills card edge to edge
| |                                       | |
| |  Best seller            (caption1)    | |  white 80%, at (20,y-150)
| |  Meat Spring                          | |  brandDisplay serif 34/38 white (2 lines max)
| |  Rolls                                | |
| | +-----------------------------------+ | |  glass info bar: inset 12, h 64, r 20
| | | [thumb]  Crispy, ready in 8 min   | | |   thumb 40 r10, subhead white, footnote 70% white
| | |          From £7.00      ( + )    | | |   round add button 40 (white fill, tint icon)
| | +-----------------------------------+ | |
| +---------------------------------------+ |
|                                           |  gap 24
|  ( O )  ( O )  ( O )  ( O )  ( O )  (O)   |  quick glyph row, scrolls
|  Savory Kebabs Samosa Veg    Vegan  10min |  footnote 13, centered under 68 circles
|                                           |  gap 24
|  15% off your first order    [ HUMI15 ]   |  PromoRow: h52, r16, tintSoft, 1 line
|                                           |  gap 32
|  Buy Again                       See All  |  title2 22 + footnote tint
|  [img][img][img][img]->                   |  Shelf of SquareTile 132
|  name  name  name                         |
|  £5.98 £9.50 £7.00                        |
|                                           |  gap 32
|  Top Picks                        See All |
|  +----------------+ +----------------+    |  Paged list shelf: card width 333 (peek 40), 3 rows
|  | [64] Name   (+)| | [64] Name   (+)|    |  each row h 76
|  | [64] Name   (+)| | ...            |
|  | [64] Name   (+)| |                |
|  +----------------+ +----------------+    |
|                                           |
|  New This Week                            |
|  [portrait 156x208][..][..]->             |  PortraitTile shelf
|                                           |
|  Free delivery over £25 . Halal . UK made |  footnote tertiary, centered, 1 line
+-------------------------------------------+   bottom padding TAB_INSET
```

Components: `TodayHeader`, `TodayCard`, `QuickGlyphRow` (`GlyphChip`), `PromoRow`, `Shelf` (`ShelfHeader`), `SquareTile`, `PagedRowShelf` (`ProductRow`), `PortraitTile`, `FootnoteLine`.

Exact specs:
- `TodayHeader`: paddingTop = safeTop + 8, side 20. Date line `caption1Strong`, uppercase, tracking +0.6, `labelSecondary`; greeting `largeTitle`, `label` ("Good morning" before 12:00, "Good afternoon" before 17:00, else "Good evening"). Logo button right: 36 x 36 circle, mark image, taps to `/about` (push).
- `TodayCard`: 353 x 470 (aspect locks to 353 x (screenWidth * 1.2)); `borderCurve continuous`, radius 28, `shadows.card`. Image `contentFit="cover"`, `transition 200`. The featured product rotates daily: `heroSlides[dayOfYear % heroSlides.length]` (4 slides). Text block bottom-left, left 20, bottom 92: eyebrow `caption1Strong` white 80% (the slide's eyebrow, e.g. "Best seller"), title `brandDisplay` white, max 2 lines, `scrim` gradient covering lower 55%. Glass info bar (a `GlassSurface`, light tint, radius 20, height 64, inset 12 from card edges, bottom 12): left thumbnail 40 x 40 r10 (product image), two text lines (`subheadStrong` white, `footnote` white 72%), right 40 x 40 round add button (white fill, `tint` plus icon; adds 1 qty, `haptics.light`, icon morphs to a checkmark for 1200 ms).
  Interaction: press-in scales card to 0.96 (`press` spring) and dims nothing else; release opens Product with the native zoom/fade transition. The photo has a subtle parallax: while the card scrolls, the image translateY = scrollOffset * 0.12 (clamped +-24, image scaled 1.1 to cover). Disabled with reduced motion.
- `QuickGlyphRow`: 6 items, 68 x 68 circles, gap 16, `paddingHorizontal 20`, no snapping. Items 1 to 4: category photo circles (category `image`, cover) with a 2 pt `separator` ring; "Vegan" and "10 min" items use `tintSoft` discs with a 28 pt tint SF Symbol (`leaf`, `timer`). Label `footnote`, `label`, 1 line, centred, width 76. Tap pushes Shop with filter applied (`/shop?category=` or `?diet=vegan` or `?quick=1`).
- `PromoRow`: only shown when promo not yet applied and no orders exist (first-order incentive). Height 52, radius 16 continuous, `tintSoft` bg, left tag icon 20 (tint), text `subhead` "15% off your first order", trailing capsule `HUMI15` (`footnoteStrong`, bg `fill`, copies to clipboard; label changes to "Copied" 1.2 s, `haptics.success`). Not tappable elsewhere.
- `ShelfHeader`: row, title `title2`, trailing "See All" `footnote` weight 600 `tint` with a chevron.right 12 symbol; top padding 0, bottom 12. Title row accessibilityRole "header".
- `Buy Again` shelf: visible only when `orders.length > 0` (flattens past order lines, unique products, max 8, most recent first). When empty, replaced by `Best Sellers` shelf (same tile). `SquareTile`: image 132 x 132 radius 20, below it name `subheadStrong` (2 lines max, width 132), `footnote` `labelSecondary` price. Plus-button overlay: 32 circle `GlassSurface` (thin material) bottom-right inset 8 of the image, icon plus 16. Tile gap 12.
- `PagedRowShelf` "Top Picks": horizontal paging (`snapToInterval = 333 + 12`, `decelerationRate="fast"`), each page a `ProductRow` x 3 (best sellers 1 to 9, 3 pages). Row: height 76, thumbnail 64 x 64 r14, text column (name `headline` 1 line, `footnote` secondary "10 pcs . 500g", `price`), trailing "Add" capsule button (36 high, 64 wide, `tintSoft` bg, `tint` label "Add", becomes a `QuantityStepper` compact after adding). Rows separated by hairline inset 76 from the left.
- `PortraitTile` "New This Week": 156 x 208, r20; name overlaid at bottom over `scrim` gradient (footnoteStrong white), price `caption1` white 80%. Items: products tagged "New" else the 6 newest by data order.
- `FootnoteLine`: `footnote`, `labelTertiary`, centred, top padding 40.
Navigation: tapping any product opens `/product/[id]`; long-press a tile: native context menu (Add to cart, Add to favourites/Remove, Share) via `expo-router` `Link.Menu`/`zeego`-style native menu (VERIFY `Link` preview/menu support in docs v58; fallback `ActionSheetIOS`).
States: no loading state (local data). Image placeholders are `fill`. If `heroSlides` product is missing, the card falls back to `getBestSellers(1)`. Error: not applicable.
Signature interaction: the Today card press-zoom plus the glass bar add button; and the "Buy Again" shelf for one-tap reorder (single plus tap adds the same quantity as last order, toast "Added 2").

### 5.2 Shop
Route `(tabs)/shop` (accepts `?category=`, `?diet=vegan|halal`, `?quick=1`). Native large title "Shop", right bar item: sort/filter button (SF `line.3.horizontal.decrease.circle`, 44 hit) opening the Sort & Filter sheet.

```
+-------------------------------------------+
| Shop (large title 34)         (filter)    |
|                                           |
| [All][Savory Snacks][Kebabs][Samosas]->   |  CategoryRail: h34 capsules, sticky under header
|                                           |
| +--------------+  +--------------+        |  2-col grid, gutter 20, col gap 12
| |  photo 1:1   |  |  photo 1:1   |        |  w = (353-12)/2 = 170.5, r20
| |          (+) |  |          (+) |        |  glass plus 32
| +--------------+  +--------------+        |
| Punjabi Samosa    Chicken Shami           |  subheadStrong, 2 lines max
| 10 pcs . 500g     12 pcs . 600g           |  footnote secondary
| £5.98  *4.5       £9.50  *4.7             |  price + footnote rating (gold star 11)
|                                           |  row gap 24
```
- `CategoryRail`: capsules height 34, horizontal padding 14, `subheadStrong`; selected = `tintFill` bg + `onTint` text; unselected = `fill` bg + `label` text. Gap 8. Sticky: pinned directly under the collapsed header (via `stickyHeaderIndices` of a header-block item or `headerSearchBarOptions`-free sticky). Haptic selection on change; list cross-fades 150 ms.
- Count line: `footnote` secondary "17 products" under rail, 8 pt, aligned left. Active filter summary chips appear inline only when Sort/Filter is non-default ("Halal x", "Vegan x").
- Grid item = `ProductTile` (variant `grid`): photo 170.5 square r20; no heart, no badge. Plus button same as SquareTile. Press 0.97. Context menu on long-press (Add to cart, Favourite, Share).
- Sort & Filter sheet: `formSheet` presentation, detents `[0.5, 0.85]`, grabber visible, corner radius 28 native. Content: inset grouped sections "Sort by" (checkmark rows: Featured, Price low to high, Price high to low, Rating, A to Z), "Dietary" (two switch rows: Halal certified, Vegan friendly), "Ready in" (segmented control: Any, 5 min, 10 min). Footer: primary "Show 17 products" button (updates live count) and plain "Reset". Selection haptics.
- Empty (filters match none): centred `EmptyState`: SF `line.3.horizontal.decrease.circle` 48 tertiary, "No matches" `title3`, "Try removing a filter." `callout` secondary, `tinted` button "Clear filters".
- Loading: 6 skeleton tiles only while images load (image-level).
- Large title collapses on scroll (native). Scrolling to top by tapping the tab.
- Signature: category rail cross-fade and the sheet with live result count.

### 5.3 Search
Route `(tabs)/search`. Native large title "Search" with the native search bar in the header (`headerSearchBarOptions`, `placement: 'stacked'`, `hideWhenScrolling: false`, VERIFY). Fallback (Android/web): `SearchField` component (capsule, height 40, `fill` bg, magnifier, clear x).

```
+-------------------------------------------+
| Search                                    |
| [ magnifier  Search samosas, kebabs   ]   |
|                                           |
| Recent                         Clear      |  title3 + footnote tint
| (clock) chicken samosa            (x)     |  rows h44, swipe-left delete
| (clock) kebab                     (x)     |
|                                           |
| Browse                                    |
| +-----------+ +-----------+               |  2x2 CategoryTile h96, r20, photo + scrim + title white
| |Savory     | |Kebabs     |               |
| +-----------+ +-----------+               |
| +-----------+ +-----------+               |
|                                           |
| Popular                                   |
| (flame) Seekh Kebab   (flame) Aloo Tikki  |  text rows or chips
+-------------------------------------------+
```
- Typing: results replace the idle content immediately (filter debounce 0, local). Each result is a `ProductRow` (variant `search`): thumbnail 56, name with matched substring weight 700, footnote "Kebabs . Halal . 12 pcs", price, trailing `Add`. Section header "Top matches" if more than 8, plus "Category" matches shown first as a row with chevron.
- Submitting saves query to recents (max 8, persisted).
- Empty result: `EmptyState` "No results for 'xyz'" with "Browse all products" button.
- Keyboard: `keyboardDismissMode="on-drag"`; tab bar fades out while keyboard open.
- Signature: instant filtering with matched text emphasis; swipe-to-delete recents.

### 5.4 Product
Route `product/[id]` (root stack, pushes over tabs; tab bar not shown). Transition: native push with zoom from the tapped image where available (VERIFY `Link.AppleZoom`/`Stack.Screen` zoom transition in docs v58), else default slide with `fade_from_bottom`. Native header transparent, back button native (glass circle on iOS 26), right items: heart (`heart`/`heart.fill` tint bounce `bouncy`) and share (`square.and.arrow.up`).

```
+-------------------------------------------+
| (<)                          (heart)(share)|  native glass circles 44
|                                           |
|        photo, full-bleed, 393 x 420       |  height = screenWidth * 1.07, stretches on pull
|                                           |
|~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|  content sheet overlaps photo by 28, r28 top corners, background
|  Chicken Seekh Kebab              title1 |
|  12 pcs . 720 g                 callout  |
|  *4.8 (128)     Halal . Premium footnote |  stars gold 12; tags as plain text, dot separated
|                                           |
|  £13.50                        priceLarge|
|  per pack                      footnote  |
|                                           |
|  +-------------+-------------+---------+ |  FactStrip: 3 cells, dividers, h72
|  | READY IN    |  CERTIFIED  |  COOK   | |  caption1 secondary (sentence case in code)
|  | 10 min      |  Halal      |  Frozen | |  headline
|  +-------------+-------------+---------+ |
|                                           |
|  Crispy chicken kebabs seasoned...        |  body, 4 lines + "more" tint
|                                           |
|  Ingredients                          v   |  DisclosureRow (inset grouped), expands inline
|  Cooking instructions                 v   |
|  Allergens                            v   |
|                                           |
|  You May Also Like                        |  title2
|  [SquareTile][SquareTile]->               |
|                                           |  bottom padding 120
+-------------------------------------------+
|  [ - 1 + ]   [   Add to Cart . £13.50   ] |  BuyBar (glass), h 76 + safe bottom
+-------------------------------------------+
```
- Photo: `expo-image` cover, aspect from 1.07; pull-down overscroll scales the image (scale = 1 + overscroll/420, anchored top); scroll-up parallax translateY = offset * 0.4. Status bar `light` over photo; a 90 pt top `scrim` (inverse gradient, 0.35 opacity) so the glass buttons stay legible.
- Content sheet: `background` colour, radius 28 top, marginTop -28, padding 20 sides, top 24.
- Name `title1`, 2 lines max; tags plain text `footnote` `labelSecondary`; stars use `accent`.
- `FactStrip`: three equal cells, 0.5 pt vertical separators, cell label `caption1` `labelSecondary`, value `headline`; (data: `readyInMins`, "Halal" if tag, "Frozen" constant; Vegan replaces Halal when tagged Vegan, 4 cells then scroll horizontally).
- Description `body`, `numberOfLines 4`, "more" `tint`; expands with `base` timing.
- `DisclosureRow` (ingredients etc.): inset grouped (r20, `cell` on `groupedBackground` container margin 20), row 52, chevron rotates 90 deg, content `callout`. Cooking text synthesised from `readyInMins` ("Air fry or oven bake from frozen. Ready in about N minutes.").
- `BuyBar`: `GlassSurface` (thin material, no dark tint) full width, height 76 + bottom inset, hairline top, padding 12 20. Left: `QuantityStepper` (compact, 44 high, `fill` capsule, width 112). Right: primary button fills remaining width, height 52, capsule, `headline`, label "Add to Cart . £13.50" (price tabular; updates with quantity). On press: `haptics.light`; button goes `success` state for 1400 ms (checkmark.circle.fill + "Added", colour stays `tintFill`, content crossfade 150, pop `bouncy`); a toast capsule appears above the bar: "Added to Cart" + trailing "View Cart" (tint), 2.4 s. After the first add, quantity resets to 1.
- Favourite: heart toggles with a `bouncy` scale, `haptics.success` on add.
- Related: `getRelatedProducts(id, 8)` as SquareTile shelf.
- Skeleton: image slot `fill`, text lines as 3 `Skeleton` bars until `Image` onLoad (min 0 ms; no delay if cached).
- Error: product not found -> `EmptyState` "Product not found" with plain "Back" button.
- Signature: zoom transition from the tile + stretch-on-overscroll hero + glass buy bar.

### 5.5 Cart
Route `(tabs)/cart`. Native large title "Cart"; right bar item "Edit"? Not used (swipe actions replace it). Background `groupedBackground`.

```
+-------------------------------------------+
| Cart                                      |
|                                           |
|  £4.20 away from free delivery            |  footnote; ProgressTrack h4 gold; below title area, no card
|  [=========-----]                         |
|                                           |
|  +---------------------------------------+|  InsetSection r20 cell
|  | [64] Chicken Seekh Kebab        £27.00 ||  CartRow h88
|  |      12 pcs . 720g                    ||
|  |      [ - 2 + ]                        ||  stepper 32 high
|  |---------------------------------------||
|  | [64] Meat Spring Rolls           £7.00 ||
|  +---------------------------------------+|
|                                           |
|  +---------------------------------------+|
|  | (tag) Add promo code             >    ||  row 52 -> inline field / sheet
|  +---------------------------------------+|
|                                           |
|  +---------------------------------------+|
|  | Subtotal                       £27.00 ||  SummaryRows, callout
|  | Delivery                         Free ||  success colour
|  | Discount (HUMI15)              -£4.05 ||  success colour
|  | Total                      £22.95     ||  headline, bold
|  +---------------------------------------+|
|                                           |
|  Add a little extra                       |  title2; SquareTile shelf
|                                           |
|  [ Checkout . £22.95 ]  (pinned glass)    |  CheckoutBar above tab bar
+-------------------------------------------+
```
- `CartRow`: height 88 (`fontScale>=1.35`: auto), thumbnail 64 r14, name `headline` 2 lines, weight `footnote`, stepper right-aligned below the name (compact 32 high x 96 wide), line total `price` trailing-top. Swipe left reveals red "Remove" action (`destructive`, width 88, label "Remove", full swipe commits, `haptics.warning`). Reducing quantity to 0 asks nothing (undo toast "Removed . Undo" 4 s instead of confirm dialogs).
- `ProgressTrack` (free delivery): track `fill` 4 pt high, fill `accent` animated `smooth` width, text `footnote` `labelSecondary`; at >= £25: text becomes "You've unlocked free delivery" with a gold `checkmark.circle.fill` 16 and `success`-coloured text. No banner.
- Promo row opens an inline expanding field (text input + "Apply" tinted button); applied state shows `tag.fill` icon, "HUMI15 . 15% off", trailing "Remove" (tint). Invalid: footnote destructive "That code isn't valid."
- `CheckoutBar`: pinned capsule button, left/right margin 20, height 54, bottom = TAB_INSET - 8, `tintFill`, `headline` white, label "Checkout . £22.95", `shadows.float`; disabled style when cart empty (not rendered then). Pressing navigates to `/checkout` (modal).
- Empty state: SF `bag` 64 `labelTertiary`, "Your cart is empty" `title3`, "Add something delicious." `callout`, primary pill "Browse the Freezer" (goes to Shop); below it "Buy Again" shelf if available.
- Signature: swipe-to-remove with undo toast; animated free-delivery track.

### 5.6 Checkout (guest, Stripe PaymentSheet)
Route `checkout` presented as a native modal page sheet (`presentation: 'modal'`, grabber, swipe-down dismiss; confirm discard alert only if fields are dirty). Header: inline title "Checkout" (headline), left "Cancel" (tint). Background `groupedBackground`. Guest only: no sign-in.

```
+-------------------------------------------+
| Cancel          Checkout                  |
|                                           |
|  Contact                                  |  footnote, labelSecondary, above group
|  +---------------------------------------+|
|  | Email          you@example.com        ||  FieldRow h52: label 90 / value
|  | Phone          07...                  ||
|  +---------------------------------------+|
|  Delivery address                         |
|  +---------------------------------------+|
|  | Full name                             ||
|  | Address line 1                        ||
|  | Town / City          | Postcode       ||
|  +---------------------------------------+|
|  Delivery time                            |
|  [Today][Sat 25][Sun 26][Mon 27]->        |  DaySegment (capsules)
|  +---------------------------------------+|
|  | (o) Morning  8am-12pm                 ||  RadioRow h52
|  | ( ) Afternoon 12pm-5pm                ||
|  | ( ) Evening  5pm-9pm                  ||
|  +---------------------------------------+|
|  +---------------------------------------+|
|  | Order summary  2 items . £22.95    v  ||  collapsible
|  +---------------------------------------+|
|  Delivery notes (optional)  [..........]  |
|                                           |
|  [   Pay £22.95   ]  pinned glass bar     |
|  Secured by Stripe . Apple Pay accepted   |  caption1 tertiary
+-------------------------------------------+
```
- Field specs: `FieldRow` height 52, label `callout` `labelSecondary` 96 wide (stacked above the value when fontScale >= 1.35), value `body`, `returnKeyType next`, `autoComplete` hints (email, tel, name, address-line1, postal-code), `textContentType` for iOS autofill. Validation on blur and on submit; error text `footnote` `destructive` under the group; invalid field label turns `destructive`. Postcode normalised to uppercase (UK pattern).
- `DaySegment`: capsules like CategoryRail (next 5 days, today only if before 15:00).
- Pay button: pinned `BuyBar`-style glass bar, `tintFill`, label "Pay £22.95". Flow: validate -> `POST /payment-intents` (VERIFY backend URL, to be provided; until then a `StripeGateway` interface with a mock that returns a fake secret so the UI can be built) -> `initPaymentSheet` -> `presentPaymentSheet`.
- PaymentSheet config (`@stripe/stripe-react-native`, installed via `npx expo install @stripe/stripe-react-native`; requires a development build, not Expo Go; add its config plugin to `app.json`; VERIFY in docs v58): `merchantDisplayName: "Humi's Frozen Foods"`, `applePay: { merchantCountryCode: 'GB' }`, `defaultBillingDetails` from the form, `allowsDelayedPaymentMethods: false`, `returnURL: 'humi://stripe-redirect'`, `style: 'automatic'`, `appearance`: colors `primary #125B64`, `background` (light `#FFFFFF`, dark `#141F1F`), `componentBackground` (light `#F2F4F3`, dark `#1B2828`), `componentBorder` `separator`, `componentDivider` `separator`, `primaryText` label, `secondaryText` labelSecondary, `placeholderText` labelTertiary, `icon` tint, `error` destructive; shapes `borderRadius 14`, `borderWidth 0.5`; primaryButton shape `borderRadius 27`, colours `background #125B64`, `text #FFFFFF`. On Web/Android-without-plugin: show a "Payments need the app build" notice and keep the order flow stubbed.
- States: `idle`; `processing` (button shows spinner + "Processing", form disabled, back swipe blocked); `failed` (native Alert "Payment didn't go through", message from Stripe, buttons "Try Again", "Cancel"); `canceled` (return to idle, no alert); `success` -> create order record locally, clear cart, `router.replace('/order/[id]')`, `haptics.success`.
- Signature: the whole form is native-feeling grouped fields; Apple Pay sheet from PaymentSheet is the payoff.

### 5.7 Order confirmation
Route `order/[id]` (root stack, replaces checkout modal; back disabled, header has a "Done" button). Background `background`.

```
+-------------------------------------------+
|                               Done        |
|                                           |
|              ( check ring )               |  96 circle, draw-on animation
|                                           |
|            Thank you, Sam                 |  brandDisplay serif 34 (1 of 3 serif moments)
|     Order HUMI-48213 is confirmed         |  body secondary
|                                           |
|  +---------------------------------------+|  groupedBackground card r20
|  | Arriving Sat 25 Oct, 8am-12pm         ||  headline
|  | 14 High Street, M1 1AA                ||  callout secondary
|  |---------------------------------------||
|  | [t][t][t]  3 items         £22.95     ||  stacked thumbs
|  +---------------------------------------+|
|                                           |
|  [        Track Order        ]            |  primary 52
|  [     Continue Shopping     ]            |  plain tint text
+-------------------------------------------+
```
- Check ring: tint stroke 4 pt, circle draws over 500 ms `standard`, check over 300 ms; `haptics.success` at start; surrounding single pulse ring scale 1 to 1.6 opacity .35 to 0 over 700 ms (once). Reduced motion: static.
- Receipt email note `footnote` secondary: "A receipt was sent to sam@example.com."
- "Track Order" -> `/orders/[id]`; "Continue Shopping" -> `(tabs)/index`.
- Signature: the drawn check ring + serif "Thank you".

### 5.8 Account, Orders, Track
**Account** `(tabs)/account`: native large title "Account", `groupedBackground`.

```
+-------------------------------------------+
| Account                                   |
|  +---------------------------------------+|
|  | (H) Guest                             ||  IdentityRow h72: logo mark 48 circle
|  |     Your orders are saved on this     ||  footnote secondary
|  |     device                            ||
|  +---------------------------------------+|
|  +---------------------------------------+|
|  | (bag.circle)  Orders           2   >  ||  ListRow h52 + SF icon in tinted 30 sq disc r8
|  | (heart)       Favourites       5   >  ||
|  +---------------------------------------+|
|  Help & Company                           |
|  +---------------------------------------+|
|  | About Humi's                       >  ||
|  | Contact Us                         >  ||
|  | Wholesale (B2B)                    >  ||
|  | Become a Sales Rep                 >  ||
|  +---------------------------------------+|
|  Appearance                               |
|  +---------------------------------------+|
|  | [ System | Light | Dark ]             ||  SegmentedControl
|  +---------------------------------------+|
|  Follow us   Instagram . Facebook . TikTok|  footnote tint text links
|  Humi's Frozen Foods 2.0.0                |  caption1 tertiary
+-------------------------------------------+
```
- `ListRow` leading icon: 30 x 30 r8 `tintFill` square with white 17 pt SF symbol (Settings style; all the same teal, no rainbow); trailing value `body` `labelSecondary` + chevron.right 13 `labelQuaternary`.
- No teal header banner.

**Orders** `orders/index` (push from Account; native large title "Orders"):
- Sections "Active" and "Past" (inset grouped). `OrderRow` h92: stacked up to 3 thumbs (44, overlapped 14, 2 pt `cell` ring), "Order HUMI-48213" `headline`, `footnote` "24 Oct . 3 items", status `Tag` (tone by state), total `price` trailing. Swipe right (leading) action "Reorder" (tint, adds all lines, toast); long press menu: Reorder, Copy order number. Header-right button "Track" (`magnifyingglass`) opens a `formSheet` (detent 0.4) with an order-number field (guest lookup).
- Empty: SF `shippingbox` 56, "No orders yet", "Your orders will appear here.", button "Start shopping".
- Pull to refresh updates the simulated status.

**Track** `orders/[id]` (push):
```
+-------------------------------------------+
| (<)  Order HUMI-48213                     |  inline title
|                                           |
| +---------------------------------------+ |  StatusCard: r28, tealInk->teal gradient, h160 (only teal block in app after splash: allowed hero)
| | Out for delivery                      | |  title1 white
| | Arriving today 8am-12pm               | |  callout white 80%
| | [====][====][==--][----]              | |  4 segments h6, fill white / gold active
| +---------------------------------------+ |
|  Timeline                                 |
|  (o) Order placed         Sat 24 Oct 18:02|  vertical, 2 pt line, 12 pt dots; done = tint, current = gold + pulse (scale 1 to 1.5, 1.4 s, off in reduced motion)
|  (o) Preparing                            |
|  (o) Out for delivery                     |
|  ( ) Delivered                            |
|  Items (3)                                |  grouped rows (thumb 48, name, qty x, price)
|  Delivery address                         |
|  Need help? Contact Us >                  |
+-------------------------------------------+
```
(This teal gradient card is the screen's single hero. It is the sole exception to do-not 4 because it is live status data, not marketing.)

### 5.9 Favourites
Route `favorites` (push from Account, native large title "Favourites"). 2-col `ProductTile` grid identical to Shop. Context menu has "Remove from Favourites" (destructive). Edit: none. Empty state: SF `heart` 56, "No favourites yet", "Tap the heart on any product to save it here.", button "Explore".
Skeleton: none (local).

### 5.10 About / Contact / B2B
All three push from Account with native inline-collapsing large titles; `groupedBackground`.
- **About** (`about`): top full-bleed photo 393 x 260 (Today-card image set, `scrim`), title overlay not used (native title below). Sections: "Our Story" (body paragraphs, max width readable), "What we stand for" three `ListRow`s with SF icons and subtitles (Halal certified, Made in the UK, Ready in minutes), "Kind words" (a horizontal shelf of 3 testimonial cards: `cell`, r20, 280 wide, quote `callout`, name `footnoteStrong`, stars gold) , `footnote` address. No hero, no stats strip.
- **Contact** (`contact`): `ListSection` of action rows (Call, Email, Visit via Apple Maps, Opening hours with `callout` secondary multi-line) using `Linking`; below, "Send a message" grouped fields (name, email, topic menu, message multiline min 120); primary button "Send Message" pinned in content (not glass), disabled until valid. Success: the form collapses and a checkmark confirmation row appears; `haptics.success`.
- **B2B** (`b2b`): title "Wholesale"; intro `body` 3 lines; three benefit rows (SF icon, headline, footnote); "Request a call back" grouped form (business name, contact name, email, phone, business type via native `Menu`/picker, expected weekly volume segmented control, notes); primary "Send Enquiry". Apply-as-Sales-Rep is the same `EnquiryForm` template with different fields and copy (`variant="salesRep"`).
- Error/loading: submitting shows button spinner (800 ms mock), network failure -> native Alert; otherwise success state.

---------------------------------------------------------------------------------------------------

## 6. Component inventory v2

Ownership groups are non-overlapping so agents can build in parallel. Contract: props below are final; foundation lands first (agent A), the rest consume it.

### 6.1 Route map (expo-router, `src/app/`)
```
_layout.tsx                    root Stack + BrandSplash + providers (theme, Stripe, gesture)       [Shell]
(tabs)/_layout.tsx             Tabs with GlassTabBar; each tab has own Stack (headers)              [Shell]
(tabs)/index.tsx               Home                                                                [Home]
(tabs)/shop.tsx                Shop                                                                [Shop]
(tabs)/search.tsx              Search                                                              [Shop]
(tabs)/cart.tsx                Cart                                                                [Cart]
(tabs)/account.tsx             Account (renamed from more.tsx)                                      [Account]
product/[id].tsx               Product (card push)                                                 [Product]
sort-filter.tsx                formSheet, detents [0.5, 0.85]                                       [Shop]
checkout.tsx                   modal                                                                [Cart]
order/[id].tsx                 confirmation                                                         [Cart]
orders/index.tsx, orders/[id].tsx, orders/lookup.tsx (formSheet 0.4)                                [Account]
favorites.tsx, about.tsx, contact.tsx, b2b.tsx, sales-rep.tsx                                       [Account]
```

### 6.2 Foundation (agent A: `src/theme`, `src/components/ui`)

| Component / hook | Props | Variants / notes |
|---|---|---|
| `useTheme()` | none | returns `{ scheme, isDark, c: ColorRoles, type: Record<TextVariant, TextStyle>, space, radius(name), shadow, motion }`; respects `useSettingsStore.appearance` |
| `useTabInset()` | none | number (3.6) |
| `AppText` | `variant?: TextVariant = 'body'`, `color?: keyof ColorRoles \| string`, `align?`, `maxScale?`, `...TextProps` | all 14 variants (2.1.2); `brandDisplay` uses Playfair; tabular for price variants |
| `Icon` | `name: IconName`, `size?: number = 22`, `color?`, `weight?: 'regular'\|'semibold'\|'bold'`, `fill?: boolean` | SF Symbols (expo-symbols) on iOS, Ionicons elsewhere; name map file |
| `GlassSurface` | `children?`, `radius?`, `tone?: 'dark'\|'light'\|'adaptive' = 'adaptive'`, `interactive?`, `style?` | owns glass capability detection + reduce-transparency fallback (3.4) |
| `PressableScale` | `onPress?`, `onLongPress?`, `scaleTo?: number = 0.97`, `haptic?: 'none'\|'selection'\|'light'`, `disabled?`, `style?`, `accessibilityLabel` | UI-thread spring `press` |
| `Button` | `title`, `onPress`, `variant?: 'primary'\|'tinted'\|'plain'\|'destructive' = 'primary'`, `size?: 'sm'(36)\|'md'(44)\|'lg'(52)`, `icon?: IconName`, `loading?`, `disabled?`, `fullWidth?` | capsule; primary = `tintFill`/`onTint`; tinted = `tintSoft`/`tint`; plain = text `tint`; destructive = `destructive` text on `fill`. No gold variant. |
| `RoundButton` | `icon: IconName`, `onPress`, `size?: 32\|40\|44 = 40`, `material?: 'glass'\|'fill'\|'tint'`, `badge?`, `accessibilityLabel` | replaces `IconButton` |
| `Tag` | `label`, `tone?: 'neutral'\|'tint'\|'success'\|'destructive'\|'accent'`, `icon?` | caption1Strong, h22, r capsule, `*Soft` fills; sentence case |
| `FilterChip` | `label`, `selected`, `onPress`, `icon?` | h34 capsule per 5.2 |
| `Separator` | `inset?: number`, `vertical?` | hairline |
| `ListSection` | `header?: string`, `footer?: string`, `children` | inset grouped container r20 `cell`, children separated by inset hairlines |
| `ListRow` | `title`, `subtitle?`, `icon?: IconName`, `value?`, `onPress?`, `trailing?: ReactNode`, `destructive?`, `chevron?: boolean` | h52 (h64 with subtitle) |
| `FieldRow` | `label`, `value`, `onChangeText`, `error?`, `keyboardType?`, `autoComplete?`, `multiline?` ...TextInputProps | h52 |
| `SegmentedControl` | `options: string[]`, `index`, `onChange` | h32 r8 `fill`, selected `elevated` pill slides with `snappy`; native iOS control not used (cross-platform) |
| `QuantityStepper` | `value`, `onChange`, `min?=0`, `max?=20`, `size?: 'compact'(32)\|'regular'(44)` | capsule `fill`, symbols minus/plus 15, haptic selection; value tabular |
| `Price` | `value`, `size?: 'sm'\|'md'\|'lg'`, `compareAt?`, `color?` | maps to `price`/`priceLarge` |
| `Rating` | `value`, `count?`, `compact?` | single gold star glyph + value + count (not 5 stars) in compact |
| `Skeleton` | `width`, `height`, `radius?` | pulse only |
| `EmptyState` | `icon: IconName`, `title`, `message?`, `actionLabel?`, `onAction?` | 5.2 pattern |
| `Toast` + `useToast()` | `show({ message, actionLabel?, onAction?, duration? = 2400 })` | glass capsule above BuyBar/TabBar, `snappy` slide-up |
| `ScreenScroll` | `children`, `grouped?: boolean`, `tabInset?: boolean`, `onScroll?`, `refreshControl?` | replaces `Screen`; applies `contentInsetAdjustmentBehavior="automatic"`, `TAB_INSET`, keyboard dismiss |
| `FadeImage` | `uri`, `style`, `contentFit?`, `width?` (picks next/image width param, 2.1 of 7.2), `recyclingKey?` | expo-image, `transition 180`, `fill` placeholder |
| `BrandMark` | `size?: number`, `variant?: 'mark'\|'wordmark'` | uses real logo asset; replaces drawn `Logo` |

### 6.3 Feature components (one agent per group; no cross-edits)

**Shell (agent B)**: `GlassTabBar` (props from React Navigation `BottomTabBarProps`; reads `useCart().count`), `BrandSplash` (`ready: boolean`, `onDone()`), root and tabs layouts, settings store (`useSettingsStore`: `appearance`, `recentSearches`), `app.json` changes (`userInterfaceStyle: automatic`, plugins for expo-symbols/glass/stripe), `+not-found`.

**Home (agent C)** `src/features/home/`: `TodayHeader({ onLogoPress })`, `TodayCard({ product, eyebrow, onPress, onAdd })`, `QuickGlyphRow()`, `GlyphChip({ label, imageUri?, icon?, onPress })`, `PromoRow()`, `Shelf({ title, onSeeAll?, children })`, `SquareTile({ product })`, `PortraitTile({ product })`, `PagedRowShelf({ products, rowsPerPage = 3 })`, `FootnoteLine()`.

**Shop and Search (agent D)** `src/features/shop/`, `src/features/search/`: `ProductTile({ product, variant?: 'grid' })`, `ProductRow({ product, variant?: 'shelf'\|'search'\|'compact', query? })` (also used by Home PagedRowShelf; agent D owns it, agent C imports), `CategoryRail({ value, onChange })`, `SortFilterSheet` (route screen), `SearchIdle` (`Recent` + `Browse` + `Popular`), `CategoryTile({ category })`, `SearchField` (fallback), `useProductFilters()` hook (state in URL params).

**Product (agent E)** `src/features/product/`: `ProductHero({ uri, scrollY })`, `ProductHeaderButtons`, `FactStrip({ product })`, `DisclosureRow({ title, children })`, `BuyBar({ product })`, `AddedToast` (uses `useToast`).

**Cart and Checkout (agent F)** `src/features/cart/`, `src/features/checkout/`: `CartRow({ line })` (with swipe action via `react-native-gesture-handler` `Swipeable`, VERIFY), `FreeDeliveryTrack({ remaining })`, `PromoRowInput()`, `SummaryRows({ totals })`, `CheckoutBar({ total })`, `CheckoutForm` (`FieldRow`s, `DaySegment`, `RadioRow`), `useStripeCheckout()` hook (returns `{ pay(), state }`), `StripeGateway` interface (`createPaymentIntent(order): Promise<{ clientSecret }>`, mock impl), `ConfirmationCheck({ size })` (drawn ring).

**Account (agent G)** `src/features/account/`: `IdentityRow()`, `OrderRow({ order })`, `OrderStack({ lines })` (overlapped thumbs), `StatusCard({ order })`, `OrderTimeline({ status })`, `EnquiryForm({ variant: 'b2b'\|'salesRep'\|'contact' })`, `AppearancePicker()`, `AboutBlocks`.

### 6.4 v1 components: delete / replace

| v1 | Action |
|---|---|
| `theme/colors.ts` (`cream`, `paper`, `sand`, `gold` roles) | Replace with `theme/colors.ts` containing only brand constants + light/dark role maps (2.3); remove `cream/paper/sand/line/ink` and `shadows.gold` |
| `theme/typography.ts` | Replace with scale in 2.1.2; remove Inter, Playfair 800/Italic |
| `theme/layout.ts` | Replace (spacing, radii w/ continuous curve, shadows `float/card`, `TAB_INSET` as hook) |
| `ui/Surface`, `ui/SectionHeader`, `ui/Reveal`, `ui/ScreenHeader`, `ui/Screen`, `ui/IconButton`, `ui/Chip`, `ui/Badge`, `ui/Divider` | Delete; replaced by `GlassSurface/ListSection`, `Shelf`, none, native header, `ScreenScroll`, `RoundButton`, `FilterChip`, `Tag`, `Separator` |
| `ui/Button` | Rewrite (variants change; no gold, outline, light) |
| `ui/PressableScale`, `Price`, `Rating`, `QuantityStepper`, `Skeleton`, `EmptyState`, `FadeImage`, `AppText` | Rewrite in place to new API |
| `brand/Logo` | Replace by `BrandMark` using real logo asset |
| `navigation/FloatingTabBar` | Delete; replaced by `GlassTabBar` |
| `product/ProductCard` | Delete; replaced by `ProductTile`, `ProductRow`, `SquareTile`, `PortraitTile`, `TodayCard` |
| `features/home/*` (HeroCarousel, HomeTopBar, CollectionsRow, BestSellers, FreshGrid, PromoBanner, TrustStrip, Testimonials, ClosingCta) | Delete all |
| `features/shop/*` (Glass, SearchBar, FilterBar, CategoryChips, CartPeekBar, SortSheet, ShopScreen) | Delete; replaced per 6.3 (SortSheet logic reusable) |
| `features/product/*` (Accordion, AddToCartBar, InfoPills, ProductHero, RelatedProducts) | Delete; replaced per 6.3 |
| `features/cart/*` ConfettiBurst, PaymentPicker, SlotPicker, SuggestedRow, FormField, CartLineCard, FreeDeliveryBar, PromoField, SummaryRows | ConfettiBurst and PaymentPicker deleted (Stripe replaces it); others replaced by 6.3 (keep promo and totals logic in `lib/pricing.ts` unchanged) |
| `features/more/*` (MenuGroup, MenuRow, OrderCard, OrderTimeline, SuccessCard, FormInput) | Replace per 6.3; folder renamed `features/account` |
| `store/*`, `lib/*`, `data/*` | Keep. Additions: `useSettingsStore`, `Order.contact`, `Order.slot` fields, `getBuyAgain()` selector |

---------------------------------------------------------------------------------------------------

## 7. Accessibility and performance

### 7.1 Dynamic Type
Text uses `allowFontScaling` with caps from 2.1.4. At `fontScale >= 1.35` ("accessibility mode", `useA11yLayout()` hook): 2-col grids become 1-col with a 96 pt square image; `CartRow` stacks stepper under the name; `FactStrip` becomes a vertical list; Today card height grows to min(h, 0.7 * window height) and the glass info bar's text wraps to 2 lines; chips remain single-line and scroll. All containers around text use `minHeight`, not `height`. Test at the three largest Apple sizes (AX1 to AX3).

### 7.2 VoiceOver labels (final strings)
- Product tile: `"{name}, {weight}, {price}"`; hint "Opens product"; the plus button: label `"Add {name} to cart"`, after add `"{name} added, {n} in cart"`. Rating `"Rated {x} out of 5, {n} reviews"`.
- Today card: `"Featured: {name}, from {price}. Opens product"`; inner add button separately focusable.
- Tab bar: see 3.9. Stepper: `adjustable` role; `accessibilityValue {{ now: n }}`; increment/decrement actions; label "Quantity".
- Cart row swipe action exposed as `accessibilityActions` ("Remove", "Increase quantity", "Decrease quantity").
- Section titles `accessibilityRole="header"`. Decorative images `accessible={false}`; photos with meaning get product name label.
- Order status: "Order HUMI-48213, out for delivery, step 3 of 4". Toasts use `accessibilityLiveRegion="polite"` and `AccessibilityInfo.announceForAccessibility`.
- Progress track: `accessibilityValue {{ min 0, max 25, now subtotal }}` label "Free delivery progress".

### 7.3 Contrast (WCAG 2.2, computed with the sRGB relative-luminance formula)

Light mode
| Pair | Ratio | Verdict |
|---|---|---|
| `label #101A1A` on `#FFFFFF` / `#F2F4F3` | 17.73 / 16.05 | AAA |
| `labelSecondary #4A5857` on `#FFFFFF` / `#F2F4F3` | 7.43 / 6.73 | AAA / AA |
| `labelTertiary #627070` on `#FFFFFF` / `#F2F4F3` | 5.16 / 4.67 | AA (meta text only) |
| `tint #125B64` on `#FFFFFF` / `#F2F4F3` | 7.76 / 7.02 | AAA |
| `onTint #FFFFFF` on `tintFill #125B64` | 7.76 | AAA |
| `#FFFFFF` on `#0D4D4D` (pressed) | 9.61 | AAA |
| `#08302F` on gold `#E5A83B` | 6.78 | AA (label on gold) |
| gold `#E5A83B` on `#FFFFFF` | 2.10 | FAIL, so gold is never text on white |
| `accentText #8A5F00` on `#FFFFFF` | 5.65 | AA |
| `destructive #C0392B` on `#FFFFFF` / `#F2F4F3` | 5.44 / 4.92 | AA |
| `#FFFFFF` on `#C0392B` (badge) | 5.44 | AA |
| `success #1E7F52` on `#FFFFFF` | 4.98 | AA |
| `labelQuaternary #8A9695` on `#FFFFFF` | 3.05 | disabled/decorative only |

Dark mode
| Pair | Ratio | Verdict |
|---|---|---|
| `label #F2F6F6` on `#050C0C` / `cell #141F1F` | 18.12 / 15.49 | AAA |
| `labelSecondary #A8B6B5` on `#050C0C` / `#141F1F` | 9.42 / 8.05 | AAA |
| `labelTertiary #7F8E8D` on `#141F1F` | 4.94 | AA |
| `tint #4DB6C1` on `#050C0C` / `#141F1F` | 8.25 / 7.05 | AAA |
| `#FFFFFF` on `tintFill #1A7480` | 5.45 | AA |
| `destructive #FF6B5B` on `#050C0C` / `#141F1F` | 7.05 / 6.03 | AAA / AA |
| gold `#E5A83B` on `#050C0C` | 9.39 | AAA (so `accentText` = gold in dark) |
| `labelQuaternary #566362` on `#050C0C` | 3.15 | decorative only |

Over photography: text on photos only ever sits on the `scrim` gradient (min 0.62 opacity at text baseline, white text measured >= 7:1 on the worst product photo) or on the glass info bar with `glassTint`. Tab bar inactive icon `rgba(255,255,255,0.62)` on dark glass: 8.1:1 over `#12181A`. Non-text UI components (icons, input borders, selected states) need >= 3:1: `tint` and `separator`-opaque fills comply; unselected chips rely on label text (not fill) for identification.
Additional rules: never convey state by colour alone (selected chip also changes weight/fill; errors include text; delivered status includes a checkmark symbol).

### 7.4 Reduced motion, transparency, other settings
- `useReducedMotion()` or `AccessibilityInfo.isReduceMotionEnabled`: replace springs with 150 ms opacity fades; no parallax, pulse, overscroll stretch, splash scale, tab-pill stretch; the success check and order ring render static; haptics unaffected.
- Reduce Transparency: `GlassSurface` renders `glassSolid` (dark) or `elevated` (light surfaces) with a separator stroke; the header blur disabled.
- Increase Contrast / Bold Text: `labelTertiary` promoted to `labelSecondary`, separators to `separatorOpaque`; do not pass `fontWeight` below 400.
- Touch targets 44 x 44 minimum; focus order follows visual order; `accessibilityViewIsModal` on sheets.
- Colour scheme switches live (no restart).

### 7.5 Performance rules
1. Lists: `FlashList` (`npx expo install @shopify/flash-list`, VERIFY compatibility) for Shop, Search, Favourites, Orders; `FlatList` horizontal for shelves with `initialNumToRender 4`, `getItemLayout` (fixed tile sizes) and `windowSize 5`. No `ScrollView` + `.map` for lists over 12 items.
2. Images: always `expo-image` with `cachePolicy="memory-disk"`, fixed aspect ratios and sizes, `recyclingKey` in recycled lists. Request the smallest next/image width: thumbnails 256, grid and shelf 640, Today card and Product hero 1080 (the URL `w=` param; `q=75`). Prefetch the next shelf's first 4 images on idle; prefetch the Product page hero on press-in.
3. Animation on the UI thread only (reanimated worklets, `useAnimatedScrollHandler`, `useAnimatedStyle`); never `setState` in scroll handlers; no `LayoutAnimation`; animate transform/opacity only (no width/height except the progress fill, which uses `scaleX`-anchored transform).
4. Blur budget: max 2 live `BlurView`/`GlassView` per screen (tab bar + one). No blur inside list items; the tile plus buttons use a solid semi-transparent fill (`rgba(255,255,255,0.78)` light / `rgba(20,31,31,0.78)` dark) instead of blur on Android/old iOS and for any list item (only the Today card info bar may use real glass).
5. Shadows only on 3 floating objects; prefer border/`fill` separation. Set `shouldRasterizeIOS` false (default) and avoid shadows on elements inside scrollers.
6. Memoise: `ProductTile`, `ProductRow`, `SquareTile` with `React.memo` and stable `onPress` via ids; zustand selectors fetch only needed slices (`useCartStore(s => s.lines.length)`).
7. Startup: load only Playfair 700; hydrate stores in parallel; splash readiness waits only for fonts + stores + 7 image prefetches; JS bundle must not import `@stripe/stripe-react-native` outside checkout (lazy `require` on first checkout).
8. Skeletons only where there is real latency (images, Stripe, enquiry submit); no artificial delays except the 800 ms mock for forms.
9. Haptics are fire-and-forget, never awaited. All haptic and Stripe calls are guarded for web.
10. Budget: 60 fps scrolling on iPhone 12-class; Home TTI (after splash exit) < 300 ms; tab switch < 100 ms (screens stay mounted, `lazy: false` for Home and Shop only, others lazy).
11. QA gate before merge: `npx expo lint`, `npx tsc --noEmit`, manual pass in light, dark, AX3 text size, Reduce Motion, Reduce Transparency, VoiceOver on Home, Product, Cart.

---------------------------------------------------------------------------------------------------

## 8. Decision log (for reviewers)
- Native stack headers over custom: delivers authentic large-title collapse and blur for free; cost: per-tab `Stack`.
- Custom JS tab bar over NativeTabs: matches the owner's reference precisely and works everywhere.
- Product is a push, not a sheet: the product page is the conversion screen and needs the full-bleed photo; sheets are reserved for filters, lookup and transient input.
- Search tab replaces the in-screen search fields (v1 had 3); Shop is browse, Search is find.
- Testimonials leave Home; trust claims reduce to one footnote line.
- Gold demoted from button colour to micro-accent; buttons are teal.
- Track screen keeps one teal status card because it is live status data, not decoration.
