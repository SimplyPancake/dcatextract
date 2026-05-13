import type { SchemaAnalysis } from "~~/shared/types/schema";
import { Parser } from "n3";

// ─── Namespace constants ──────────────────────────────────────────────────────

const NS = {
  dcat:     "http://www.w3.org/ns/dcat#",
  dcterms:  "http://purl.org/dc/terms/",
  prov:     "http://www.w3.org/ns/prov#",
  foaf:     "http://xmlns.com/foaf/0.1/",
  vcard:    "http://www.w3.org/2006/vcard/ns#",
} as const;

/** Namespaces whose IRIs map to known DCAT keys. */
const KNOWN_NS = new Set(Object.values(NS));

/**
 * Namespaces used for ontology/schema infrastructure.
 * Predicates in these namespaces are never treated as custom dataset properties.
 */
const INFRASTRUCTURE_NS = new Set([
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://www.w3.org/2000/01/rdf-schema#",
  "http://www.w3.org/2002/07/owl#",
  "http://www.w3.org/2001/XMLSchema#",
  "http://www.w3.org/2004/02/skos/core#",
  "http://schema.org/",
  "http://xmlns.com/foaf/0.1/",
  "http://www.w3.org/ns/adms#",
  "http://purl.org/ontology/bibo/",
  "http://purl.org/vocab/vann/",
  "http://www.w3.org/ns/org#",
]);

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_CLASS  = "http://www.w3.org/2002/07/owl#Class";
const RDFS_CLASS = "http://www.w3.org/2000/01/rdf-schema#Class";

// ─── Class registry ───────────────────────────────────────────────────────────

const CLASS_IRIS: Record<string, string> = {
  Dataset:       `${NS.dcat}Dataset`,
  Distribution:  `${NS.dcat}Distribution`,
  DataService:   `${NS.dcat}DataService`,
  CatalogRecord: `${NS.dcat}CatalogRecord`,
};

const CLASS_IRI_SET = new Set(Object.values(CLASS_IRIS));

/** Maps class name → key prefix used in dcatKeys (e.g. "Dataset" → "dataset"). */
const CLASS_TO_PREFIX: Record<string, string> = {
  Dataset:       "dataset",
  Distribution:  "distribution",
  DataService:   "dataService",
  CatalogRecord: "catalogRecord",
};

// ─── IRI → dcatKey mappings ───────────────────────────────────────────────────

const IRI_TO_KEYS = new Map<string, string[]>();

function map(iri: string, ...keys: string[]) {
  IRI_TO_KEYS.set(iri, keys);
}

// dcterms
map(`${NS.dcterms}title`,              "dataset.title",              "distribution.title",    "catalogRecord.title");
map(`${NS.dcterms}description`,        "dataset.description",        "distribution.description", "catalogRecord.description");
map(`${NS.dcterms}identifier`,         "dataset.identifier");
map(`${NS.dcterms}issued`,             "dataset.issued",             "distribution.issued",   "catalogRecord.issued");
map(`${NS.dcterms}modified`,           "dataset.modified",           "distribution.modified", "catalogRecord.modified");
map(`${NS.dcterms}language`,           "dataset.language",           "distribution.language", "catalogRecord.language");
map(`${NS.dcterms}publisher`,          "dataset.publisher");
map(`${NS.dcterms}creator`,            "dataset.creator");
map(`${NS.dcterms}rightsHolder`,       "dataset.rightsHolder");
map(`${NS.dcterms}license`,            "dataset.license",            "distribution.license");
map(`${NS.dcterms}rights`,             "dataset.rights",             "distribution.rights");
map(`${NS.dcterms}accessRights`,       "dataset.accessRights");
map(`${NS.dcterms}conformsTo`,         "dataset.conformsTo",         "distribution.conformsTo", "catalogRecord.conformsTo");
map(`${NS.dcterms}type`,               "dataset.type");
map(`${NS.dcterms}spatial`,            "dataset.spatial",            "distribution.spatial");
map(`${NS.dcterms}temporal`,           "dataset.temporal",           "distribution.temporal");
map(`${NS.dcterms}accrualPeriodicity`, "dataset.accrualPeriodicity");
map(`${NS.dcterms}format`,             "distribution.format");

