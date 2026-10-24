# Humi's Frozen Foods — Mobile App Architecture & Contract

Expo SDK 58 · React Native 0.88 · React 19 · TypeScript (strict) · Expo Router (routes in `src/app/`) · zustand · reanimated.

**Rules for every contributor (human or agent)**
1. Expo changes every SDK. Before using any Expo/RN API you are unsure of, check `https://docs.expo.dev/versions/v58.0.0/` or `https://docs.expo.dev/llms.txt`. Install packages only with `npx expo install <pkg>`.
2. Only create/edit files you **own** (see ownership map). If you need something from another module, import it per the contract below; do not reimplement it.
3. Never hard-code colors, font names, spacing or radii. Import from `@/theme`. Path alias `@/*` → `src/*`.
4. Code must pass `npx tsc --noEmit` for the files you own. Run it. Also fix lint you introduce (`npx expo lint`).
5. Match the surrounding code: named exports, function components, `StyleSheet.create`, no inline magic numbers when a token exists. Comments only where the *why* is non-obvious.
6. Do not touch `package.json` dependencies beyond installing a package you truly need (tell the lead in your final report).

## Brand & design direction
Brand colors come from humisfrozenfoods.com: deep teal `#125B64`/`#0D4D4D`, gold `#E5A83B`/`#D4A017`, red accent `#C0392B`. Tokens live in `src/theme`.
The live site is plain; the app must feel **premium, sleek, modern** — think Apple/Airbnb-grade polish:
- Warm cream (`colors.cream`) canvas, white (`paper`) cards with soft teal-tinted shadows, generous whitespace.
- Immersive deep-teal gradient hero sections, gold used sparingly as the single "action/accent" colour.
- Playfair Display for display text, Inter for UI text (`AppText` variants).
- Large radii (16–32), pill buttons, glassmorphism (expo-blur) on floating elements (tab bar, sticky bars).
- Motion: spring press-scale on every tappable, staggered fade/slide-in on lists (reanimated `entering`), parallax/scroll-driven headers where it helps. Haptics (`expo-haptics`) on add-to-cart, toggles, tab changes. Respect reduced motion where cheap.
- Touch targets ≥ 44pt. Support iOS + Android + web (`react-native-web`) without crashing (guard haptics/blur if needed).
- Currency GBP via `formatPrice`. Free delivery over £25, otherwise £3.99. First-order promo code `HUMI15` = 15% off.

## Folder map & ownership
```
src/
  theme/            [lead, DONE]   colors, typography, layout, index
  types/            [lead, DONE]   shared TS types
  components/ui/    [agent: ui]        primitives (see contract)
  components/product/ [agent: ui]      ProductCard
  components/brand/ [agent: brand]     Logo, Wordmark
  components/navigation/ [agent: shell] FloatingTabBar
  data/             [agent: data]      products, categories, testimonials, hero slides, site info
  store/            [agent: state]     cart, favorites, orders (zustand + AsyncStorage persist)
  hooks/            [agent: state]     useCart, useHaptics
  lib/              [agent: state]     format.ts, pricing.ts
  app/_layout.tsx, app/(tabs)/_layout.tsx, app/+not-found.tsx [agent: shell]
  app/(tabs)/index.tsx   + src/features/home/*      [agent: home]
  app/(tabs)/shop.tsx    + src/features/shop/*      [agent: shop]
  app/product/[id].tsx   + src/features/product/*   [agent: product]
  app/(tabs)/cart.tsx, app/checkout.tsx, app/order-success.tsx + src/features/cart/* [agent: cart]
  app/(tabs)/more.tsx, app/track.tsx, app/about.tsx, app/contact.tsx, app/b2b.tsx, app/favorites.tsx
        + src/features/more/*                       [agent: more]
assets/, app.json, README.md, babel/metro config      [agent: brand / shell as noted]
```
Tabs (in order): **Home** (`index`), **Shop** (`shop`), **Cart** (`cart`), **More** (`more`).

## Contract: `@/data` (agent: data)
```ts
export const categories: Category[];
export const products: Product[];            // ≥ 18 real products from the website
export const testimonials: Testimonial[];
export const heroSlides: HeroSlide[];        // 4 slides: Meat Spring Rolls, Chicken Samosa, Chapli Kebabs, Aloo Tikki
export const siteInfo: { name; tagline; phone; email; address; hours; social: {instagram; facebook; tiktok}; freeDeliveryThreshold: number; deliveryFee: number; promoCode: string; promoPercent: number };
export function getProduct(id: string): Product | undefined;
export function getProductsByCategory(id: CategoryId): Product[];
export function searchProducts(query: string): Product[];
export function getBestSellers(limit?: number): Product[];
export function getRelatedProducts(id: string, limit?: number): Product[];
```
Barrel: `src/data/index.ts`.

