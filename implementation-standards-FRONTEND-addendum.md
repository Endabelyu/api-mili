# Frontend — Implementation Standards Addendum
**Missing Pieces | MAANG-Grade Completeness | 2025**

> Supplements: `implementation-standards-FRONTEND.md`
> Sources: Redux Toolkit Docs, Zustand Docs, React Hook Form Docs, TanStack Query Docs, MDN (Memory Management), Next.js Docs (Hydration), IAB TCF 2.2, GDPR Recital 32, Web Animations API spec, Webpack/Vite Docs, Module Federation RFC

---

## How to Use This Document

Each item is labeled:
- 🔴 **Must** — non-negotiable, blocks production
- 🟡 **Should** — strongly recommended, skipping creates known risk
- 🟢 **Can** — good practice, implement when applicable

---

# 13. STATE MANAGEMENT STANDARDS

## 13.1 Choosing the Right Tool

| State Type | Correct Tool | Wrong Tool |
|---|---|---|
| Server data (fetched, cached) | React Query / SWR | Redux, Zustand |
| Global UI state (modals, theme, auth) | Zustand | React Context |
| Complex domain state with actions/history | Redux Toolkit | useState |
| Local component state | useState / useReducer | Any global store |
| Form state | React Hook Form | useState, Redux |
| URL-derived state | useSearchParams / router | useState |

- 🔴 Server state and client state are managed separately — React Query/SWR owns server data, Zustand/Redux owns UI state. Mixing them creates stale data bugs.
- 🔴 React Context is NOT a state management tool — use it for stable values only (theme, locale, auth user object). Never put frequently-changing values in Context (causes full subtree re-renders).
- 🔴 A global store chosen per project — Zustand for most apps, Redux Toolkit only when: time-travel debugging is required, the team is >10 FE engineers, or middleware (sagas, epics) is genuinely needed.

## 13.2 Zustand Standards (Default Choice)

```typescript
// ✅ CORRECT — slice pattern, actions co-located with state
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  // Actions are part of the interface
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        isAuthenticated: false,
        setUser: (user) => set({ user, isAuthenticated: true }, false, 'auth/setUser'),
        logout: () => set({ user: null, isAuthenticated: false }, false, 'auth/logout'),
      }),
      { name: 'auth-storage', partialize: (s) => ({ user: s.user }) }
    ),
    { name: 'AuthStore' }
  )
);
```

- 🔴 Action names passed as third argument to `set()` — required for devtools tracing.
- 🔴 `partialize` used when persisting — never persist derived or transient state.
- 🔴 One store per domain — `useAuthStore`, `useCartStore`, `useUIStore`. Never one mega-store.
- 🟡 `devtools` middleware enabled in development builds only (`process.env.NODE_ENV !== 'production'`).
- 🟡 Selectors memoized with `useShallow` for object/array selections — prevents unnecessary re-renders.

## 13.3 Redux Toolkit Standards (When Justified)

- 🔴 `@reduxjs/toolkit` only — never plain Redux. RTK eliminates the boilerplate that makes Redux painful.
- 🔴 `createSlice` for all reducers — no hand-written action creators.
- 🔴 `createEntityAdapter` for normalized collections (user lists, product catalogs).
- 🔴 `createAsyncThunk` for async operations — NOT raw dispatch in components.
- 🔴 RTK Query used instead of `createAsyncThunk` + manual caching for any data fetching — it IS React Query built into RTK.
- 🟡 Selectors defined with `createSelector` (Reselect) — never derive data inside components directly from raw store shape.
- 🟡 Redux DevTools Extension enabled in development.

---

# 14. FORM HANDLING STANDARDS

## 14.1 React Hook Form + Zod (Required Pattern)

- 🔴 React Hook Form (RHF) used for all forms — not controlled inputs with useState. RHF is uncontrolled by default, which means fewer re-renders and better INP scores.
- 🔴 Zod schema defined for every form — single source of truth for validation rules, TypeScript types, and error messages.
- 🔴 `zodResolver` connects schema to RHF — runtime validation matches TypeScript types.

