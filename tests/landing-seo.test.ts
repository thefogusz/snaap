import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type pg from "pg";
import { buildApp } from "../src/api.js";

test("landing structured data is linked, factual, and matches the readable answers", async () => {
  const html = await readFile(new URL("../dist/landing.html", import.meta.url), "utf8");
  const markup = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(markup);
  const schema = JSON.parse(markup[1]);
  assert.equal(schema["@context"], "https://schema.org");
  const graph = schema["@graph"];
  const ids = new Set(graph.map((node: any) => node["@id"]));
  assert.equal(ids.size, graph.length);
  for (const node of graph) {
    for (const property of ["publisher", "isPartOf", "mainEntity", "hasPart"]) {
      if (node[property]?.["@id"]) assert.ok(ids.has(node[property]["@id"]));
    }
  }
  const faq = graph.find((node: any) => node["@type"] === "FAQPage");
  for (const question of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`));
    assert.ok(html.includes(`<p>${question.acceptedAnswer.text}</p>`));
  }
  const app = graph.find((node: any) => node["@type"] === "WebApplication");
  assert.equal(app.applicationCategory, "FinanceApplication");
  assert.equal(app.aggregateRating, undefined);
  assert.equal(app.offers, undefined);
  assert.match(html, /rel="canonical" href="https:\/\/snaap.me\/"/);
});

test("public SEO assets are served while app and login pages are noindex", async () => {
  const db = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as pg.Pool;
  const { app } = await buildApp(db);
  const headers = { host: "127.0.0.1:4173" };
  try {
    for (const url of ["/", "/landing.html", "/privacy.html", "/terms.html", "/robots.txt", "/sitemap.xml", "/assets/snaap-social.png"]) {
      const response = await app.inject({ url, headers });
      assert.equal(response.statusCode, 200, url);
      assert.equal(response.headers["x-robots-tag"], undefined, url);
    }
    for (const url of ["/home", "/home/", "/index.html", "/login.html", "/admin/login", "/api/v1/me"]) {
      const response = await app.inject({ url, headers });
      assert.equal(response.headers["x-robots-tag"], "noindex, nofollow", url);
    }
    const sitemap = await app.inject({ url: "/sitemap.xml", headers });
    assert.deepEqual([...sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), ["https://snaap.me/", "https://snaap.me/privacy.html", "https://snaap.me/terms.html"]);
    const robots = await app.inject({ url: "/robots.txt", headers });
    assert.match(robots.body, /Sitemap: https:\/\/snaap.me\/sitemap.xml/);
    const image = await app.inject({ url: "/assets/snaap-social.png", headers });
    assert.equal(image.rawPayload.readUInt32BE(16), 1200);
    assert.equal(image.rawPayload.readUInt32BE(20), 630);
  } finally { await app.close(); }
});
