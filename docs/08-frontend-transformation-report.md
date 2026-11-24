# Phase 8: Frontend Transformation Report

The AirfareIndex frontend was rebuilt as a dark, aviation-themed product with a real WebGL hero, a redesigned estimator and a new methodology page. The backend, API contracts, model, inference module and datasets were not changed (section 13). Every number shown in the UI still comes from the API.

## 1. Design direction

"Midnight cabin": deep navy surfaces like a night flight deck, instrument-style azure and cyan accents for data and focus, and one warm horizon accent (dusk light) used sparingly. The type pairs an editorial serif for headlines with a clean sans for UI and a monospace for codes and data, which gives a premium travel feel instead of a generic dashboard. Recurring motifs carry the identity across pages: flight paths and waypoints, boarding-pass cards with airport codes and perforation, and a cockpit gauge for the model's error.

## 2. Pages transformed

| Route | Contents |
|---|---|
| `/` Landing (new) | Full-viewport WebGL hero ("Understand airfares. Travel smarter."), CTA, a live data strip (routes, airlines, cities and typical error from `/options` and `/model/insights`); "What AirfareIndex does"; "How it works" as four waypoints on a flight path that draws as you scroll; transparency section with the animated error gauge; coverage matrix of airlines × classes built from real `/options`; final CTA; footer |
| `/predict` Estimator | Restyled three-step form (Route, Flight, Timing) with dependent dropdowns, a Swap control and lead-time presets; loading state with a looping route animation; result as a boarding pass (IATA codes, animated arc with a travelling aircraft, counting fare, perforated stub with details, pointer 3D tilt); accuracy gauge and explanation; lead-time bars; factor cards with SHAP share meters; limits |
| `/methodology` (replaces `/about`, which redirects) | Pipeline (data → cleaning → features → model → evaluation), evaluation figures and gauge, comparison with simpler models, SHAP factor shares and directions, coverage, "why estimates can differ from market prices", limits |
| 404 | Restyled |
| Navigation and footer | Transparent nav over the hero that turns solid on scroll; animated mobile menu with focus management and Escape; page transitions |

## 3. Design system (`frontend/src/index.css`, `components/ui/`)

- **Colour:** night-950…600 surfaces, ink/mist/fog text (secondary text at least 8:1, tertiary at least 5:1 on night-900), azure (actions), cyan (instruments, focus), horizon amber (accent), danger and success.
- **Type:** Instrument Serif (display), Manrope Variable (UI), IBM Plex Mono (codes and labels), all self-hosted through fontsource (no third-party requests). Fluid headline sizes with `clamp()`; minimum UI text 12 px.
- **Spacing and layout:** Tailwind scale, content width capped at 1440 px, breakpoints 480 / 640 / 768 / 1024 / 1280 px.
- **Components:** `Panel`, `Field`, `SelectInput`, `Button` and `buttonClass` (primary, secondary, ghost), `Alert` (error, info, warn), `Spinner`, `BarList`, `Instrument` gauge, `CountUp`, `RouteArc`, `TiltCard`, `ShareMeter`, `Reveal` and `SectionHeading`; native selects and time input with `color-scheme: dark`.
- **Motion conventions:** one easing curve (`cubic-bezier(0.22, 1, 0.36, 1)`), 0.35-0.9 s reveals, springs for 3D tilt and gauge needle, everything disabled under reduced motion.

## 4. 3D implementation

- **Technology:** three.js r187 with @react-three/fiber 9.8. No drei, GSAP or Lottie (not needed).
- **Aircraft:** an original narrow-body airliner modelled in code (`src/three/Aircraft.jsx`): lathe-profiled fuselage with an upswept tail and drooped nose, swept and extruded wings with dihedral and winglets, stabilisers, fin with livery mark, engine nacelles with intake, spinner, lip ring and exhaust, instanced cabin windows, cockpit glazing, a cheatline, navigation lights and a blinking beacon. Physically based materials (clearcoat skin, metallic wings, navy livery).
- **Assets and licences:** no external 3D models, textures, HDRIs or images. The environment lighting is generated in memory (`RoomEnvironment` + PMREM) and the cloud texture is painted on a canvas at runtime. Nothing to license and no remote URLs.
- **Scene:** an instanced cloud deck drifting past for a sense of speed, fog for depth, warm key light, cyan rim light, ACES tone mapping.
- **Interaction:** gentle bob and roll; banking and heading follow the pointer on fine-pointer devices only; scrolling the hero flies the aircraft up and away.
- **Composition:** beside the copy on wide screens, in its own band above the copy on phones (the canvas covers the top 52% of the small-screen viewport).
- **Elsewhere:** 3D is used with restraint on other pages: CSS 3D perspective on the boarding pass (entrance flip and pointer tilt), plus SVG and motion for the route arc, gauge and flight-path timeline.
- **Fallback:** a static SVG aircraft (`AircraftPoster`) shows while the 3D chunk loads and whenever WebGL is unavailable. It cross-fades out once the scene is ready.

