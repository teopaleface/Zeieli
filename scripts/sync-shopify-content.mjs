#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.zeieli.local");

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

async function findPage(handle) {
  const data = await graphql(
    `query PageByHandle($query: String!) {
      pages(first: 1, query: $query) { nodes { id handle title } }
    }`,
    { query: `handle:${handle}` },
  );
  return data.pages.nodes[0] || null;
}

async function ensurePage(page) {
  const existing = await findPage(page.handle);
  if (existing) return existing;

  const data = await graphql(
    `mutation CreatePage($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle title }
        userErrors { field message }
      }
    }`,
    { page: { ...page, isPublished: true } },
  );
  assertUserErrors(`Pagina ${page.title}`, data.pageCreate.userErrors);
  console.log(`Pagină creată: ${page.title}`);
  return data.pageCreate.page;
}

async function updatePage(id, page) {
  const data = await graphql(
    `mutation UpdatePage($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle title }
        userErrors { field message }
      }
    }`,
    { id, page },
  );
  assertUserErrors(`Pagina ${page.title}`, data.pageUpdate.userErrors);
  return data.pageUpdate.page;
}

async function findCollection(handle) {
  const data = await graphql(
    `query CollectionByHandle($query: String!) {
      collections(first: 1, query: $query) { nodes { id handle title } }
    }`,
    { query: `handle:${handle}` },
  );
  const collection = data.collections.nodes[0];
  if (!collection) throw new Error(`Colecția lipsește: ${handle}`);
  return collection;
}

async function updateMenu(handle, title, items) {
  const data = await graphql(
    `query MenuByHandle($query: String!) {
      menus(first: 10, query: $query) { nodes { id handle title } }
    }`,
    { query: `handle:${handle}` },
  );
  const menu = data.menus.nodes.find((item) => item.handle === handle);
  if (!menu) throw new Error(`Meniul lipsește: ${handle}`);

  const updated = await graphql(
    `mutation UpdateMenu($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id handle title items { id title type url } }
        userErrors { field message }
      }
    }`,
    { id: menu.id, title, items },
  );
  assertUserErrors(`Meniul ${title}`, updated.menuUpdate.userErrors);
  console.log(`Meniu actualizat: ${title}`);
}

const pageSpecs = [
  {
    handle: "despre-zeieli",
    title: "Despre Zeieli",
    body: `
      <h2>Ținute pentru zile adevărate</h2>
      <p>Zeieli este un magazin online cu rochii, compleuri și pantaloni ușor de purtat, pentru oraș și zilele obișnuite.</p>
      <p>Ne concentrăm pe o selecție simplă, mărimi explicate clar și o experiență de cumpărare fără complicații. Pentru întrebări despre produse sau comenzi, ne poți scrie la <a href="mailto:marketelanora@gmail.com">marketelanora@gmail.com</a>.</p>
    `.trim(),
  },
  {
    handle: "livrare-si-plata",
    title: "Livrare și plată",
    body: `
      <h2>Informații despre livrare</h2>
      <p>Opțiunile disponibile, costul transportului și totalul comenzii sunt afișate înainte de finalizarea comenzii, în pagina de plată.</p>
      <p>După plasarea comenzii primești confirmarea la adresa de e-mail introdusă. Verifică atent numărul de telefon și adresa de livrare înainte de trimitere.</p>
      <p>Pentru întrebări despre o comandă, scrie-ne la <a href="mailto:marketelanora@gmail.com">marketelanora@gmail.com</a> și include numărul comenzii.</p>
    `.trim(),
  },
  {
    handle: "retur-si-rambursare",
    title: "Retur și rambursare",
    body: `
      <h2>Cum soliciți un retur</h2>
      <p>Pentru cumpărăturile online poți comunica retragerea din contract în termen de 14 zile de la primirea comenzii, în condițiile prevăzute de lege.</p>
      <ol>
        <li>Trimite solicitarea la <a href="mailto:marketelanora@gmail.com">marketelanora@gmail.com</a>, împreună cu numărul comenzii.</li>
        <li>Vei primi instrucțiunile și adresa la care trebuie expediat coletul.</li>
        <li>Ambalează produsul complet, cu accesoriile și etichetele primite. Produsul poate fi verificat doar în măsura necesară pentru a-i stabili natura și caracteristicile.</li>
      </ol>
      <p>Nu trimite coletul înainte de a primi instrucțiunile de retur. Costul direct al expedierii returului revine clientului atunci când legea permite și dacă nu este indicat altfel în instrucțiunile primite.</p>
      <p>Rambursarea se face prin metoda permisă de configurația plății și de legislația aplicabilă, după procesarea returului.</p>
    `.trim(),
  },
];

const pages = {};
for (const page of pageSpecs) {
  const existingOrCreated = await ensurePage(page);
  pages[page.handle] = await updatePage(existingOrCreated.id, { ...page, isPublished: true });
}
pages.contact = await findPage("contact");
pages["ghid-marimi"] = await findPage("ghid-marimi");
if (!pages.contact || !pages["ghid-marimi"]) {
  throw new Error("Paginile Contact sau Ghid de mărimi lipsesc");
}
pages.contact = await updatePage(pages.contact.id, {
  title: "Contact",
  handle: "contact",
  body: `
    <p>Ai o întrebare despre un produs, mărime sau comandă? Completează formularul de mai jos sau scrie-ne la <a href="mailto:marketelanora@gmail.com">marketelanora@gmail.com</a>.</p>
    <p>Pentru o comandă existentă, include numărul comenzii ca să te putem ajuta mai repede.</p>
  `.trim(),
  isPublished: true,
  templateSuffix: "contact",
});

const catalog = await findCollection("catalog-zeieli");
const dresses = await findCollection("rochii");
const sets = await findCollection("compleuri");
const trousers = await findCollection("pantaloni");

await updateMenu("main-menu", "Meniu principal", [
  { title: "Acasă", type: "FRONTPAGE" },
  { title: "Catalog", type: "COLLECTION", resourceId: catalog.id },
  { title: "Rochii", type: "COLLECTION", resourceId: dresses.id },
  { title: "Compleuri", type: "COLLECTION", resourceId: sets.id },
  { title: "Pantaloni", type: "COLLECTION", resourceId: trousers.id },
  { title: "Ghid de mărimi", type: "PAGE", resourceId: pages["ghid-marimi"].id },
  { title: "Contact", type: "PAGE", resourceId: pages.contact.id },
]);

await updateMenu("footer", "Meniu subsol", [
  { title: "Despre Zeieli", type: "PAGE", resourceId: pages["despre-zeieli"].id },
  { title: "Livrare și plată", type: "PAGE", resourceId: pages["livrare-si-plata"].id },
  { title: "Retur și rambursare", type: "PAGE", resourceId: pages["retur-si-rambursare"].id },
  { title: "Ghid de mărimi", type: "PAGE", resourceId: pages["ghid-marimi"].id },
  { title: "Contact", type: "PAGE", resourceId: pages.contact.id },
  { title: "Caută", type: "SEARCH" },
]);

console.log("Conținutul și navigația Zeieli au fost sincronizate.");
