#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.zeieli.local");
const catalogPath = path.join(root, "catalog", "zeieli-products.json");
const shouldArchiveRetired = process.argv.includes("--archive-retired");
const shouldDeleteRetired = process.argv.includes("--delete-retired");
const shouldSyncSizes = process.argv.includes("--sync-sizes");
const shouldSyncImages = process.argv.includes("--sync-images");
const retiredHandles = [
  "costum-tankini-sofia",
  "costum-tankini-marina",
  "costum-baie-intreg-elena",
  "rochie-baie-amalia",
  "rochie-maxi-alba-adriana",
  "rochie-midi-catalina",
  "rochie-midi-daria",
];

function readEnv(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const env = readEnv(envPath);
const store = env.SHOPIFY_STORE;
const apiVersion = env.SHOPIFY_API_VERSION || "2026-07";
const endpoint = `https://${store}/admin/api/${apiVersion}/graphql.json`;

if (!store || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
  throw new Error("Lipsesc credentialele Shopify din .env.zeieli.local");
}

const tokenResponse = await fetch(`https://${store}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  }),
});
const tokenData = await tokenResponse.json();
if (!tokenResponse.ok || !tokenData.access_token) {
  throw new Error(`Autentificarea Shopify a eșuat (${tokenResponse.status})`);
}
const token = tokenData.access_token;

async function graphql(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(JSON.stringify(payload.errors || payload, null, 2));
  }
  return payload.data;
}

function assertUserErrors(label, errors = []) {
  if (errors.length) {
    throw new Error(`${label}: ${errors.map((error) => error.message).join("; ")}`);
  }
}

async function ensureCollection({ handle, title, descriptionHtml }) {
  const existing = await graphql(
    `query CollectionByHandle($query: String!) {
      collections(first: 1, query: $query) { nodes { id handle title } }
    }`,
    { query: `handle:${handle}` },
  );
  if (existing.collections.nodes[0]) return existing.collections.nodes[0];

  const created = await graphql(
    `mutation CreateCollection($collection: CollectionCreateInput!) {
      collectionCreate(collection: $collection) {
        collection { id handle title }
        userErrors { field message }
      }
    }`,
    { collection: { handle, title, descriptionHtml, sortOrder: "CREATED_DESC" } },
  );
  assertUserErrors(`Colecția ${title}`, created.collectionCreate.userErrors);
  console.log(`Colecție creată: ${title}`);
  return created.collectionCreate.collection;
}

async function stageImage(filePath) {
  const filename = path.basename(filePath);
  const fileSize = String(fs.statSync(filePath).size);
  const mimeType = path.extname(filePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const staged = await graphql(
    `mutation StageImage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: "IMAGE",
          filename,
          mimeType,
          httpMethod: "POST",
          fileSize,
        },
      ],
    },
  );
  assertUserErrors(`Imaginea ${filename}`, staged.stagedUploadsCreate.userErrors);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append(
    "file",
    new Blob([fs.readFileSync(filePath)], { type: mimeType }),
    filename,
  );
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Upload eșuat pentru ${filename} (${upload.status})`);
  return target.resourceUrl;
}

async function findProduct(handle) {
  const data = await graphql(
    `query ProductByHandle($query: String!) {
      products(first: 1, query: $query) {
        nodes {
          id
          handle
          title
          variants(first: 100) {
            nodes {
              id
              selectedOptions { name value }
            }
          }
          media(first: 20) {
            nodes { id alt status }
          }
        }
      }
    }`,
    { query: `handle:${handle}` },
  );
  return data.products.nodes[0] || null;
}

const topology = await graphql(`query StoreTopology {
  locations(first: 20) { nodes { id name isActive } }
  publications(first: 20) { nodes { id name } }
}`);
const location = topology.locations.nodes.find((item) => item.isActive);
const onlineStore = topology.publications.nodes.find((item) => item.name === "Online Store");
if (!location || !onlineStore) throw new Error("Locația sau publicația Online Store lipsește");

const collectionSpecs = [
  {
    handle: "catalog-zeieli",
    title: "Catalog Zeieli",
    descriptionHtml: "<p>Rochii, compleuri și pantaloni pentru ținute de zi.</p>",
  },
  {
    handle: "rochii",
    title: "Rochii",
    descriptionHtml: "<p>Rochii cu imprimeuri și croieli ușor de purtat.</p>",
  },
  {
    handle: "compleuri",
    title: "Compleuri",
    descriptionHtml: "<p>Ținute coordonate din două piese.</p>",
  },
  {
    handle: "pantaloni",
    title: "Pantaloni",
    descriptionHtml: "<p>Pantaloni casual pentru ținute de zi.</p>",
  },
];
const collections = {};
for (const spec of collectionSpecs) collections[spec.handle] = await ensureCollection(spec);
for (const collection of Object.values(collections)) {
  const published = await graphql(
    `mutation PublishCollection($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: collection.id, input: [{ publicationId: onlineStore.id }] },
  );
  assertUserErrors(`Publicarea colecției ${collection.title}`, published.publishablePublish.userErrors);
}

