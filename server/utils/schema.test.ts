import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeTurtleSchema } from "./schema.js";

describe("analyzeTurtleSchema", () => {
  it("keeps predicate IRIs but ignores object URLs in customProperties", () => {
    const turtle = `
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ex: <http://example.com/> .

ex:dataset a dcat:Dataset ;
  dcat:title "Example" ;
  foaf:homepage <http://costezki.ro> ;
  foaf:name "me" ;
  dcterms:relation <http://makxdekkers.com/> .
`;

    const analysis = analyzeTurtleSchema(turtle);

    expect(analysis.customProperties).toContain("http://xmlns.com/foaf/0.1/homepage");
    expect(analysis.customProperties).toContain("http://xmlns.com/foaf/0.1/name");
    expect(analysis.customProperties).toContain("http://purl.org/dc/terms/relation");
    expect(analysis.customProperties).not.toContain("http://costezki.ro");
    expect(analysis.customProperties).not.toContain("http://makxdekkers.com/");
  });

  it("detects distribution byteSize from predicate usage", () => {
    const turtle = `
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix ex: <http://example.com/> .

ex:dataset a dcat:Dataset ;
  dcat:byteSize 42 .
`;

    const analysis = analyzeTurtleSchema(turtle);

    expect(analysis.dcatKeys).toContain("distribution.byteSize");
  });

  it("keeps unmapped dcat predicates in DCAT keys", () => {
    const turtle = `
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix ex: <http://example.com/> .

ex:dataset a dcat:Dataset ;
  dcat:someFutureProperty "value" .
`;

    const analysis = analyzeTurtleSchema(turtle);

    expect(analysis.dcatKeys).toContain("dcat.someFutureProperty");
    expect(analysis.customProperties).not.toContain("http://www.w3.org/ns/dcat#someFutureProperty");
  });

  it("analyzes bundled DCAT preset as DCAT", () => {
    const turtle = readFileSync(join(process.cwd(), "public/schemas/dcat.ttl"), "utf8");

    const analysis = analyzeTurtleSchema(turtle);

    expect(analysis.usesDcat).toBe(true);
    expect(analysis.dcatKeys).toContain("dataset.description");
    expect(analysis.dcatKeys).toContain("dataset.distribution");
    expect(analysis.dcatKeys).toContain("distribution.byteSize");
    expect(analysis.customProperties).not.toContain("http://www.w3.org/ns/dcat#byteSize");
  });

  it("infers inherited class properties through rdfs:subClassOf and rdfs:domain", () => {
    const turtle = `
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix ex: <http://example.com/> .

dcat:Distribution rdfs:subClassOf dcat:Dataset .
dcat:inheritedProp a rdf:Property ;
  rdfs:domain dcat:Dataset .

ex:dist a dcat:Distribution ;
  dcat:inheritedProp "ok" .
`;

    const analysis = analyzeTurtleSchema(turtle);

    expect(analysis.dcatKeys).toContain("distribution.inheritedProp");
  });

  it("infers domains inherited through rdfs:subPropertyOf", () => {
    const turtle = `
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix ex: <http://example.com/> .

dcat:parentProp a rdf:Property ;
  rdfs:domain dcat:Distribution .

dcat:childProp a rdf:Property ;
  rdfs:subPropertyOf dcat:parentProp .

ex:dist a dcat:Distribution ;
  dcat:childProp "ok" .
`;

    const analysis = analyzeTurtleSchema(turtle);

    expect(analysis.dcatKeys).toContain("distribution.childProp");
  });
});
