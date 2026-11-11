#!/usr/bin/env node
// MCP server (stdio, zero dependencies) that lets Claude read the public Naffy listing for PoTerminie Pro
// and cross-check it against the live site. Naffy has no public API, so this is read-only:
// it cannot edit the listing or see sales — those live in the Naffy and Stripe dashboards.
//
// Product/store address: private/naffy.json  { "productUrl": "https://www.naffy.io/<store>/<product>" }
// (kept in private/ so it never lands in the public repository), or pass `url` to a tool.
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => { try { return JSON.parse(await readFile(path.join(ROOT, p), 'utf8')); } catch { return {}; } };
const NAFFY = /^https:\/\/(www\.)?naffy\.io\//;

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (listing-check)', 'Accept-Language': 'pl' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  return { status: r.status, url: r.url, body: r.ok ? await r.text() : '' };
}
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const toText = (html) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '\n')).replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

async function productUrl(arg) {
  const url = arg || (await readJson('private/naffy.json')).productUrl;
  if (!url) throw new Error('No product URL. Pass `url` or put {"productUrl": "..."} in private/naffy.json.');
  if (!NAFFY.test(url)) throw new Error('Only https://www.naffy.io/ addresses are allowed.');
  return url;
}

async function naffyProduct({ url } = {}) {
  const target = await productUrl(url), page = await get(target);
  if (page.status !== 200) return { url: target, live: false, httpStatus: page.status };
  const text = toText(page.body);
  const price = /"price":\s*([0-9]+(?:\.[0-9]+)?)/.exec(page.body), currency = /"currency":\s*"([a-z]{3})"/i.exec(page.body);
  const title = /<meta property="og:title" content="([^"]*)"/.exec(page.body);
  const addresses = [...new Set(text.match(/[a-z0-9.-]+\.(?:github\.io|pl|eu|com)(?:\/[^\s,;)]*)?/gi) || [])].filter((a) => !/naffy\.io/.test(a));
  return {
    url: page.url, live: true, pageTitle: title ? decode(title[1]) : null,
    price: price ? +price[1] : null, currency: currency ? currency[1].toUpperCase() : null,
    siteAddressesMentioned: addresses, text: text.slice(0, 4000)
  };
}

async function naffyStore({ url } = {}) {
  const storeUrl = url || (await productUrl()).replace(/\/[^/]+\/?$/, '');
  if (!NAFFY.test(storeUrl)) throw new Error('Only https://www.naffy.io/ addresses are allowed.');
  const page = await get(storeUrl);
  if (page.status !== 200) return { url: storeUrl, live: false, httpStatus: page.status };
  const slug = new URL(page.url).pathname.replace(/\/+$/, '');
  const products = [...new Set([...page.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith(slug + '/') && h.length > slug.length + 1 && !/\/(terms|privacy)$/.test(h)))].map((h) => 'https://www.naffy.io' + h);
  return { url: page.url, live: true, products, text: toText(page.body).slice(0, 1500) };
}

async function listingCheck({ url } = {}) {
  const cfg = await readJson('site.config.json');
  const site = String(cfg.siteUrl || '').replace(/\/+$/, ''), host = site.replace(/^https?:\/\//, '');
  const product = await naffyProduct({ url });
  const out = { product: { url: product.url, live: product.live, price: product.price, currency: product.currency }, site: { url: site }, problems: [] };
  if (!product.live) out.problems.push('The Naffy product page is not reachable.');
  const want = parseFloat(String(cfg.pro?.priceLabel || '').replace(',', '.'));
  if (product.live && want && product.price !== want) out.problems.push(`Price differs: Naffy shows ${product.price}, site.config.json says ${cfg.pro.priceLabel}.`);
  if (product.live && host && !(product.siteAddressesMentioned || []).some((a) => a.startsWith(host))) out.problems.push(`The Naffy description does not mention the current site address (${host}); it mentions: ${(product.siteAddressesMentioned || []).join(', ') || 'none'}.`);
  if (site) {
    const pro = await get(site + '/pro/').catch(() => ({ status: 0, body: '' }));
    const data = await get(site + '/assets/data.js').catch(() => ({ status: 0, body: '' }));
    const m = /"checkoutUrl":"([^"]*)"/.exec(data.body), enabled = /"pro":\{"enabled":true/.test(data.body);
    out.site.proPageStatus = pro.status; out.site.proEnabledOnLiveSite = enabled; out.site.checkoutUrlOnLiveSite = m ? m[1] : null;
    if (pro.status !== 200) out.problems.push('The live /pro/ page is not reachable.');
    if (!enabled) out.problems.push('Pro is not switched on on the live site (pro.checkoutUrl is empty), so nobody is sent to Naffy yet.');
    else if (product.live && m && m[1].replace(/\/+$/, '') !== product.url.replace(/\/+$/, '')) out.problems.push(`The live site sends buyers to ${m[1]}, not to this Naffy product.`);
  } else out.problems.push('siteUrl is empty in site.config.json.');
  if ((cfg.pro?.checkoutUrl || '') && product.live && cfg.pro.checkoutUrl.replace(/\/+$/, '') !== product.url.replace(/\/+$/, '')) out.problems.push('pro.checkoutUrl in site.config.json differs from the Naffy product URL.');
  out.ok = out.problems.length === 0;
  return out;
}

const urlProp = { url: { type: 'string', description: 'Optional https://www.naffy.io/... address; defaults to the one in private/naffy.json.' } };
const TOOLS = [
  { name: 'naffy_product', description: 'Read the public Naffy product page: whether it is live, its title, price, currency, description text and which site addresses it mentions. Read-only.', inputSchema: { type: 'object', properties: urlProp }, run: naffyProduct },
  { name: 'naffy_store', description: 'Read the public Naffy store page and list the product links on it. Read-only.', inputSchema: { type: 'object', properties: urlProp }, run: naffyStore },
  { name: 'naffy_listing_check', description: 'Cross-check the Naffy product against the live PoTerminie site and site.config.json: price, site address in the description, whether Pro is switched on and points buyers at this product. Returns a list of problems.', inputSchema: { type: 'object', properties: urlProp }, run: listingCheck }
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
createInterface({ input: process.stdin }).on('line', async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  if (id === undefined) return;                                   // notifications need no reply
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'naffy-poterminie', version: '1.0.0' } } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool' } });
      try { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(await tool.run(params.arguments || {}), null, 2) }] } }); }
      catch (e) { return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(e.message || e) }] } }); }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e.message || e) } }); }
});