const products = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
for (const product of products) {
  const existing = await findProduct(product.handle);
  if (existing) {
    let changed = false;
    if (shouldSyncSizes) {
      const variantsToDelete = existing.variants.nodes.filter((variant) => {
        const size = variant.selectedOptions.find((option) => option.name === "Mărime")?.value;
        return size && !product.sizes.includes(size);
      });
      if (variantsToDelete.length) {
        const deleted = await graphql(
          `mutation DeleteUnlistedSizes($productId: ID!, $variantsIds: [ID!]!) {
            productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
              product { id title }
              userErrors { field message }
            }
          }`,
          {
            productId: existing.id,
            variantsIds: variantsToDelete.map((variant) => variant.id),
          },
        );
        assertUserErrors(
          `Sincronizarea mărimilor pentru ${existing.title}`,
          deleted.productVariantsBulkDelete.userErrors,
        );
        console.log(`Mărimi eliminate din ${existing.title}: ${variantsToDelete.length}`);
        changed = true;
      } else {
        console.log(`Mărimi deja sincronizate: ${existing.title}`);
      }
    }
    if (shouldSyncImages) {
      const catalogAlt = product.catalogImageAlt || product.imageAlt;
      let catalogMedia = existing.media.nodes.find((media) => media.alt === catalogAlt);
      if (!catalogMedia) {
        const imageSource = await stageImage(path.resolve(root, product.image));
        const updated = await graphql(
          `mutation AddCatalogMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
            productUpdate(product: $product, media: $media) {
              product { id }
              userErrors { field message }
            }
          }`,
          {
            product: { id: existing.id },
            media: [{ originalSource: imageSource, mediaContentType: "IMAGE", alt: catalogAlt }],
          },
        );
        assertUserErrors(`Imaginea pentru ${existing.title}`, updated.productUpdate.userErrors);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const refreshed = await findProduct(product.handle);
          catalogMedia = refreshed.media.nodes.find((media) => media.alt === catalogAlt);
          if (catalogMedia?.status === "READY") break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!catalogMedia || catalogMedia.status !== "READY") {
          throw new Error(`Imaginea pentru ${existing.title} nu a devenit READY`);
        }
      }
      const reordered = await graphql(
        `mutation MakeCatalogMediaPrimary($id: ID!, $moves: [MoveInput!]!) {
          productReorderMedia(id: $id, moves: $moves) {
            job { id }
            mediaUserErrors { field message }
          }
        }`,
        { id: existing.id, moves: [{ id: catalogMedia.id, newPosition: "0" }] },
      );
      assertUserErrors(
        `Reordonarea imaginii pentru ${existing.title}`,
        reordered.productReorderMedia.mediaUserErrors,
      );
      console.log(`Imagine de catalog sincronizată: ${existing.title}`);
      changed = true;
    }
    if (!changed && !shouldSyncSizes && !shouldSyncImages) {
      console.log(`Există deja, omis: ${existing.title}`);
    }
    continue;
  }

  const imageSource = await stageImage(path.resolve(root, product.image));
  const productOptions = [
    {
      name: "Mărime",
      position: 1,
      values: product.sizes.map((name) => ({ name })),
    },
    {
      name: "Culoare",
      position: 2,
      values: product.colors.map((name) => ({ name })),
    },
  ];
  const created = await graphql(
    `mutation CreateProduct($product: ProductCreateInput, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product { id handle title }
        userErrors { field message }
      }
    }`,
    {
      product: {
        handle: product.handle,
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        vendor: "Zeieli",
        productType: product.productType,
        tags: ["Zeieli", "Catalog Zeieli", product.productType],
        status: "ACTIVE",
        collectionsToJoin: product.collections.map((handle) => collections[handle].id),
        productOptions,
        seo: {
          title: `${product.title} | Zeieli`,
          description: product.descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
        },
      },
      media: [
        {
          originalSource: imageSource,
          mediaContentType: "IMAGE",
          alt: product.catalogImageAlt || product.imageAlt,
        },
      ],
    },
  );
  assertUserErrors(`Produsul ${product.title}`, created.productCreate.userErrors);
  const productId = created.productCreate.product.id;

  const variants = product.colors.flatMap((color) =>
    product.sizes.map((size) => ({
      optionValues: [
        { optionName: "Mărime", name: size },
        { optionName: "Culoare", name: color },
      ],
      price: product.price,
      inventoryPolicy: "DENY",
      taxable: true,
      inventoryItem: {
        sku: `${product.skuPrefix}-${color
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/\s+/g, "-")
          .slice(0, 3)
          .toUpperCase()}-${size}`,
        tracked: true,
        requiresShipping: true,
      },
      inventoryQuantities: [{ locationId: location.id, availableQuantity: 0 }],
    })),
  );
  const variantResult = await graphql(
    `mutation CreateVariants(
      $productId: ID!,
      $variants: [ProductVariantsBulkInput!]!,
      $strategy: ProductVariantsBulkCreateStrategy
    ) {
      productVariantsBulkCreate(
        productId: $productId,
        variants: $variants,
        strategy: $strategy
      ) {
        productVariants { id title }
        userErrors { field message }
      }
    }`,
    { productId, variants, strategy: "REMOVE_STANDALONE_VARIANT" },
  );
  assertUserErrors(`Variantele ${product.title}`, variantResult.productVariantsBulkCreate.userErrors);

  const published = await graphql(
    `mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: productId, input: [{ publicationId: onlineStore.id }] },
  );
  assertUserErrors(`Publicarea ${product.title}`, published.publishablePublish.userErrors);
  console.log(`Produs creat: ${product.title} (${variants.length} variante, stoc 0)`);
}

if (shouldArchiveRetired || shouldDeleteRetired) {
  for (const handle of retiredHandles) {
    const product = await findProduct(handle);
    if (!product) continue;

    if (shouldDeleteRetired) {
      const deleted = await graphql(
        `mutation DeleteProduct($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors { field message }
          }
        }`,
        { input: { id: product.id } },
      );
      assertUserErrors(`Ștergerea ${product.title}`, deleted.productDelete.userErrors);
      console.log(`Produs șters: ${product.title}`);
    } else {
      const archived = await graphql(
        `mutation ArchiveProduct($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product { id handle title status }
            userErrors { field message }
          }
        }`,
        { product: { id: product.id, status: "ARCHIVED" } },
      );
      assertUserErrors(`Arhivarea ${product.title}`, archived.productUpdate.userErrors);
      console.log(`Produs arhivat: ${product.title}`);
    }
  }
}

console.log("Sincronizarea catalogului Zeieli s-a încheiat.");
