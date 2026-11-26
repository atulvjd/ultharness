# Accountancy website — local client draft

Five static pages with shared CSS/JavaScript and local SVG assets. “Accounting” is a generic descriptor, not an invented firm name. No firm identity, credentials, office, team, results or testimonials are asserted. CA is assumed to mean Chartered Accountant. All service and positioning copy is provisional.

## View locally

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory ca-firm
```

Open `http://127.0.0.1:4173/`. Stop with Ctrl+C. Directly opening `ca-firm/index.html` also allows a basic static preview; HTTP is recommended for consistent browser behavior. The root Ultharness app and the landing website are separate and were preserved.

## Verify

```sh
npm ci
npm run check
npm run verify:ca-firm
```

The verifier uses the pinned `playwright-core` development dependency and an installed Chrome/Chromium executable. It checks common macOS/Linux browser locations; set `CA_BROWSER_PATH` to the executable when necessary. It requires permission to launch a browser and listen on a loopback port. No browser is downloaded automatically. Missing browser or server access is a failure, never a skipped pass.

The finite suite has a 110-second hard deadline, exits nonzero on failure and closes its temporary server/browser and removes its temporary zoom profile. It validates page/asset existence, every local link and fragment, unique metadata, service queries, preview safeguards, required fields, navigation destinations, keyboard menu behavior, FAQ disclosures, associated errors, invalid email and valid local preview states. It checks no form requests, cookies or browser storage writes and records console errors and failed assets.

Browser layout checks and full-page PNGs cover every page at 320, 390, 768 and 1440 CSS pixels and actual 200% Chrome browser zoom through an isolated temporary profile. The suite asserts zoom metrics, horizontal reflow, element bounds and visible unobscured focus. Its focused automated accessibility audit checks landmarks, heading order, control names, labels, descriptions, duplicate IDs, target sizes and computed text contrast. This is not a comprehensive WCAG certification; manual visual, keyboard and assistive technology review remains necessary.

## Evidence and current limitations

`evidence/report.json` records the latest actual run, including failures and the exact browser error. Successful browser runs create `{page}-{width}.png`, `{page}-zoom-200.png`, `contact-invalid.png` and `contact-valid-preview.png` in `evidence/`. Screenshots must be visually inspected before sign-off; an automated screenshot is not visual approval. Evidence is generated, not illustrative. No screenshots are claimed when browser execution fails.

In the implementation environment, the package registry could not resolve. The pinned Playwright package was installed from a local npm cache. Chrome and a separate Chromium headless-shell launch were denied by the execution environment (the latter reported macOS Mach-port permission denied) and the computer-use browser access host was unavailable. A native Chrome fallback displayed the homepage, but responsive controls could not be operated reliably and the native tool then returned `noWindowsAvailable`. That limited observation is not evidence for the requested viewport matrix. Therefore the required saved browser screenshots, interaction outcomes, measured contrast, responsive/zoom checks and full WCAG review remain unverified. The draft is **not accepted for client-ready release** until these checks are actually run and reviewed. See the report and `evidence/REVIEW.md` for the observed results.

## Preview form and privacy

Use fictional details. The form has a disabled button until JavaScript initializes, no submit control or delivery endpoint, and a CSP that blocks form submission and network connections. JavaScript prevents submission and validates locally. It never says an enquiry was sent or a meeting booked. The visible no-delivery notice persists across validation and reloads. It uses no analytics, tracking, external fonts, uploads, payments, booking, cookies, local storage or session storage. Browser history/form restoration and local server request logs are controlled by the browser/server. Service category query parameters contain no entered form data.

Without JavaScript, all navigation and native FAQ disclosures remain available; navigation is expanded and the form cannot submit.

## Required client inputs before publication

- Legal/trading name, brand identity and approved wording.
- Country/jurisdiction, verified professional body credentials and practising authority.
- Confirmed services, exclusions, qualifications and approved service descriptions.
- Verified firm history, team information and any client-approved photographs.
- Real office/contact details, enquiry recipient and approved delivery process.
- Privacy controller/contact, applicable legal basis, hosting/processors, retention and rights/complaint information.
- Client approval, completed browser/manual accessibility review and a separately authorized delivery integration.

No deployment, publication or external data changes were performed. Do not enable live enquiries merely by relabelling this preview; implement and verify a real delivery process and update the privacy notice first.
