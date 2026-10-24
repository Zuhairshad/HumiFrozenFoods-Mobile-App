# Humi's Frozen Foods — Mobile App

A premium shopping app for [Humi's Frozen Foods](https://humisfrozenfoods.com/): browse the frozen snack range (samosas, spring rolls, kebabs, tikki and more), save favourites, build a basket, check out and track an order. It runs on **iOS, Android and the web** from a single codebase.

The look is deliberately sleek: a warm cream canvas, white cards with soft teal shadows, immersive deep-teal hero sections, and gold used sparingly for the one primary action on a screen.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK 58, React Native 0.88, React 19 |
| Language | TypeScript (strict) |
| Routing | Expo Router (file-based, routes live in `src/app/`) |
| State | zustand, persisted to AsyncStorage (cart, favourites, orders) |
| Animation | react-native-reanimated (springs, entering animations) |
| Glass / gradients | expo-blur, expo-linear-gradient |
| Images | expo-image |
| Haptics | expo-haptics (no-op on web) |
| Fonts | Playfair Display (display), Inter (UI) via `@expo-google-fonts` |
| Web | react-native-web |

> Expo changes every SDK. Before using an Expo or React Native API you are unsure about, check <https://docs.expo.dev/versions/v58.0.0/> or <https://docs.expo.dev/llms.txt>. Always install packages with `npx expo install <package>` so versions match the SDK.

## Running the app

```bash
npm install
npx expo start
```

Then in the terminal that opens the dev server:

- press `i` for the iOS Simulator (macOS + Xcode only)
- press `a` for an Android emulator (Android Studio)
- press `w` to open it in the browser
- or scan the QR code with **Expo Go** on a real phone (same Wi-Fi as your computer)

Expo Go notes: Expo Go bundles a fixed set of native modules. Everything this app uses ships inside Expo Go for SDK 58, so no custom build is needed. If you add a library with its own native code, you will need a development build (`npx expo run:ios`, `npx expo run:android`, or `eas build --profile development`). If the QR code does not connect, try `npx expo start --tunnel`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | Start and open on that platform |
| `npm run typecheck` | `tsc --noEmit` (strict TypeScript check) |
| `npm run lint` | `expo lint` (ESLint with the Expo config, see `eslint.config.js`) |
| `npx expo-doctor` | Diagnose dependency / config problems |
| `npx expo install --fix` | Repair package versions that drifted from the SDK |

Run `npm run typecheck` and `npm run lint` before you commit.

## Folder structure

```
assets/                 App icon, splash, Android adaptive icon layers, favicon
src/
  app/                  Routes only (Expo Router). Every file here is a screen.
    _layout.tsx         Root layout: fonts, providers, splash handling
    (tabs)/             Tab group: index (Home), shop, cart, more
    product/[id].tsx    Dynamic route for a product
    checkout.tsx, order-success.tsx, track.tsx, about.tsx, contact.tsx, b2b.tsx, favorites.tsx
  features/             Screen-specific UI, one folder per area (home, shop, product, cart, more)
  components/
    ui/                 Reusable primitives: AppText, Button, Chip, Surface, Screen, Reveal ...
    product/            ProductCard
    brand/              Logo
    navigation/         FloatingTabBar
  data/                 Static content: products, categories, testimonials, hero slides, siteInfo
  store/                zustand stores: cart, favorites, orders
  hooks/                useCart (cart + totals), useHaptics
  lib/                  Pure helpers: format.ts (prices, dates), pricing.ts (totals)
  theme/                Design tokens: colors, typography, layout
  types/                Shared TypeScript types
```

Rules of thumb:

- **Routes stay thin.** A file in `src/app/` should mostly import and render a component from `src/features/...`. Keep non-route code out of `src/app/`.
- **Import with the `@/` alias**, which maps to `src/` (for example `import { colors } from '@/theme'`).
- **Import from barrels** (`@/components/ui`, `@/data`, `@/theme`) rather than deep paths.
- **Never hard-code** colours, font names, spacing or radii. Use the tokens in `@/theme`.

## Design system

All tokens live in `src/theme/` and are re-exported from `@/theme`. The brand colours are sampled from humisfrozenfoods.com; the neutrals are warmed up so the app feels premium rather than clinical.

### Palette

| Token | Hex | Use |
| --- | --- | --- |
| `teal` | `#125B64` | Primary brand colour, primary buttons, links |
| `tealDeep` | `#0D4D4D` | Gradient mid-stop, wordmark, pressed states |
| `tealInk` | `#08302F` | Darkest teal: immersive backgrounds, shadow tint |
| `tealSoft` / `tealMist` | `#E3F0EF` / `#F0F7F6` | Tinted surfaces, selected chips |
| `gold` | `#E5A83B` | The single accent: primary call to action, ratings, highlights |
| `goldDeep` | `#D4A017` | Gold pressed state, gold shadow |
| `goldSoft` | `#FBF1DC` | Soft gold badge backgrounds |
| `red` / `redSoft` | `#C0392B` / `#FBE9E6` | Errors, sale / spicy tags, destructive actions |
| `green` | `#2E9E6B` | Success, halal / vegan markers |
| `cream` | `#FAF7F1` | App background (canvas) |
| `paper` | `#FFFFFF` | Cards and sheets |
| `sand` | `#F1ECE2` | Subtle fills, skeletons |
| `line` | `#E8E2D6` | Hairlines and dividers |
| `ink` | `#10201F` | Primary text |
| `inkSoft` | `#3C4A49` | Secondary text |
| `muted` / `placeholder` | `#7A8685` / `#A3ADAC` | Tertiary text / input placeholders |

Gradients (`gradients` in `@/theme`): `hero` (teal-ink to teal, for hero sections), `gold` (buttons and the logo mark), `scrimTop` / `scrimBottom` (readability scrims over photos), `tealCard`.

### Typography

Display text uses **Playfair Display**; everything functional uses **Inter**. Use the `AppText` component with a `variant` rather than raw `Text`.

| Variant | Font | Size / line height | Use |
| --- | --- | --- | --- |
| `hero` | Playfair 800 | 44 / 48 | Hero headline |
| `h1` | Playfair 700 | 32 / 38 | Screen titles |
| `h2` | Playfair 700 | 24 / 30 | Section titles |
| `h3` | Playfair 700 | 19 / 25 | Card titles |
| `title` | Inter 600 | 16 / 22 | List item titles |
| `body` | Inter 400 | 15 / 23 | Paragraphs |
| `bodyStrong` | Inter 600 | 15 / 23 | Emphasis in body copy |
| `caption` | Inter 400 | 13 / 18 | Secondary info |
| `label` | Inter 600 | 13 / 16 | Buttons, chips |
| `overline` | Inter 700 | 11 / 14, uppercase, tracked | Small section eyebrows |
| `price` | Inter 700 | 17 / 22 | Prices |

### Spacing, radii, shadows

- `spacing`: 4pt scale (`xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 20, `xxl` 24, `xxxl` 32, `huge` 48, `giant` 64). `gutter` (20) is the horizontal screen padding.
- `radii`: `xs` 8, `sm` 12, `md` 16, `lg` 24, `xl` 32, `pill` 999. Prefer large radii and pill buttons.
- `shadows`: `sm`, `md`, `lg` (soft, teal-tinted) and `gold` (for gold buttons).
- `TAB_BAR_CLEARANCE` (112): bottom padding so scroll content clears the floating tab bar.

### Interaction principles

- Spring press-scale on everything tappable (`PressableScale`).
- Staggered fade/slide-in for lists and sections (`Reveal`).
- Haptics on add-to-cart, toggles and tab changes (`haptics` from `@/hooks`).
- Touch targets of at least 44pt. Glassmorphism (`expo-blur`) for floating elements.
- Money is GBP via `formatPrice`. Free delivery over £25, otherwise £3.99. First-order code `HUMI15` gives 15% off.

### Brand assets and the Logo

`src/components/brand/Logo.tsx` draws the mark (a deep-teal rounded square with a gold serif "H") and the "Humi's" wordmark from plain React Native views, so it needs no image or SVG library.

```tsx
import { Logo } from '@/components/brand';

<Logo />                              // full lockup, 40pt mark
<Logo size={28} variant="mark" />     // monogram only
<Logo light />                        // use on teal / dark backgrounds
```

The app icon, splash icon, Android adaptive icon layers and favicon in `assets/` use the same mark (gold H inside a thin ring, topped with three wheat-leaf sprigs, on a teal gradient). Keep the filenames unchanged: `app.json` points at them.

## How to extend

### Add a screen

1. Create the file in `src/app/`. The path is the URL: `src/app/delivery-info.tsx` becomes `/delivery-info`; `src/app/product/[id].tsx` becomes `/product/123`.
2. Keep the route thin and put the UI in `src/features/<area>/`:

   ```tsx
   // src/app/delivery-info.tsx
   import { DeliveryInfoScreen } from '@/features/more/DeliveryInfoScreen';
   export default function Route() {
     return <DeliveryInfoScreen />;
   }
   ```

3. Build the screen with `Screen`, `ScreenHeader` and the `ui` primitives. Pass `tabs` to `Screen` if it lives inside the tab bar so content clears it.
4. Link to it with `router.push('/delivery-info')` from `expo-router`, or `<Link href="/delivery-info">`.
5. To add a new **tab**, add a file to `src/app/(tabs)/`, register it in `(tabs)/_layout.tsx` and add an entry to `FloatingTabBar`.

### Add a product

Products are static data in `src/data/`. Add an object to the `products` array, matching the `Product` type in `src/types`:

1. Give it a unique `id` (used in the URL `/product/<id>`), a `name`, `price` in pounds, a `category` that exists in `categories`, an image URL, a description and any tags.
2. Make sure the `category` id is a valid `CategoryId`; TypeScript will complain if it is not.
3. That is all: the product automatically appears in Shop, search, category filters and related-product lists, because those use helpers such as `getProductsByCategory`, `searchProducts` and `getRelatedProducts`. Mark it as a best seller (see the type) to surface it on Home.

To add a **category**, add it to `categories` and extend the `CategoryId` type in `src/types`.

### Theme and restyle

- Change a colour, font or radius **once** in `src/theme/` and the whole app follows. Do not paste hex codes into components.
- Need a new text style? Add a variant to `textStyles` in `typography.ts` and to the `TextVariant` union.
- Need a new reusable component? Put it in `src/components/ui/`, export it from the barrel `index.ts`, use `StyleSheet.create`, and read all values from `@/theme`.
- Updating the app icon: edit the artwork and re-render the PNGs in `assets/` with the same filenames and sizes (icon 1024x1024 opaque, splash icon 1024x1024 transparent, Android foreground / background / monochrome 432x432 with the glyph inside the central 66% safe zone, favicon 48x48).

### Conventions checklist

- Named exports, function components, `StyleSheet.create`.
- Comments only where the *why* is not obvious.
- `npm run typecheck` and `npm run lint` pass.
- The screen works on iOS, Android and web (guard native-only APIs).

## Linting setup

`eslint.config.js` uses the Expo flat config. If `npm run lint` reports that ESLint is missing, install it with `npx expo install eslint eslint-config-expo -- --save-dev`.
