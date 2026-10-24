# Tech notes (verified 2026-10-24)

Sources: docs.expo.dev v58 pages, installed node_modules (types/builds), npm registry, reactnative.dev 0.87/0.88 posts.
Project: expo ~58.0.19, RN 0.88.0, React 19.3.0, expo-router ~58.0.26, reanimated 4.7.1. Node in sandbox: 22.22.

Note: `src/components/navigation/FloatingTabBar.tsx` already exists (custom JS bar over `expo-router/build/layouts/Tabs`, BlurView). Importing from `expo-router/build/...` is deep and fragile; prefer public `Tabs` + `tabBar` prop (`BottomTabBarProps` type).

## 1. Liquid Glass floating tab bar

### Options
| Option | iOS 26 | iOS <26 | Android | Web | Expo Go |
|---|---|---|---|---|---|
| `expo-router/native-tabs` (`NativeTabs`) | Real UITabBar, system Liquid Glass; bar is system-drawn. `minimizeBehavior` (iOS 26+). `backgroundColor`/`blurEffect`/`shadowColor` ignored on 26 | Classic native UITabBar (blur honoured) | Material 3 NavigationBar | Supported (per docs) | Yes (docs list Expo Go) |
| `expo-glass-effect` (`GlassView`, `GlassContainer`) | Real glass | Falls back to plain `View` | Plain `View` fallback (no glass) | Plain `View` | Yes (iOS, Expo Go listed) |
| `expo-blur` (`BlurView`) | Blur | Blur | Needs `blurMethod` on Android; fallback to solid tint | CSS backdrop-filter | Yes |

- Import is `expo-router/native-tabs`. `expo-router/unstable-native-tabs` is now a `@deprecated` re-export (verified in node_modules `build/unstable-native-tabs.d.ts`). Docs do not label it stable/experimental; only `unstable_nativeProps` is unstable.
- Native tabs is NOT a floating capsule with a custom lighter pill and icons-only look; the system decides geometry. On iOS 26 it is a floating glass bar by system design, but you cannot restyle the pill. Docs do not state a tab-count limit (iOS UITabBar collapses to "More" beyond 5 natively) nor floating-bar customization. Use it only if "native look, zero control" is acceptable.
- Icons: `NativeTabs.Trigger.Icon sf="house" md="home"`. Android `md` icons need optional peer `expo-symbols` (SDK 58 made `expo-symbols` and `@expo/ui` optional peers; rebuild dev builds if added).
- `expo-glass-effect`: `npx expo install expo-glass-effect` (58.0.5). API: `GlassView` props `glassEffectStyle` ('clear'|'regular'|'none' or `{style, animate, animationDuration}`), `colorScheme`, `isInteractive`, `tintColor`; `GlassContainer spacing`; `isLiquidGlassAvailable()` (system + compiler + Info.plist `UIDesignRequiresCompatibility` check; can be true even if user enabled Reduce Transparency, so also check `AccessibilityInfo.isReduceTransparencyEnabled()`); `isGlassEffectAPIAvailable()` (iOS only; some iOS 26 betas crash). Do not set opacity < 1 on GlassView or parents (glass vanishes); animate a wrapper instead.
- Expo Go caveat: Expo Go on a device running iOS 26 should show glass; the app's own `UIDesignRequiresCompatibility` is irrelevant in Expo Go. Confirm on device.