```typescript
// ✅ The required pattern — schema, types, and form in one
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>; // Types derived from schema, not duplicated

function LoginForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    // data is already validated and typed — safe to send to API
    await loginMutation.mutateAsync(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} aria-invalid={!!errors.email} />
      {errors.email && <span role="alert">{errors.email.message}</span>}
      <button type="submit" disabled={isSubmitting}>Login</button>
    </form>
  );
}
```

## 14.2 Form Standards

- 🔴 `defaultValues` always provided — RHF requires them for correct diff tracking and reset behavior.
- 🔴 `isSubmitting` state disables the submit button — prevents double submission.
- 🔴 `aria-invalid` and `role="alert"` on error messages — screen reader accessible.
- 🔴 Server-side validation errors mapped back to form fields with `setError()` — not shown as a toast only.
- 🟡 `mode: 'onBlur'` for validation trigger — validates when user leaves a field, not on every keystroke.
- 🟡 `useFormContext` for deeply nested field components — avoids prop drilling.
- 🟡 Multi-step forms use a single RHF instance with `trigger()` per step — not multiple forms.
- 🟢 `useFieldArray` for dynamic field lists — not manually managed arrays in state.

---

# 15. API CLIENT STANDARDS

## 15.1 Axios Configuration

- 🔴 A single Axios instance created per API — not `axios.get(...)` directly throughout the codebase.
- 🔴 Request interceptor attaches auth token — not manually added per request.
- 🔴 Response interceptor handles 401 — triggers token refresh and retries the original request once.
- 🔴 Response interceptor handles all error shapes — normalizes to a consistent error type before throwing.

```typescript
// ✅ Required pattern — single instance with interceptors
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10_000, // 🔴 Always set a timeout — never let requests hang
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach token
apiClient.interceptors.request.use((config) => {
  const token = tokenService.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401, normalize errors
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?._retry) {
      // Queue requests while refreshing
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then((token) => { error.config!.headers.Authorization = `Bearer ${token}`; return apiClient(error.config!); });
      }
      error.config!._retry = true;
      isRefreshing = true;
      try {
        const newToken = await tokenService.refresh();
        failedQueue.forEach(({ resolve }) => resolve(newToken));
        failedQueue = [];
        return apiClient(error.config!);
      } catch (refreshError) {
        failedQueue.forEach(({ reject }) => reject(refreshError));
        failedQueue = [];
        tokenService.logout();
        throw refreshError;
      } finally {
        isRefreshing = false;
      }
    }
    throw normalizeApiError(error); // Always throw a consistent AppError type
  }
);
```

## 15.2 React Query Configuration

- 🔴 A single `QueryClient` instance configured at the app root with sensible global defaults.
- 🔴 `staleTime` set globally — default is `0` (always stale), which causes excessive refetching. Set based on your data freshness requirements.
- 🔴 `retry` configured — default 3 retries is too aggressive for user-visible errors (400s should never retry).

```typescript
// ✅ Required global QueryClient config
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // Data considered fresh for 60s — tune per domain
      gcTime: 5 * 60_000,         // Keep unused cache for 5 min
      retry: (failureCount, error) => {
        // 🔴 Never retry client errors — only transient server/network errors
        if (error instanceof AppError && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true, // Re-validate when user returns to tab
    },
    mutations: {
      retry: false, // 🔴 Never auto-retry mutations — side effects may duplicate
    },
  },
});
```

- 🔴 Query keys are structured arrays, not strings — `['users', userId]` not `'users/${userId}'`. Enables precise cache invalidation.
- 🔴 Query key factory per domain exported from a central file — prevents key typos and enables consistent invalidation.
- 🟡 `useMutation` `onSuccess` invalidates related queries — `queryClient.invalidateQueries({ queryKey: ['users'] })`.
- 🟡 `select` option on `useQuery` transforms/selects data before returning to component — keeps components free of data transformation logic.
- 🟡 `placeholderData: keepPreviousData` on paginated queries — prevents loading flicker on page change.
- 🟢 Optimistic updates via `onMutate` for latency-sensitive interactions (like/unlike, checkbox toggles).

