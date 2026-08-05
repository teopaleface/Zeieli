# Zeieli Shopify Theme

Custom Shopify theme for the ZEIELI dress store, built on Shopify Horizon as a clean technical base and adapted for a Romanian everyday-fashion storefront.

## Brand direction

- Flat paper, sand, Romanian blue, terracotta and ink palette
- No yellow decorative accents, colored shadows or toy-like button treatments
- Romanian-first retail messaging
- Full-bleed AI-generated Romanian village hero with an ie-inspired dress
- Dense product discovery with warm surfaces and direct shopping CTAs
- Mobile-first product discovery and native Shopify cart/search flows

## Product image set

The seven Zeieli product assets below were generated as a separate visual set
from the seven source product videos in `Materiale/`. They use different people
and locations from the ÉLANORA imagery:

- `assets/zeieli-product-purple-floral-set.jpg`
- `assets/zeieli-product-black-turquoise-set.jpg`
- `assets/zeieli-product-black-one-piece.jpg`
- `assets/zeieli-product-black-dress.jpg`
- `assets/zeieli-product-white-resort-dress.jpg`
- `assets/zeieli-product-terracotta-tiered-dress.jpg`
- `assets/zeieli-product-floral-tiered-dress.jpg`

The files are ready for product media upload once the Shopify catalog receives
validated product names, variants, prices and stock. The theme does not create
placeholder products or invent commercial data.

## Storefront coverage

- Romanian default locale, including newsletter, policies, cart and product UI
- Product-page accordions for size, delivery/return and care information
- Dedicated `page.size-guide.json` template at `/pages/ghid-marimi`

## Local workflow

```bash
shopify theme check --path .
shopify theme push --store gejd27-6s.myshopify.com --path . --theme <theme-id>
```

The theme is uploaded to Shopify as unpublished until storefront QA is complete. Never commit credentials, Admin API tokens or private environment files.
