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
- `assets/zeieli-product-black-swimdress-v2.jpg`
- `assets/zeieli-product-white-resort-dress.jpg`
- `assets/zeieli-product-terracotta-tiered-dress.jpg`
- `assets/zeieli-product-floral-tiered-dress.jpg`

## Shopify automation

`catalog/zeieli-products.json` is the source of truth for the initial seven-product
Zeieli catalog. Run `node scripts/sync-shopify-catalog.mjs` to create missing
collections, upload product media, create size/color variants, and publish the
products to the Online Store.

The script is idempotent by product handle. Initial variant inventory is always
zero and tracked, so a product cannot be sold before real stock is entered in
Shopify. Compare-at prices are intentionally omitted until a legitimate reference
price exists.

Run `node scripts/sync-shopify-content.mjs` to create the informational pages and
keep the main and footer navigation aligned with the Zeieli catalog.

Both scripts read credentials from the ignored `.env.zeieli.local` file. The
theme does not create placeholder products or invent commercial data.

## Storefront coverage

- Romanian default locale, including newsletter, policies, cart and product UI
- Product-page accordions for size, delivery/return and care information
- Dedicated `page.size-guide.json` template at `/pages/ghid-marimi`

## Local workflow

```bash
shopify theme check --path .
shopify theme push --store gejd27-6s.myshopify.com --path . --theme <theme-id>
```

The current live Shopify theme is `207579054429` on
`gejd27-6s.myshopify.com`. Never commit credentials, Admin API tokens or private
environment files.