## 15.3 Request Deduplication

- 🔴 React Query deduplicates in-flight requests for the same key automatically — never work around this by adding timestamps to query keys unless you explicitly want to bypass deduplication.
- 🟡 Dependent queries use `enabled` option — `enabled: !!userId` — not conditional hook calls.

---

# 16. MEMORY LEAK PREVENTION

- 🔴 Every `useEffect` that sets up a subscription, event listener, interval, or timer returns a cleanup function.

```typescript
// ✅ Required pattern — always clean up
useEffect(() => {
  const controller = new AbortController();

  fetchData({ signal: controller.signal })
    .then(setData)
    .catch((err) => { if (err.name !== 'AbortError') setError(err); });

  return () => controller.abort(); // Cancels in-flight request on unmount
}, [userId]);

useEffect(() => {
  const subscription = eventBus.subscribe('user:updated', handleUpdate);
  return () => subscription.unsubscribe(); // Always unsubscribe
}, []);

useEffect(() => {
  const id = setInterval(pollStatus, 5000);
  return () => clearInterval(id); // Always clear interval
}, []);
```

- 🔴 WebSocket connections closed on unmount — `return () => ws.close()`.
- 🔴 `ResizeObserver`, `IntersectionObserver`, `MutationObserver` disconnected on unmount — `return () => observer.disconnect()`.
- 🔴 Event listeners on `window` or `document` removed on unmount — `return () => window.removeEventListener(...)`.
- 🟡 `react-hooks/exhaustive-deps` ESLint rule enforced — catches missing dependencies that cause stale closures and incorrect cleanups.
- 🟡 `AbortController` used for fetch/axios requests in `useEffect` — prevents state updates on unmounted components.

---

# 17. HYDRATION MISMATCH PREVENTION (SSR/CSR)

Hydration mismatches occur when the HTML rendered on the server differs from what React renders on the client. They silently corrupt state and can cause subtle bugs in production.

- 🔴 No `typeof window !== 'undefined'` checks inside render — move to `useEffect` or use `useMounted()` hook.
- 🔴 No `Math.random()`, `Date.now()`, or `new Date()` in render without stable seeds — they produce different values on server vs client.
- 🔴 No direct access to `localStorage`, `sessionStorage`, `navigator`, or `document` in render path.
- 🔴 `suppressHydrationWarning` is a last resort, not a fix — only valid for intentionally different content (e.g. browser-only timestamps). Document why it is used.

```typescript
// ✅ Required pattern for browser-only values
function ClientOnlyComponent() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  if (!isMounted) return null; // Render nothing on server — avoids mismatch
  return <div>{localStorage.getItem('theme')}</div>;
}

// ✅ For Next.js — use dynamic with ssr: false
const BrowserOnlyWidget = dynamic(() => import('./BrowserOnlyWidget'), { ssr: false });
```

- 🟡 Date/time displayed to users formatted with `Intl.DateTimeFormat` inside `useEffect` or a client component — server renders a stable placeholder, client hydrates with the locale-formatted value.
- 🟡 `next/dynamic` with `ssr: false` for any component that reads browser APIs — maps, rich text editors, drag-and-drop.

---

# 18. CONSENT MANAGEMENT (GDPR / CCPA)

- 🔴 No analytics, tracking pixels, or non-essential cookies fire before user consent is granted — violates GDPR Article 7 and incurs fines.
- 🔴 Consent Management Platform (CMP) implemented — Cookiebot, OneTrust, or an IAB TCF 2.2-compliant custom implementation.
- 🔴 Consent state persists across sessions — user should not be re-asked on every visit.
- 🔴 Consent is granular — analytics, marketing, and functional categories offered separately. A single "accept all" option is acceptable only if "reject all" is equally prominent.
- 🔴 Analytics initialization is gated behind consent:

