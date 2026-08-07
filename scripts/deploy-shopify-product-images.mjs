#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const env = readEnv(path.join(root, ".env.zeieli.local"));
const products = JSON.parse(
  fs.readFileSync(path.join(root, "catalog", "zeieli-products.json"), "utf8"),
);
const store = env.SHOPIFY_STORE;
const apiVersion = env.SHOPIFY_API_VERSION || "2026-07";

if (!store || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
  throw new Error("Lipsesc credentialele Shopify din .env.zeieli.local");
}

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

const endpoint = `https://${store}/admin/api/${apiVersion}/graphql.json`;

async function graphql(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": tokenData.access_token,
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

async function findProduct(handle) {
  const data = await graphql(
    `query ProductByHandle($query: String!) {
      products(first: 1, query: $query) {
        nodes {
          id
          handle
          title
          featuredMedia { id alt status }
          options {
            id
            name
            optionValues { id name }
          }
          variants(first: 100) {
            nodes {
              id
              selectedOptions { name value }
              media(first: 10) { nodes { id alt status } }
            }
          }
          media(first: 50) {
            nodes { id alt status mediaContentType }
          }
        }
      }
    }`,
    { query: `handle:${handle}` },
  );
  return data.products.nodes[0] || null;
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
  assertUserErrors(`Pregătirea imaginii ${filename}`, staged.stagedUploadsCreate.userErrors);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([fs.readFileSync(filePath)], { type: mimeType }), filename);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Upload eșuat pentru ${filename} (${upload.status})`);
  return target.resourceUrl;
}

async function addProductMedia(productId, imagePath, alt) {
  const source = await stageImage(imagePath);
  const result = await graphql(
    `mutation AddProductMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product { id }
        userErrors { field message }
      }
    }`,
    {
      product: { id: productId },
      media: [{ originalSource: source, mediaContentType: "IMAGE", alt }],
    },
  );
  assertUserErrors(`Adăugarea imaginii ${alt}`, result.productUpdate.userErrors);
}

async function waitForMedia(handle, alt) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const product = await findProduct(handle);
    const media = product.media.nodes.find((item) => item.alt === alt);
    if (media?.status === "READY") return media;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Imaginea nu a devenit READY: ${alt}`);
}

function imageSpecs(product) {
  if (product.variantImages) {
    return Object.entries(product.variantImages).map(([color, spec]) => ({
      color,
      path: path.resolve(root, spec.image),
      alt: spec.alt,
    }));
  }
  return [
    {
      color: product.colors[0],
      path: path.resolve(root, product.image),
      alt:
        product.lifestyleImageAlt ||
        `Fotografie lifestyle Zeieli ${product.handle} ${crypto
          .createHash("sha1")
          .update(fs.readFileSync(path.resolve(root, product.image)))
          .digest("hex")
          .slice(0, 10)}`,
    },
  ];
}

function optionValue(variant, name) {
  return variant.selectedOptions.find((option) => option.name === name)?.value;
}

function skuCode(product, color) {
  if (product.skuCodes?.[color]) return product.skuCodes[color];
  return color
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 3)
    .toUpperCase();
}

const topology = await graphql(`query ActiveLocation {
  locations(first: 20) { nodes { id name isActive } }
}`);
const location = topology.locations.nodes.find((item) => item.isActive);
if (!location) throw new Error("Nu există o locație Shopify activă");