## 5. Animation and interaction

Hero entrance stagger; scroll-triggered section reveals; scroll-drawn waypoint path (horizontal on desktop, vertical on mobile); gauge arc and spring needle; bars that grow into view; count-up fare; travelling aircraft on the result arc; boarding-pass entrance and tilt; page fade transitions; mobile menu animation; button lift and press feedback; select chevron rotation on focus. Framer Motion is used through `LazyMotion` with the `domAnimation` feature set. `prefers-reduced-motion` is honoured: Framer `MotionConfig reducedMotion="user"`, CSS animations off, the 3D scene renders one static frame, the fare appears without counting and bars render at full width (verified, section 9).

## 6. Responsive implementation

Mobile-first. Phones get a stacked layout, the aircraft in its own band, full-width CTAs, a menu sheet, two-column stats, and a coverage table with abbreviated class headers. Tablets get the inline nav. From 1024 px the estimator becomes form plus results side by side, with the form sticky. From 1440 px content is centred with a fixed maximum width. The 3D layout adapts to the canvas aspect ratio (three compositions). All controls are at least 44 px; inputs are 16 px so iOS does not zoom.

## 7. Performance

| Item | Phase 7 | Phase 8 |
|---|---|---|
| Main JS chunk | 296.7 kB (93.8 kB gzip) | 398.8 kB (131.3 kB gzip) |
| Estimator page chunk (lazy) | (in main) | 49.0 kB (16.9 kB gzip) |
| Methodology chunk (lazy) | (in main) | 12.2 kB (4.5 kB gzip) |
| 3D hero chunk (lazy, landing only, only when WebGL is suitable) | none | 929.8 kB (246.9 kB gzip) |

Measures taken:
- **Code splitting:** route-level splitting, plus the three.js/R3F chunk loaded only by the landing hero.
- **Framer Motion:** `LazyMotion` + `m` components cut the main chunk from 505 kB to 398.8 kB.
- **Rendering:** device-pixel ratio is capped (1.75, or 1.25 on low-power devices), and low-power devices get fewer clouds, fewer polygons and no antialiasing.
- **Pausing:** rendering stops when the hero scrolls out of view or the tab is hidden.
- **Frame-time guard:** the scene freezes if the median frame time exceeds 45 ms.
- **No software rendering:** software renderers (SwiftShader, WARP and similar) are refused through `failIfMajorPerformanceCaveat` plus a renderer-string check, so devices without a GPU get the poster and never download the 3D chunk (Edge cold load 259 KB vs 499 KB with 3D).

This guard was added after real testing: headless Edge without a GPU (Microsoft Basic Render Driver) stalled page loads at 1366×768 with the live scene.

Measured in installed browsers (headless, this machine, Intel UHD Graphics via ANGLE/D3D11):

| Browser | 3D | First contentful paint | Cold landing transfer | rAF rate on landing |
|---|---|---|---|---|
| Chrome 158 | WebGL | 492 ms cold, then 144 ms | 499 KB | 145 fps (headless, uncapped) |
| Firefox 160 | WebGL | 2,161 ms cold (browser start-up), then 103-108 ms | 498 KB | 145 / 49 / 34 fps at mobile / tablet / laptop |
| Edge 158 (no GPU in headless) | static fallback | 180-184 ms | 259 KB | 61 fps |

The main chunk grew by about 37 kB gzip because the UI now uses motion; the 3D chunk is the main remaining weight and is loaded only on the landing page with a capable GPU. Headless frame rates are indicative, not a field measurement on phones.

## 8. Accessibility

- **Structure:** semantic landmarks and headings, skip link, labelled controls, `aria-invalid` and described-by on errors, `aria-live` results, and focus moved to the result heading.
- **Mobile menu:** `aria-expanded`/`aria-controls`, focus sent to the first link, Escape closes it and returns focus to the button.
- **Focus:** a visible focus outline (cyan) on links and buttons, and a cyan border plus ring on form controls.
- **Decorative content:** 3D, SVG decoration and animated digits are hidden from assistive technology, with the exact fare in a screen-reader element; tables have captions and row headers.
- **Contrast:** checked against the token values.

Measured: reduced motion leaves content fully visible with a frozen canvas; keyboard tab order is logical (skip link, nav, then form; disabled steps are skipped); Enter submits; focus lands on the result. No screen-reader or axe audit was run.

## 9. Testing (all executed)