```typescript
// ✅ Required pattern — analytics only load after consent
function ConsentGate({ children }: { children: React.ReactNode }) {
  const { consent } = useConsentStore();

  useEffect(() => {
    if (consent.analytics) {
      // Initialize GA4, Mixpanel, etc. only now
      initializeAnalytics();
    }
    if (consent.marketing) {
      initializeMarketingPixels();
    }
  }, [consent.analytics, consent.marketing]);

  return <>{children}</>;
}
```

- 🔴 Consent withdrawal removes cookies and stops tracking — not just stops future events.
- 🟡 Consent banner does not use dark patterns — "accept" and "reject" must be equally prominent and easy to find.
- 🟡 Consent record stored server-side — timestamp, IP (hashed), and consent version logged for compliance audit.
- 🟢 Google Consent Mode v2 implemented if using Google Analytics or Google Ads — required for EU traffic.

---

# 19. ANIMATION PERFORMANCE

- 🔴 Only animate `transform` and `opacity` — these are the only properties that can be composited entirely on the GPU without triggering layout or paint.
- 🔴 Never animate `width`, `height`, `top`, `left`, `margin`, `padding` — these trigger layout recalculation (reflow) on every frame, causing jank.
- 🔴 `prefers-reduced-motion` respected — users with vestibular disorders can be harmed by motion:

```css
/* ✅ Required — always wrap animations in this media query */
@media (prefers-reduced-motion: no-preference) {
  .animated-element {
    transition: transform 0.3s ease, opacity 0.3s ease;
    animation: slideIn 0.3s ease;
  }
}

/* ✅ Or use the :not() approach for default-off */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- 🔴 In JavaScript-driven animations, check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` before starting.
- 🟡 `will-change: transform` applied to elements that will animate — hints the browser to promote to a compositor layer before the animation starts. Remove it after the animation completes — it consumes GPU memory.
- 🟡 Framer Motion's `useReducedMotion()` hook used if Framer Motion is in the stack — cleanly gates animations.
- 🟡 `<AnimatePresence>` exit animations tested on low-end devices — exit animations are a common performance trap.
- 🟢 `requestAnimationFrame` used for any imperative animation — never `setTimeout` at 16ms.

---

# 20. BUILD TOOLING STANDARDS

## 20.1 Vite Configuration (Greenfield Default)

- 🔴 Vite for all new projects not using Next.js — faster HMR and simpler config than Webpack.
- 🔴 `build.rollupOptions.output.manualChunks` configured to split vendor code from application code.
- 🔴 Chunk size budget enforced — warn at 200kb, fail at 500kb per chunk (gzipped).

```typescript
// ✅ Required vite.config.ts for production
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-router': ['react-router-dom'],
        },
        chunkFileNames: 'assets/[name]-[hash].js', // Stable names for cache invalidation
      },
    },
    chunkSizeWarningLimit: 200,  // Warn at 200kb (gzipped)
    sourcemap: true,             // Always — required for Sentry
    minify: 'esbuild',           // Default and fastest
  },
  server: {
    hmr: { overlay: true },
  },
});
```

## 20.2 Next.js Build Standards

- 🔴 `next build` output analyzed with `@next/bundle-analyzer` before each major release.
- 🔴 `experimental.optimizePackageImports` configured for large libraries (`lucide-react`, `@mui/icons-material`).
- 🟡 `output: 'standalone'` for Docker deployments — self-contained bundle without `node_modules`.
- 🟡 `images.formats: ['image/avif', 'image/webp']` in `next.config.js` — enables AVIF for supporting browsers.

## 20.3 Cross-Tool Standards