## Contract: `@/lib` (agent: state)
```ts
// lib/format.ts
export function formatPrice(n: number): string;            // 9.5 -> "£9.50"
export function formatDate(iso: string): string;           // "24 Oct 2026"
// lib/pricing.ts
export function computeTotals(lines: {price:number; quantity:number}[], opts?: {promoApplied?: boolean}): { subtotal; delivery; discount; total; freeDeliveryRemaining };
```

## Contract: `@/store` & `@/hooks` (agent: state)
```ts
// store/favorites.ts
export const useFavoritesStore: UseBoundStore<{ ids: string[]; toggle(id: string): void; has(id: string): boolean }>;
// store/orders.ts
export const useOrdersStore: { orders: Order[]; addOrder(o: Order): void; getOrder(id: string): Order | undefined; clear(): void };
// store/cart.ts  (persisted)
export const useCartStore: { lines: CartLine[]; promoApplied: boolean; add(productId, qty?): void; setQty(productId, qty): void; remove(productId): void; clear(): void; applyPromo(code: string): boolean; removePromo(): void };
// hooks/useCart.ts
export function useCart(): {
  lines: (CartLine & { product: Product })[];
  count: number;                      // total units
  subtotal; delivery; discount; total; freeDeliveryRemaining: number;
  promoApplied: boolean;
  add(productId: string, qty?: number): void; setQty(...): void; remove(...): void; clear(): void;
  applyPromo(code: string): boolean; removePromo(): void;
  quantityOf(productId: string): number;
};
// hooks/useHaptics.ts
export const haptics: { light(); medium(); success(); selection() };  // no-ops on web
```

## Contract: `@/components/ui` (agent: ui) — barrel `src/components/ui/index.ts`
```ts
AppText({ variant?: TextVariant; color?: ColorName | string; align?; ...TextProps })
Button({ title; onPress; variant?: 'primary'|'gold'|'outline'|'ghost'|'light'; size?: 'sm'|'md'|'lg'; icon?: IoniconName; iconRight?: IoniconName; loading?; disabled?; fullWidth?; style? })
IconButton({ icon: IoniconName; onPress; variant?: 'solid'|'glass'|'plain'|'gold'|'dark'; size?: number; badge?: number; accessibilityLabel })
PressableScale({ onPress?; children; style?; haptic?: boolean; scaleTo?: number; disabled?; accessibilityLabel? })
Chip({ label; selected?; onPress?; icon?: IoniconName })
Badge({ label; tone?: 'gold'|'teal'|'red'|'green'|'glass'|'sand'; icon?: IoniconName; size?: 'sm'|'md' })
Surface({ children; tone?: 'paper'|'glass'|'teal'|'sand'|'dark'; padded?: boolean|number; radius?: keyof typeof radii; shadow?: 'sm'|'md'|'lg'|false; style? })
SectionHeader({ overline?; title; actionLabel?; onAction?; align?: 'left'|'center'; light?: boolean })
QuantityStepper({ value; onChange(n); min?; max?; size?: 'sm'|'md' })
Price({ value; size?: 'sm'|'md'|'lg'; compareAt?: number; color? })
Rating({ value; count?; size? })
Divider({ inset?; light? })
Skeleton({ width; height; radius? })
EmptyState({ icon: IoniconName; title; message?; actionLabel?; onAction? })
Screen({ children; scroll?: boolean; bg?: string; edges?: ('top'|'bottom')[]; contentContainerStyle?; refreshControl?; onScroll? ; footer?: ReactNode })  // handles safe area, bottom tab clearance when `tabs` prop true
ScreenHeader({ title; subtitle?; onBack?; right?: ReactNode; transparent?; light? })
Reveal({ children; delay?: number; from?: 'bottom'|'left'|'right'|'none'; style? })   // reanimated entering animation
FadeImage({ uri; style; contentFit?; transition? })    // expo-image wrapper with blurhash-less fade + placeholder colour
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
// components/product/ProductCard.tsx
ProductCard({ product: Product; variant?: 'grid'|'featured'|'row'; index?: number })  // navigates to /product/[id], add-to-cart + favourite built in
```

## Contract: `@/components/brand` (agent: brand)
```ts
Logo({ size?: number; variant?: 'full'|'mark'; light?: boolean })   // drawn with RN views/SVG-free, teal+gold "H" mark + wordmark "Humi's"
```

## Contract: `@/components/navigation` (agent: shell)
`FloatingTabBar` (BlurView pill, animated indicator, cart badge from `useCart().count`) used via `tabBar` prop in `(tabs)/_layout.tsx`.

## Navigation map
`/(tabs)/index` Home · `/(tabs)/shop` Shop (accepts `?category=<CategoryId>` and `?q=`) · `/(tabs)/cart` · `/(tabs)/more`
`/product/[id]` · `/checkout` · `/order-success?id=` · `/track` · `/about` · `/contact` · `/b2b` · `/favorites`
Navigate with `router.push('/product/' + id)` etc. from `expo-router`.