// dcat — dataset
map(`${NS.dcat}keyword`,                   "dataset.keyword");
map(`${NS.dcat}theme`,                     "dataset.theme");
map(`${NS.dcat}contactPoint`,              "dataset.contactPoint");
map(`${NS.dcat}landingPage`,               "dataset.landingPage");
map(`${NS.dcat}distribution`,              "dataset.distribution");
map(`${NS.dcat}inCatalog`,                 "dataset.inCatalog");
map(`${NS.dcat}qualifiedRelation`,         "dataset.qualifiedRelation");
map(`${NS.dcat}version`,                   "dataset.version");
map(`${NS.dcat}versionNotes`,              "dataset.versionNotes");
map(`${NS.dcat}hasVersion`,                "dataset.hasVersion");
map(`${NS.dcat}isVersionOf`,               "dataset.isVersionOf");
map(`${NS.dcat}hasCurrentVersion`,         "dataset.hasCurrentVersion");
map(`${NS.dcat}previousVersion`,           "dataset.previousVersion");
map(`${NS.dcat}nextVersion`,               "dataset.nextVersion");
map(`${NS.dcat}inSeries`,                  "dataset.inSeries");
map(`${NS.dcat}prev`,                      "dataset.prev");
map(`${NS.dcat}next`,                      "dataset.next");
map(`${NS.dcat}first`,                     "dataset.first");
map(`${NS.dcat}last`,                      "dataset.last");
map(`${NS.dcat}spatialResolutionInMeters`, "dataset.spatialResolutionInMeters", "distribution.spatialResolutionInMeters");
map(`${NS.dcat}temporalResolution`,        "dataset.temporalResolution",        "distribution.temporalResolution");

// dcat — distribution
map(`${NS.dcat}accessURL`,      "distribution.accessURL");
map(`${NS.dcat}downloadURL`,    "distribution.downloadURL");
map(`${NS.dcat}accessService`,  "distribution.accessService");
map(`${NS.dcat}mediaType`,      "distribution.mediaType");
map(`${NS.dcat}compressFormat`, "distribution.compressFormat");
map(`${NS.dcat}packageFormat`,  "distribution.packageFormat");
map(`${NS.dcat}byteSize`,       "distribution.byteSize");

// dcat — dataService
map(`${NS.dcat}endpointURL`,         "dataService.endpointURL");
map(`${NS.dcat}endpointDescription`, "dataService.endpointDescription");
map(`${NS.dcat}servesDataset`,       "dataService.servesDataset");

// dcat — catalogRecord
map(`${NS.dcat}primaryTopic`, "catalogRecord.primaryTopic");
map(`${NS.dcat}status`,       "catalogRecord.status");
map(`${NS.dcat}source`,       "catalogRecord.source");

// prov
map(`${NS.prov}wasAttributedTo`,      "dataset.wasAttributedTo");
map(`${NS.prov}qualifiedAttribution`, "dataset.qualifiedAttribution");

// ─── Prefix extraction (fallback text parser) ─────────────────────────────────

const RE_PREFIX     = /@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\./g;
const RE_PREFIX_ALT = /PREFIX\s+([A-Za-z][\w-]*):\s*<([^>]+)>/gi;
const RE_PREFIXED   = /\b([A-Za-z][\w-]*):([A-Za-z_][\w-]*)\b/g;
const RE_IRI        = /<([^>]+)>/g;

function collectPrefixes(turtle: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of turtle.matchAll(RE_PREFIX))     if (m[1] && m[2]) out.set(m[1], m[2]);
  for (const m of turtle.matchAll(RE_PREFIX_ALT)) if (m[1] && m[2]) out.set(m[1], m[2]);
  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isKnownNs(iri: string): boolean {
  for (const ns of KNOWN_NS) if (iri.startsWith(ns)) return true;
  return false;
}

function isInfrastructureNs(iri: string): boolean {
  for (const ns of INFRASTRUCTURE_NS) if (iri.startsWith(ns)) return true;
  return false;
}

function dcatSyntheticKey(iri: string): string | null {
  if (!iri.startsWith(NS.dcat)) return null;
  const local = iri.slice(NS.dcat.length);
  return local ? `dcat.${local}` : null;
}

/**
 * Filter keys by class hints.
 * In ontology mode (the uploaded file defines owl:Class / rdfs:Class terms)
 * all keys are returned unfiltered — every defined property should be matched
 * regardless of which class it nominally belongs to.
 */
function filterKeysByClassHints(
  keys: string[],
  classHints: Set<string>,
  isOntologyMode: boolean,
): string[] {
  if (isOntologyMode || classHints.size === 0) return keys;
  return keys.filter(key => {
    const prefix = key.split(".")[0] ?? "";
    for (const hint of classHints) {
      if (CLASS_TO_PREFIX[hint] === prefix) return true;
    }
    return false;
  });
}

// ─── Class hint helpers ───────────────────────────────────────────────────────

