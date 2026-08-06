# Zeieli design QA

Date: 2026-08-06

## Visual target

Common Romanian direct-response Shopify storefront pattern visible in the
provided Mailmorent, Laziee and Autunme screenshots:

- compact promotional bar;
- white retail header with navigation and search;
- three-item trust strip;
- one wide lifestyle hero;
- centered collection heading;
- dense four-column desktop / two-column mobile product grid;
- red price, conditional struck compare-at price and orange purchase action.

## Captures reviewed

- Reference: user-provided Autunme desktop screenshot.
- Implementation desktop: `/Users/teo/Elanora/zeieli-qa-desktop-1440.png`.
- Implementation mobile hero: `/Users/teo/Elanora/zeieli-qa-mobile-v2.png`.
- Implementation mobile cards: `/Users/teo/Elanora/zeieli-qa-mobile-card.png`.

## Comparison

### Structure

Passed. Section order, white shell, trust strip, panoramic hero and immediate
product grid match the reference pattern.

### Header

Passed. Desktop exposes a full search field with a separate black search action.
Mobile collapses to hamburger, search, logo, account and cart icons.

### Hero

Passed. The generated asset is original and photorealistic, with subjects on
the right and editable HTML copy on the left. Desktop ratio is approximately
2.29:1. Mobile uses a controlled crop and a bottom-weighted overlay.

### Product grid

Passed. Desktop uses four columns. Mobile uses two columns at a measured card
width of approximately 167px in a 375px viewport. No horizontal overflow was
detected. Cards include square media, centered titles, red prices, struck
compare-at prices and full-width burnt-orange actions. Mobile actions keep a
minimum 44px touch target.

### Contrast

Passed. The action color is `#D93D0B`; white action text meets WCAG AA at
approximately 4.54:1. Global theme buttons are not overridden by the homepage
layer.

### Data integrity

Passed. Real storefront cards display compare-at pricing only when
`compare_at_price > price`, and ratings only when review metafields exist.
The labeled preview cards appear only in Shopify design mode. The public empty
catalog does not fabricate products.

### Console

Passed for theme code. Reported errors come from Shopify editor iframe CSP and
WebMCP permission policies; no theme JavaScript error was observed.

## Severity findings

- P0: none.
- P1: none.
- P2: none.
- P3: none.

final result: passed