### Recommendation: custom JS floating bar, graceful degradation
Use `Tabs` from `expo-router` with `tabBar={(p) => <FloatingBar {...p}/>}`, `position:'absolute'`, safe-area bottom inset, 5 tabs, icons only (add `accessibilityLabel`).
Layers (pick at runtime):
```tsx
import { Platform, AccessibilityInfo } from 'react-native';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';

const glass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
// iOS 26: <GlassView glassEffectStyle="regular" isInteractive style={capsule}/> behind icons;
//         active pill = second <GlassView glassEffectStyle="clear" tintColor="rgba(255,255,255,.25)"/> (animate translateX with reanimated, not opacity)
// iOS <26 / web: <BlurView intensity={60} tint="systemChromeMaterialDark"/> + translucent white pill (rgba(255,255,255,.18))
// Android: solid rgba teal background + elevation (BlurView on Android is experimental; skip it)
```
`isGlassEffectAPIAvailable` is iOS-only and exists as a stub on other platforms (build/*.js non-ios files exist), but guard with `Platform.OS` anyway. Wrap several GlassViews in one `GlassContainer` so they merge. Sliding pill: reanimated `withSpring` on `translateX` (existing bar already does this).
Do not use `StyleSheet.absoluteFill` on GlassView parents with opacity animations. Pad screen content by bar height + inset.

## 2. Stripe

- Bundled (expo install) version for SDK 58: `@stripe/stripe-react-native 0.81.0` (`node_modules/expo/bundledNativeModules.json`). npm latest is 0.83.0; peers: expo >=46.0.9, react *, react-native *, react-native-webview * (optional). Stay on the SDK-pinned one.
  `npx expo install @stripe/stripe-react-native`
- Expo Go: docs say the library is "included in Expo Go", but Apple Pay and Google Pay are NOT supported there. Use a dev build for wallets: `npx expo install expo-dev-client` then `bunx/npx eas-cli build --profile development --platform ios|android` (or `npx expo run:ios`).
- Config plugin (verified in package `src/plugin/withStripe.ts`): options are `merchantIdentifier` (string | string[], iOS), `enableGooglePay` (boolean, Android, default false), plus `includeOnramp`, `disableSPM`. There is NO `urlScheme` plugin option: pass `urlScheme` to `StripeProvider` (use `Linking.createURL('stripe-redirect')`; the app scheme is `humi`).
```json
["@stripe/stripe-react-native", { "merchantIdentifier": "merchant.com.humisfrozenfoods.app", "enableGooglePay": true }]
```
- Flow (mobile):
```tsx
<StripeProvider publishableKey={PK} merchantIdentifier="merchant.com.humisfrozenfoods.app" urlScheme="humi">
const { initPaymentSheet, presentPaymentSheet } = useStripe();
const { clientSecret, ephemeralKey, customer } = await api.post('/payments/intent', { orderId }); // server creates PI
await initPaymentSheet({
  merchantDisplayName: "Humi's Frozen Foods",
  paymentIntentClientSecret: clientSecret,
  applePay: { merchantCountryCode: 'GB' },
  googlePay: { merchantCountryCode: 'GB', currencyCode: 'GBP', testEnv: __DEV__ },
  returnURL: Linking.createURL('stripe-redirect'),
  allowsDelayedPaymentMethods: false,
});
const { error } = await presentPaymentSheet(); // error.code === 'Canceled' => user cancelled
```
  Never mark orders paid on client success; wait for the webhook.
- Apple Pay: Apple Developer merchant ID + payment processing certificate uploaded in Stripe dashboard, plugin `merchantIdentifier`, rebuild. Google Pay: `enableGooglePay`, Google Pay business profile for production, test with `testEnv`.
- Web: no RN SDK on react-native-web. Create `payments.web.tsx` with a stub ("Payments are available in the mobile app") or Stripe.js `@stripe/react-stripe-js` Elements. Use platform-extension files (`.native.tsx`/`.web.tsx`) so the web bundle never imports `@stripe/stripe-react-native`. Recommend the stub for v1.
- Server (`stripe` 23.0.1, Node >=20):
```ts
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const pi = await stripe.paymentIntents.create(
  { amount: totalPence /* integer */, currency: 'gbp', automatic_payment_methods: { enabled: true },
    metadata: { orderId } },
  { idempotencyKey: `order-${orderId}-pi` });   // stable per order
// webhook (Hono): raw body is mandatory
const raw = await c.req.text();
const event = stripe.webhooks.constructEvent(raw, c.req.header('stripe-signature')!, process.env.STRIPE_WEBHOOK_SECRET!);
// Vercel/fetch runtimes: use `await stripe.webhooks.constructEventAsync(...)` if SubtleCrypto is required.
```
  Handle: `payment_intent.succeeded` (mark paid), `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.processing`, `payment_intent.amount_capturable_updated` (only with manual capture), `charge.refunded`. Dedupe by `event.id` (store in Mongo with unique index), return 2xx fast. Stripe docs: https://docs.stripe.com/webhooks/signature (secret for `stripe listen` differs from dashboard endpoint).
  Docs: https://docs.expo.dev/versions/v58.0.0/sdk/stripe/

## 3. Splash (native then animated brand splash)
Docs: https://docs.expo.dev/versions/v58.0.0/sdk/splash-screen/ . API in SDK 58: `SplashScreen.preventAutoHideAsync()` (module scope), `SplashScreen.hide()` (sync; `hideAsync` kept), `SplashScreen.setOptions({ duration, fade })` (fade iOS only). Config plugin already in app.json (teal `#08302F`, image). Expo Go shows app icon, not the config splash; test in a release/dev build.
Pattern (root `src/app/_layout.tsx`):
```tsx
SplashScreen.preventAutoHideAsync();           // module scope
export default function Root() {
  const [fontsLoaded] = useFonts({...});
  const [done, setDone] = useState(false);
  const op = useSharedValue(1);
  const onLayout = useCallback(() => { SplashScreen.hide(); }, []); // hide native once JS splash has laid out
  // render <Stack/> underneath, and above it an absolute <Animated.View style={[{...absoluteFill (StyleSheet.absoluteFill), backgroundColor:'#08302F'}, fade]} onLayout={onLayout}>
  // after min 3000ms AND fontsLoaded AND prefetch settled: op.value = withTiming(0,{duration:500}, f => f && runOnJS(setDone)(true)); unmount when done
}
```
Rules: make the in-app splash use the same background colour and logo size/position as the native one (imageWidth 200 contain, centered) so the handoff is invisible; only call `hide()` after the overlay has rendered (`onLayout`) to avoid flicker; keep the Stack mounted beneath so the first screen is ready on cross-fade; run prefetch (`Promise.allSettled([fonts, products, cart rehydrate])`) in parallel with the minimum timer (`Promise.all([minTimer, prefetch])`) with a timeout cap. Do not return `null` while loading (causes blank flash). On web, skip the native part (no native splash) and render the overlay only.