function addHintsFromIris(iris: Set<string>, hints: Set<string>) {
  for (const [name, iri] of Object.entries(CLASS_IRIS)) {
    if (iris.has(iri)) hints.add(name);
  }
}

function addHintsFromPredicates(predicates: Set<string>, hints: Set<string>) {
  for (const iri of predicates) {
    const keys = IRI_TO_KEYS.get(iri);
    if (!keys) continue;
    const prefixes = new Set(keys.map(k => k.split(".")[0]).filter(Boolean) as string[]);
    if (prefixes.size !== 1) continue;
    const prefix = [...prefixes][0]!;
    const name = Object.entries(CLASS_TO_PREFIX).find(([, v]) => v === prefix)?.[0];
    if (name) hints.add(name);
  }
}

function addHintsFromText(turtle: string, hints: Set<string>) {
  for (const name of Object.keys(CLASS_IRIS)) {
    if (new RegExp(`\\b${name}\\b`).test(turtle)) hints.add(name);
  }
}

// ─── Turtle parser ────────────────────────────────────────────────────────────

interface ParseResult {
  iris: Set<string>;
  predicateIris: Set<string>;
  classHints: Set<string>;
  /** True when the file uses owl:Class / rdfs:Class definitions (ontology file). */
  isOntologyMode: boolean;
}

function parseTurtleIris(turtle: string): ParseResult | null {
  try {
    const parser = new Parser();
    const quads  = parser.parse(turtle);

    const iris          = new Set<string>();
    const predicateIris = new Set<string>();
    const classHints    = new Set<string>();
    let   isOntologyMode = false;

    for (const quad of quads) {
      const { subject: s, predicate: p, object: o } = quad;

      if (s.termType === "NamedNode") iris.add(s.value);
      if (p.termType === "NamedNode") { iris.add(p.value); predicateIris.add(p.value); }
      if (o.termType === "NamedNode") iris.add(o.value);

      if (p.termType === "NamedNode" && p.value === RDF_TYPE && o.termType === "NamedNode") {
        for (const [name, iri] of Object.entries(CLASS_IRIS)) {
          if (o.value === iri) classHints.add(name);
        }
        if (o.value === OWL_CLASS || o.value === RDFS_CLASS) {
          isOntologyMode = true;
        }
      }
    }

    return { iris, predicateIris, classHints, isOntologyMode };
  } catch {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function analyzeTurtleSchema(turtle: string): SchemaAnalysis {
  const parsed        = parseTurtleIris(turtle);
  const iris          = parsed?.iris          ?? new Set<string>();
  const predicateIris = parsed?.predicateIris ?? new Set<string>();
  const classHints    = parsed?.classHints    ?? new Set<string>();
  const isOntologyMode = parsed?.isOntologyMode ?? false;

  // Fallback: regex-based IRI extraction when the N3 parser fails
  if (!parsed) {
    const prefixMap = collectPrefixes(turtle);
    for (const m of turtle.matchAll(RE_IRI))    if (m[1]) iris.add(m[1]);
    for (const m of turtle.matchAll(RE_PREFIXED)) {
      if (!m[1] || !m[2]) continue;
      const base = prefixMap.get(m[1]);
      if (base) iris.add(`${base}${m[2]}`);
    }
    addHintsFromText(turtle, classHints);
  }

  addHintsFromIris(iris, classHints);
  addHintsFromPredicates(predicateIris, classHints);

  const dcatKeys         = new Set<string>();
  const dcatIris         = new Set<string>();
  const customProperties = new Set<string>();

  for (const iri of iris) {
    if (CLASS_IRI_SET.has(iri)) continue;

    if (isKnownNs(iri)) {
      dcatIris.add(iri);
      const keys = IRI_TO_KEYS.get(iri);
      if (keys) {
        for (const key of filterKeysByClassHints(keys, classHints, isOntologyMode)) {
          dcatKeys.add(key);
        }
      } else if (predicateIris.has(iri)) {
        // Known namespace but unmapped predicate — try synthetic dcat.* key, else silently skip
        const synth = dcatSyntheticKey(iri);
        if (synth) dcatKeys.add(synth);
      }
    } else if (
      predicateIris.has(iri) &&
      !isInfrastructureNs(iri) &&
      (iri.startsWith("http://") || iri.startsWith("https://"))
    ) {
      customProperties.add(iri);
    }
  }

  return {
    usesDcat:         dcatIris.size > 0,
    dcatKeys:         [...dcatKeys],
    dcatIris:         [...dcatIris],
    customProperties: [...customProperties],
    classHints:       [...classHints],
  };
}