- 🔴 `NODE_ENV=production` set in all production builds — disables React dev mode warnings and reduces bundle size.
- 🔴 Build reproducibility — same commit always produces the same artifact. No timestamps or random seeds in filenames without content hashing.
- 🟡 Cache busting via content-hashed filenames — `[name]-[contenthash].js`, not `[name]-[chunkhash].js` (content hash is more stable).
- 🟡 TypeScript project references for monorepos — faster incremental builds.

---

# 21. MICRO-FRONTEND ARCHITECTURE (When Applicable)

Apply only when: independent team deployments are required, the application has clearly bounded domains owned by different teams, and monolith build times exceed 15 minutes.

## 21.1 Module Federation (Webpack 5 / Vite)

- 🔴 Each micro-frontend is independently deployable — no shared deployment pipeline.
- 🔴 Shared dependencies (React, ReactDOM) declared as singletons in Module Federation config — running two React instances causes hooks to fail.
- 🔴 Contract testing between host and remotes — remotes expose typed interfaces, hosts consume them. A remote changing its interface without notice breaks the host silently.

```javascript
// ✅ Host webpack.config.js
new ModuleFederationPlugin({
  name: 'host',
  remotes: {
    checkoutMFE: 'checkoutMFE@https://checkout.example.com/remoteEntry.js',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^18.0.0' },
    'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
  },
});

// ✅ Remote webpack.config.js
new ModuleFederationPlugin({
  name: 'checkoutMFE',
  filename: 'remoteEntry.js',
  exposes: {
    './CheckoutWidget': './src/CheckoutWidget',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^18.0.0' },
    'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
  },
});
```

- 🔴 Fallback UI defined for when remote fails to load — host does not crash.
- 🟡 Remote entry URLs are environment-variable-driven — not hardcoded.
- 🟡 Versioning contract: remotes follow semver on their exposed API surface.
- 🟢 Native Federation (Vite plugin) for Vite-based micro-frontends.

---

# Frontend Addendum Checklist

**State Management**
- [ ] Server state in React Query/SWR, UI state in Zustand/Redux — never mixed
- [ ] React Context not used for frequently-changing values
- [ ] Zustand: actions named in `set()` calls, one store per domain
- [ ] RTK Query used instead of manual fetch + Redux for server data

**Forms**
- [ ] React Hook Form + Zod on all forms
- [ ] `defaultValues` provided
- [ ] Server errors mapped to fields with `setError()`
- [ ] Submit button disabled during `isSubmitting`

**API Client**
- [ ] Single Axios instance with interceptors
- [ ] 401 triggers token refresh with request queuing
- [ ] Global QueryClient: `staleTime`, `retry` logic, mutation `retry: false`
- [ ] Structured query keys with factory pattern

**Memory Safety**
- [ ] Every `useEffect` with async/subscription/timer returns cleanup
- [ ] `AbortController` used for fetch in effects
- [ ] Observers disconnected on unmount

**Hydration**
- [ ] No `window`/`document`/`localStorage` access in render path
- [ ] No `Math.random()` or `Date.now()` in render without stable seed
- [ ] `dynamic({ ssr: false })` for browser-only components

**Consent**
- [ ] Analytics fire only after consent granted
- [ ] Consent withdrawal stops tracking and removes cookies
- [ ] Consent record stored server-side with timestamp

**Animation**
- [ ] Only `transform` and `opacity` animated
- [ ] `prefers-reduced-motion` gates all animations
- [ ] `will-change` removed after animation completes

**Build**
- [ ] Chunk size budget: warn 200kb, fail 500kb
- [ ] `manualChunks` splits vendor from app code
- [ ] Content-hashed filenames for cache busting
- [ ] `NODE_ENV=production` in all production builds

---

*Sources: Redux Toolkit Docs · Zustand GitHub · React Hook Form Docs · TanStack Query Docs · MDN (AbortController, Memory Management) · Next.js Docs · IAB Transparency & Consent Framework 2.2 · GDPR Article 7 · Google Web Performance Docs · Webpack Module Federation Docs · Vite Docs*