## 4. Apple-like building blocks (SDK 58)
- Large title / search / sheets: `headerLargeTitleEnabled` (new) and `headerLargeTitle` (deprecated alias), `headerLargeTitleShadowVisible`, `headerLargeTitleStyle`, `headerSearchBarOptions`, `presentation: 'formSheet'`, `sheetAllowedDetents: number[] | 'fitToContents'`, `sheetGrabberVisible`, `sheetCornerRadius`, `sheetInitialDetentIndex` (all verified in `expo-router/build/react-navigation/native-stack/types.d.ts`; formSheet falls back to modal on Android). New composition API: `<Stack.Title large>`, `<Stack.SearchBar placeholder onChangeText/>`, `<Stack.Toolbar placement="left|right|bottom">` (+ `Stack.Toolbar.SearchBarSlot`), `<Stack.Header blurEffect style/>`. Docs: https://docs.expo.dev/versions/v58.0.0/sdk/router/stack/
  Example: `<Stack.Screen name="filters" options={{ presentation:'formSheet', sheetAllowedDetents:[0.5,1], sheetGrabberVisible:true }}/>`
- SDK 58 iOS 26+: Stack header is transparent with Liquid Glass by default; content slides under it, so add `contentInsetAdjustmentBehavior="automatic"` to ScrollViews; header fonts become system on iOS 26 (set `fontFamily` in title style to keep Playfair/Inter). Migration: https://docs.expo.dev/router/migrate/sdk-57-to-58/
- `expo-symbols` 58.0.4: SF Symbols on iOS; Material Symbols on Android/web via `name={{ ios:'house', android:'home', web:'home' }}`; a plain string renders only on iOS. In Expo Go. Ionicons (already used) remain the safest single-set cross-platform icon; use SymbolView on iOS with an Ionicons `fallback`.
- `expo-haptics` ~58.0.7 already installed (iOS taptic; Android vibration; no-op web).
- Fonts: custom brand fonts (Playfair, Inter) are in use; for system look use `fontFamily: 'System'` (RN maps to SF on iOS, Roboto on Android). I did not verify `ui-sans-serif` in docs; on web use `system-ui` stack via `Platform.select`.
- `@expo/ui` ~58.0.23: docs say included in Expo Go; every component must be inside `Host`; `@expo/ui/swift-ui` Apple only, `jetpack-compose` Android, plus cross-platform "universal" components (BottomSheet, Button, Switch, Picker, TextInput...). Docs do not label stability; treat as optional, needs peer `react-native-worklets` (already installed). Not needed for this app.