for (const spec of products) {
  const before = await findProduct(spec.handle);
  if (!before) throw new Error(`Produsul live lipsește: ${spec.handle}`);

  const images = imageSpecs(spec);
  const missingCombinations = spec.colors.flatMap((color) =>
    spec.sizes
      .filter(
        (size) =>
          !before.variants.nodes.some(
            (variant) =>
              optionValue(variant, "Culoare") === color &&
              optionValue(variant, "Mărime") === size,
          ),
      )
      .map((size) => ({ color, size })),
  );
  const retiredMedia = before.media.nodes.filter(
    (media) =>
      media.mediaContentType === "IMAGE" &&
      [spec.catalogImageAlt, spec.imageAlt, ...(spec.retiredImageAlts || [])].includes(media.alt),
  );

  console.log(
    `${apply ? "APPLY" : "PLAN"} ${spec.handle}: ${images.length} imagini, ` +
      `${missingCombinations.length} variante noi, ${retiredMedia.length} imagini vechi de înlocuit`,
  );
  if (!apply) continue;

  if (spec.syncMetadata) {
    const metadata = await graphql(
      `mutation UpdateProductMetadata($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id title }
          userErrors { field message }
        }
      }`,
      {
        product: {
          id: before.id,
          title: spec.title,
          descriptionHtml: spec.descriptionHtml,
          seo: {
            title: `${spec.title} | Zeieli`,
            description: spec.descriptionHtml
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300),
          },
        },
      },
    );
    assertUserErrors(`Actualizarea produsului ${spec.title}`, metadata.productUpdate.userErrors);
  }

  const mediaByColor = new Map();
  for (const image of images) {
    let media = before.media.nodes.find((item) => item.alt === image.alt && item.status === "READY");
    if (!media) {
      await addProductMedia(before.id, image.path, image.alt);
      media = await waitForMedia(spec.handle, image.alt);
    }
    mediaByColor.set(image.color, media);
  }

  const primaryMedia = mediaByColor.get(spec.colors[0]);
  const reordered = await graphql(
    `mutation MakePrimary($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job { id }
        mediaUserErrors { field message }
      }
    }`,
    { id: before.id, moves: [{ id: primaryMedia.id, newPosition: "0" }] },
  );
  assertUserErrors(
    `Reordonarea imaginii ${spec.title}`,
    reordered.productReorderMedia.mediaUserErrors,
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const refreshed = await findProduct(spec.handle);
    if (refreshed.featuredMedia?.id === primaryMedia.id) break;
    if (attempt === 29) {
      throw new Error(`Imaginea principală nu s-a actualizat pentru ${spec.title}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (missingCombinations.length) {
    const variants = missingCombinations.map(({ color, size }) => ({
        optionValues: [
          { optionName: "Mărime", name: size },
          { optionName: "Culoare", name: color },
        ],
        price: spec.price,
        mediaId: mediaByColor.get(color)?.id,
        inventoryPolicy: "DENY",
        taxable: true,
        inventoryItem: {
          sku: `${spec.skuPrefix}-${skuCode(spec, color)}-${size}`,
          tracked: true,
          requiresShipping: true,
        },
        inventoryQuantities: [{ locationId: location.id, availableQuantity: 0 }],
      }));
    const created = await graphql(
      `mutation CreateColorVariants(
        $productId: ID!,
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id title }
          userErrors { field message }
        }
      }`,
      { productId: before.id, variants },
    );
    assertUserErrors(
      `Crearea variantelor de culoare ${spec.title}`,
      created.productVariantsBulkCreate.userErrors,
    );
  }

  const refreshed = await findProduct(spec.handle);
  const variantUpdates = refreshed.variants.nodes
    .map((variant) => ({
      id: variant.id,
      mediaId: mediaByColor.get(optionValue(variant, "Culoare"))?.id,
    }))
    .filter((variant) => variant.mediaId);
  const attached = await graphql(
    `mutation AttachVariantMedia(
      $productId: ID!,
      $variants: [ProductVariantsBulkInput!]!
    ) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    { productId: before.id, variants: variantUpdates },
  );
  assertUserErrors(
    `Asocierea imaginilor variantelor ${spec.title}`,
    attached.productVariantsBulkUpdate.userErrors,
  );

  const newMediaIds = new Set([...mediaByColor.values()].map((media) => media.id));
  const retiredMediaIds = retiredMedia
    .map((media) => media.id)
    .filter((id) => !newMediaIds.has(id));
  if (retiredMediaIds.length) {
    if (retiredMediaIds.length > 2) {
      throw new Error(
        `Guard ștergere: ${spec.title} are ${retiredMediaIds.length} imagini candidate, maximul permis este 2`,
      );
    }
    const deleted = await graphql(
      `mutation DeleteRetiredMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }`,
      { productId: before.id, mediaIds: retiredMediaIds },
    );
    assertUserErrors(
      `Ștergerea imaginilor vechi ${spec.title}`,
      deleted.productDeleteMedia.mediaUserErrors,
    );
  }

  console.log(`OK ${spec.title}`);
}

console.log(
  apply
    ? "Imaginile și variantele au fost publicate în Shopify."
    : "Dry-run finalizat. Rulează cu --apply pentru publicare.",
);
