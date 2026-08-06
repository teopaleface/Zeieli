# Zeieli Shopify Theme

Custom Shopify theme for the ZEIELI fashion store, built on Shopify Horizon as a clean technical base and adapted for a Romanian everyday-fashion storefront.

## Brand direction

- Flat paper, sand, Romanian blue, terracotta and ink palette
- No yellow decorative accents, colored shadows or toy-like button treatments
- Romanian-first retail messaging
- Full-bleed AI-generated Romanian village hero with an ie-inspired dress
- Dense product discovery with warm surfaces and direct shopping CTAs
- Mobile-first product discovery and native Shopify cart/search flows

## Product image set

The initial Zeieli catalog uses only the five original product photographs from
`../Produse/`. Files from `../Produse/generate/` are intentionally excluded.

## Shopify automation

`catalog/zeieli-products.json` is the source of truth for the initial five-product
Zeieli catalog. Run `node scripts/sync-shopify-catalog.mjs` to create missing
collections, upload product media, create size/color variants, and publish the
products to the Online Store.

The script is idempotent by product handle. Initial variant inventory is always
zero and tracked, so a product cannot be sold before real stock is entered in
Shopify. Compare-at prices are intentionally omitted until a legitimate reference
price exists.

Use `--sync-sizes` to remove live variants whose sizes are no longer listed in
the catalog source.

Use `--sync-images` to upload the normalized catalog image and move it to the
first position without deleting the original reference photograph.

The prices are marked temporary in the catalog and must be confirmed before
real inventory is enabled. Run the catalog sync with `--archive-retired` only
after the replacement catalog and theme are verified. If the retired handles
must no longer resolve in the storefront, use `--delete-retired` after checking
the explicit `retiredHandles` list.

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