## 5. SDK 58 / RN 0.87-0.88 gotchas
- `StyleSheet.absoluteFillObject` is gone (only `absoluteFill` exported in 0.88 StyleSheetExports.js). Repo already uses `absoluteFill` (grep clean).
- RN 0.87: strict TS API default (deep imports like `react-native/Libraries/*` are type errors; e.g. `expo-router/build/...` imports are not RN but also fragile); `*Properties` aliases removed; `InteractionManager` removed (use `requestIdleCallback`); `Modal animated` prop removed; `StatusBar` `backgroundColor`/`translucent` removed (use expo-status-bar); `useColorScheme()` may return null; `keyboardShouldPersistTaps` booleans removed (`'always'|'never'|'handled'`); `ImageBackground` deprecated (use absolute `Image`); `Touchable` export removed; Node >= 22.13.
- RN 0.88: no breaking changes; iOS RTL textAlign default changed; `InputAccessoryView` deprecated; radial gradient percentages rejected; `backgroundSize/Position/Repeat` now unprefixed.
- Expo Router 58: `initialRouteName` removed (use `unstable_settings.anchor`); Tabs/Drawer show only declared screens (use `options={{ href:null }}` to hide); `freezeOnBlur` no-op; module-level `router` throws before first render (do not call `router.replace` at module scope/before layout mount); `useNavigation` throws outside navigator; Stack `contentInsetAdjustmentBehavior` for transparent headers; `web.output: "server"` now SSR per request (this app uses `single`, unaffected); layout `Screen` no `redirect`/`initialParams`.
- Splash: `hideAsync` still works but `hide()` preferred; Expo Go does not render config splash.
- UIScene lifecycle required when building with Xcode 27 (handled by CNG/EAS; don't hand-edit native dirs).

## 6. Backend
Latest registry versions (2026-10-24): hono 4.13.13, zod 4.6.7, mongodb 7.7.0 (Node >=20.19), stripe 23.0.1, pino 10.4.0, vitest 5.0.5 (Node ^22.12 / 24 / >=26), supertest 7.3.1, @hono/node-server 2.1.5, @hono/zod-validator 0.9.1, mongodb-memory-server 11.3.0, @vercel/functions 3.10.3, typescript 7.0.2 (the app is on ~6.0.3; keep 6.x until tooling confirmed).
- Vercel: Hono app as `export default app` in `index.ts` or `src/index.ts`, zero config (https://vercel.com/docs/frameworks/backend/hono). Use Node runtime (Stripe + Mongo drivers need Node).
- Mongo on serverless: module-scope singleton `const client = new MongoClient(uri, { maxPoolSize: 5, maxIdleTimeMS: 60000 })` (MongoClient auto-connects since v6+, no need to cache a connect promise); additionally call `attachDatabasePool(client)` from `@vercel/functions` (marked @experimental in its types) so Vercel Fluid compute closes idle connections before suspending. Atlas IP allowlist must allow Vercel (0.0.0.0/0 + strong creds, or Vercel Secure Compute/integration).
- Tests: use `app.request('/path', init)` (Hono built-in; no supertest needed) with vitest. Pino: pino-pretty only in dev; log to stdout.
- mongodb-memory-server TEST RESULT: `npm i -D mongodb-memory-server` WORKS in this sandbox: install took ~11 s (postinstall fetched the mongod binary into `node_modules/.cache/mongodb-memory-server`) and `MongoMemoryServer.create()` returned a URI in <1 s (`mongodb://127.0.0.1:<port>/`). So in-memory Mongo integration tests are viable here and in CI. Still define a repository interface (`OrderRepo`, `ProductRepo`) with an in-memory fake for fast unit tests, and use mongodb-memory-server for a thin integration suite (indexes, unique webhook event ids, transactions need `MongoMemoryReplSet`).
- Money: integers in pence everywhere; zod `z.number().int().nonnegative()`.

## Decisions
1. Tabs: custom JS floating bar via `Tabs` + `tabBar`, with `expo-glass-effect` on iOS 26, `expo-blur` below, solid teal on Android; do not use NativeTabs (no pill control).
2. Gate glass on `Platform.OS==='ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()` and respect Reduce Transparency.
3. Stripe: `@stripe/stripe-react-native` 0.81.0 via `npx expo install`; plugin `merchantIdentifier` + `enableGooglePay`; `urlScheme` on StripeProvider.
4. Development build (`eas build --profile development`) required for Apple/Google Pay; Expo Go OK for card PaymentSheet.
5. Web checkout: `.web.tsx` stub ("use the mobile app"); Stripe.js later.
6. Server: Hono 4 + zod 4 + mongodb 7 + stripe 23 + pino 10 + vitest 5, `app.request` for HTTP tests, pence integers, idempotency keys, raw-body webhook verification, event-id dedupe.
7. Splash: native splash held by `preventAutoHideAsync`, `hide()` on overlay `onLayout`, Reanimated fade after min 3 s and prefetch.
8. UI: native Stack large titles, `formSheet` with detents, SymbolView on iOS with Ionicons fallback, expo-haptics; skip `@expo/ui`.
9. Fix for 58: keep `absoluteFill`, add `contentInsetAdjustmentBehavior="automatic"` under transparent iOS 26 headers, set header `fontFamily`.
10. Tests: repository interface + in-memory fake for unit tests; mongodb-memory-server (works here) for integration.