| Suite | Result |
|---|---|
| Frontend unit and component tests (vitest) | **60 passed** (form, lib, API client, estimator flows incl. errors, duplicate submit, swap, SHAP shares, landing with WebGL fallback and backend-down, methodology, `/about` redirect, navigation, mobile menu focus) |
| Lint (oxlint) | 0 warnings |
| Production build | succeeds |
| Backend tests (pytest) | **74 passed** (unchanged backend) |
| Real browsers, `e2e/crossbrowser.mjs` | Chrome, Edge, Firefox × mobile 375×812, tablet 768×1024, laptop 1366×768: **9 of 9 pass**. Landing (3D or fallback, no overflow), estimator (displayed fare equals a direct `/api/predict` call, ₹31,112, after the count-up), validation state, methodology; 0 console errors |
| 7-viewport layout audit (`e2e/layout-audit.js`, app browser) | 320×568, 375×812, 430×932, 768×1024, 1366×768, 1920×1080, 2560×1440: every page and state (landing, landing scrolled, estimator empty, validation, result, backend down, methodology, mobile menu, 404) with no horizontal overflow, no off-screen elements, no clipped text and no target under 44 px. Fixed on the way: footer link 38 px wide, 11 px labels raised to 12 px |
| Reduced motion and keyboard (`e2e/a11y-motion.mjs`) | pass (section 8) |

Issues found by testing and fixed: hero gradient text rendered as a solid block; aircraft too large and overlapping the headline (recomposed, mobile band added); swap button overlapping select chevrons (moved into the Route header); software-rendering stall in Edge (capability check and frame guard); hard edge on the fallback glow.

## 10. Browser compatibility

| Browser | Result |
|---|---|
| Chrome 158 | pass, hardware WebGL |
| Firefox 160 | pass, hardware WebGL |
| Edge 158 | pass; static fallback in headless (no GPU) |
| App's built-in Chromium | pass at all 7 viewports |
| **Safari / iOS Safari** | **not tested**: no Apple device or Safari is available on this Windows machine |

Edge with a GPU was not tested interactively in this environment. Safari risks reduced by design but unverified: WebGL2 with WebGL1 fallback, `100svh`/`dvh` units (Safari 15.4+), `:has()` (Safari 15.4+), self-hosted WOFF2 fonts.

## 11. Screenshots (`docs/screenshots/phase8/`)

Landing, estimator result and validation state for Chrome, Edge and Firefox at 375×812, 768×1024 and 1366×768, including full-page captures; Chrome landing and methodology at 1920×1080 and 2560×1440. The Edge captures predate the final cosmetic fix to the fallback glow.

## 12. Files

**Created:**
- `src/three/{Aircraft.jsx, Clouds.jsx, HeroScene.jsx, capabilities.js}`
- `src/components/hero/{HeroBackdrop.jsx, AircraftPoster.jsx}`
- `src/components/brand/Logo.jsx`, `src/components/motion/Reveal.jsx`, `src/components/Instrument.jsx`
- `src/components/results/pieces.jsx`, `src/components/ui/styles.js`
- `src/hooks/useResource.js`, `src/lib/airports.js`
- `src/pages/{LandingPage.jsx, MethodologyPage.jsx}`
- `e2e/{layout-audit.js, capture-large.mjs, a11y-motion.mjs}`
- `docs/08-crossbrowser-results.json`, screenshots

**Modified:**
- `src/{index.css, main.jsx, App.jsx}`, `layouts/AppLayout.jsx`
- `components/{PredictionForm.jsx, ResultPanel.jsx, ui/ui.jsx}`
- `pages/PredictPage.jsx`, `services/api.js` (added `getModelInfo`)
- `test/setup.js`, `pages/PredictPage.test.jsx`
- `e2e/crossbrowser.mjs`, `vite.config.js`, `.oxlintrc.json`, `package.json`

**Removed:** `pages/InsightsPage.jsx`, `hooks/useAsync.js`, unused `plotly.js-dist-min` and `react-plotly.js`.

**Added dependencies:** `three`, `@react-three/fiber`, `@fontsource/instrument-serif`, `@fontsource-variable/manrope`, `@fontsource/ibm-plex-mono`.

## 13. Phase 7 functionality preserved

- **API:** the same endpoints and request/response fields are used; `api.js` only gained `getModelInfo` for an existing endpoint.
- **Form:** the same inputs, validation rules and duplicate-submit guard, plus a Swap control and lead-time presets that only set existing fields.
- **Results and states:** the same error and loading states, and the same transparency text (typical error as a model-level statistic, limitations).
- **Fares:** the displayed fare is checked against a direct API call in 3 browsers × 3 viewports.
- **Backend:** no backend file changed in Phase 8 (none modified after Phase 8 began).
- **Model and data:** the Phase 7 start manifest (final model, candidates, processed data, frozen tuning) matches 13 of 13, the Phase 5 manifest 35 of 35, and the raw data hashes match.

## 14. Remaining limitations

- **Untested environments:** Safari and iOS Safari; real phones and tablets (emulation only); Edge with a GPU; screen readers and axe.
- **Frame-rate measurements:** headless only; phone thermal behaviour not measured.
- **Bundle weight:** the 3D chunk is about 247 kB gzip because react-three-fiber pulls in the whole three.js namespace; a custom scene without R3F could shrink it.
- **Asset quality:** the aircraft is a stylised procedural model, not a photo-real scanned asset.
- **Landing data:** the landing page's live facts need the backend; without it they show placeholders, and the page still renders (tested).
- **Test environment:** fonts and visuals were not checked in high-contrast or forced-colours modes.
