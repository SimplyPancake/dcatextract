import type { SchemaAnalysis } from "~~/shared/types/schema";
import { Parser } from "n3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type SetMap = Map<string, Set<string>>;

const NS = {
  dcat: "http://www.w3.org/ns/dcat#",
  dcterms: "http://purl.org/dc/terms/",
  prov: "http://www.w3.org/ns/prov#",
} as const;

const RDF = {
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  Property: "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property",
} as const;

const RDFS = {
  Class: "http://www.w3.org/2000/01/rdf-schema#Class",
  subClassOf: "http://www.w3.org/2000/01/rdf-schema#subClassOf",
  domain: "http://www.w3.org/2000/01/rdf-schema#domain",
  subPropertyOf: "http://www.w3.org/2000/01/rdf-schema#subPropertyOf",
} as const;

const OWL = {
  Class: "http://www.w3.org/2002/07/owl#Class",
  ObjectProperty: "http://www.w3.org/2002/07/owl#ObjectProperty",
  DatatypeProperty: "http://www.w3.org/2002/07/owl#DatatypeProperty",
} as const;

const INFRASTRUCTURE_NS = new Set([
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://www.w3.org/2000/01/rdf-schema#",
  "http://www.w3.org/2002/07/owl#",
  "http://www.w3.org/2001/XMLSchema#",
  "http://www.w3.org/2004/02/skos/core#",
  "http://www.w3.org/ns/org#",
  "http://www.w3.org/1999/xhtml/vocab#",
  "http://www.w3.org/ns/prov#",
  "http://xmlns.com/foaf/0.1/",
  "http://purl.org/dc/terms/",
  "http://purl.org/pav/",
  "http://purl.org/ontology/bibo/",
  "http://purl.org/vocab/vann/",
  "http://schema.org/",
]);

const CLASS_IRIS: Record<string, string> = {
  Dataset: `${NS.dcat}Dataset`,
  Distribution: `${NS.dcat}Distribution`,
  DataService: `${NS.dcat}DataService`,
  CatalogRecord: `${NS.dcat}CatalogRecord`,
};

const CLASS_TO_PREFIX: Record<string, string> = {
  Dataset: "dataset",
  Distribution: "distribution",
  DataService: "dataService",
  CatalogRecord: "catalogRecord",
};

const CURATED_OVERRIDES = new Map<string, string[]>([
  // dcat: namespace
  [`${NS.dcat}keyword`, ["dataset.keyword"]],
  [`${NS.dcat}theme`, ["dataset.theme"]],
  [`${NS.dcat}contactPoint`, ["dataset.contactPoint"]],
  [`${NS.dcat}landingPage`, ["dataset.landingPage"]],
  [`${NS.dcat}distribution`, ["dataset.distribution"]],
  [`${NS.dcat}qualifiedRelation`, ["dataset.qualifiedRelation"]],
  [`${NS.dcat}version`, ["dataset.version"]],
  [`${NS.dcat}hasVersion`, ["dataset.hasVersion"]],
  [`${NS.dcat}isVersionOf`, ["dataset.isVersionOf"]],
  [`${NS.dcat}previousVersion`, ["dataset.previousVersion"]],
  [`${NS.dcat}nextVersion`, ["dataset.nextVersion"]],
  [`${NS.dcat}accessURL`, ["distribution.accessURL"]],
  [`${NS.dcat}downloadURL`, ["distribution.downloadURL"]],
  [`${NS.dcat}mediaType`, ["distribution.mediaType"]],
  [`${NS.dcat}byteSize`, ["distribution.byteSize"]],
  [`${NS.dcat}endpointURL`, ["dataService.endpointURL"]],
  [`${NS.dcat}endpointDescription`, ["dataService.endpointDescription"]],
  [`${NS.dcat}servesDataset`, ["dataService.servesDataset"]],
  [`${NS.dcat}primaryTopic`, ["catalogRecord.primaryTopic"]],
  [`${NS.dcat}inSeries`, ["dataset.inSeries"]],
  [`${NS.dcat}prev`, ["dataset.prev"]],
  [`${NS.dcat}next`, ["dataset.next"]],
  [`${NS.dcat}first`, ["dataset.first"]],
  [`${NS.dcat}last`, ["dataset.last"]],
  [`${NS.dcat}inCatalog`, ["dataset.inCatalog"]],
  [`${NS.dcat}accessService`, ["distribution.accessService"]],
  [`${NS.dcat}compressFormat`, ["distribution.compressFormat"]],
  [`${NS.dcat}packageFormat`, ["distribution.packageFormat"]],
  [`${NS.dcat}spatial`, ["dataset.spatial", "distribution.spatial"]],
  [`${NS.dcat}temporal`, ["dataset.temporal", "distribution.temporal"]],
  // dcterms: namespace — properties DCAT recommends but doesn't own
  [`${NS.dcterms}title`, ["dataset.title", "distribution.title", "dataService.title", "catalogRecord.title"]],
  [`${NS.dcterms}description`, ["dataset.description", "distribution.description", "dataService.description", "catalogRecord.description"]],
  [`${NS.dcterms}issued`, ["dataset.issued", "distribution.issued", "catalogRecord.issued"]],
  [`${NS.dcterms}modified`, ["dataset.modified", "distribution.modified", "catalogRecord.modified"]],
  [`${NS.dcterms}language`, ["dataset.language", "distribution.language", "catalogRecord.language"]],
  [`${NS.dcterms}publisher`, ["dataset.publisher"]],
  [`${NS.dcterms}creator`, ["dataset.creator"]],
  [`${NS.dcterms}license`, ["dataset.license", "distribution.license"]],
  [`${NS.dcterms}rights`, ["dataset.rights", "distribution.rights"]],
  [`${NS.dcterms}accessRights`, ["dataset.accessRights"]],
  [`${NS.dcterms}identifier`, ["dataset.identifier"]],
  [`${NS.dcterms}type`, ["dataset.type"]],
  [`${NS.dcterms}conformsTo`, ["dataset.conformsTo", "distribution.conformsTo", "catalogRecord.conformsTo"]],
  [`${NS.dcterms}accrualPeriodicity`, ["dataset.accrualPeriodicity"]],
  [`${NS.dcterms}spatial`, ["dataset.spatial"]],
  [`${NS.dcterms}temporal`, ["dataset.temporal"]],
  [`${NS.dcterms}format`, ["distribution.format"]],
  [`${NS.dcterms}source`, ["catalogRecord.source"]],
  [`${NS.dcterms}rightsHolder`, ["dataset.rightsHolder"]],
  // prov: namespace
  [`${NS.prov}wasAttributedTo`, ["dataset.wasAttributedTo"]],
  [`${NS.prov}qualifiedAttribution`, ["dataset.qualifiedAttribution"]],
  // Dataset
[`${NS.dcat}hasCurrentVersion`, ["dataset.hasCurrentVersion"]],
[`http://www.w3.org/ns/adms#versionNotes`, ["dataset.versionNotes"]],
[`${NS.dcat}spatialResolutionInMeters`, ["dataset.spatialResolutionInMeters", "distribution.spatialResolutionInMeters"]],
[`${NS.dcat}temporalResolution`, ["dataset.temporalResolution", "distribution.temporalResolution"]],

// CatalogRecord
[`http://www.w3.org/ns/adms#status`, ["catalogRecord.status"]],
]);

interface OntologyGraph {
  classes: Set<string>;
  properties: Set<string>;
  subclassMap: SetMap;
  subPropertyMap: SetMap;
  propertyDomains: SetMap;
}

interface ParseResult {
  ontology: OntologyGraph;
  predicateIris: Set<string>;
  classHints: Set<string>;
}

function isInfra(iri: string): boolean {
  return [...INFRASTRUCTURE_NS].some(ns => iri.startsWith(ns));
}

function addToMap(map: SetMap, key: string, value: string) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(value);
}

function emptyGraph(): OntologyGraph {
  return {
    classes: new Set(),
    properties: new Set(),
    subclassMap: new Map(),
    subPropertyMap: new Map(),
    propertyDomains: new Map(),
  };
}

function getBaseOntologyGraph(): OntologyGraph {
  const graph = emptyGraph();
  const schemaDir = join(process.cwd(), "public", "schemas");
  const files = ["dcat.ttl", "dcterms.ttl", "prov.ttl", "foaf.ttl", "dcmitype.ttl", "adms.ttl"];

  for (const file of files) {
    try {
      const turtle = readFileSync(join(schemaDir, file), "utf8");
      const parsed = parseTurtle(turtle);
      if (!parsed) continue;
      mergeInto(graph, parsed.ontology);
    } catch {}
  }

  return graph;
}

function mergeInto(target: OntologyGraph, src: OntologyGraph) {
  for (const v of src.classes) target.classes.add(v);
  for (const v of src.properties) target.properties.add(v);

  for (const [k, set] of src.subclassMap)
    for (const v of set) addToMap(target.subclassMap, k, v);

  for (const [k, set] of src.subPropertyMap)
    for (const v of set) addToMap(target.subPropertyMap, k, v);

  for (const [k, set] of src.propertyDomains)
    for (const v of set) addToMap(target.propertyDomains, k, v);
}

function parseTurtle(turtle: string): ParseResult | null {
  try {
    const parser = new Parser();
    const quads = parser.parse(turtle);

    const ontology = emptyGraph();
    const predicateIris = new Set<string>();
    const classHints = new Set<string>();

    for (const q of quads) {
      const { subject: s, predicate: p, object: o } = q;

      if (p.termType !== "NamedNode") continue;
      predicateIris.add(p.value);
      if (s.termType !== "NamedNode") continue;

      if (p.value === RDF.type && o.termType === "NamedNode") {
        if (o.value === OWL.Class || o.value === RDFS.Class)
          ontology.classes.add(s.value);
        if (
          o.value === RDF.Property ||
          o.value === OWL.ObjectProperty ||
          o.value === OWL.DatatypeProperty
        )
          ontology.properties.add(s.value);
      }

      if (o.termType !== "NamedNode") continue;

      if (p.value === RDFS.subClassOf) addToMap(ontology.subclassMap, s.value, o.value);
      if (p.value === RDFS.domain) addToMap(ontology.propertyDomains, o.value, s.value);
      if (p.value === RDFS.subPropertyOf) addToMap(ontology.subPropertyMap, s.value, o.value);
    }

    return { ontology, predicateIris, classHints };
  } catch {
    return null;
  }
}

function closure(start: string, map: SetMap, cache: Map<string, Set<string>>) {
  if (cache.has(start)) return cache.get(start)!;

  const res = new Set<string>([start]);
  const stack = [start];

  while (stack.length) {
    const cur = stack.pop()!;
    const parents = map.get(cur);
    if (!parents) continue;
    for (const p of parents) {
      if (!res.has(p)) {
        res.add(p);
        stack.push(p);
      }
    }
  }

  cache.set(start, res);
  return res;
}

function localNameFromIri(iri: string): string | null {
  const hash = iri.lastIndexOf("#");
  const slash = iri.lastIndexOf("/");
  const idx = Math.max(hash, slash);
  if (idx < 0 || idx === iri.length - 1) return null;
  return iri.slice(idx + 1);
}

function buildPropertyKeyMap(graph: OntologyGraph) {
  const keysByProperty = new Map<string, Set<string>>();

  const classCache = new Map<string, Set<string>>();
  const propertyCache = new Map<string, Set<string>>();
  const classClosureCache = new Map<string, Set<string>>();

  // STEP 1: expand DCAT class hierarchy downward (subclasses of DCAT classes)
  const expandedClasses = new Set<string>();
  for (const c of Object.values(CLASS_IRIS)) {
    for (const cls of closure(c, graph.subclassMap, classClosureCache)) {
      expandedClasses.add(cls);
    }
  }

  // STEP 2: expand property domains — for each domain, also include its subclasses
  const expandedPropertyDomains = new Map<string, Set<string>>();
  for (const [domain, props] of graph.propertyDomains) {
    const domainClosure = closure(domain, graph.subclassMap, classCache);
    for (const d of domainClosure) {
      for (const p of props) {
        if (!expandedPropertyDomains.has(d)) expandedPropertyDomains.set(d, new Set());
        expandedPropertyDomains.get(d)!.add(p);
      }
    }
  }

  const resolveProperty = (p: string) => closure(p, graph.subPropertyMap, propertyCache);

  const candidateProperties = new Set<string>(graph.properties);
  for (const props of graph.propertyDomains.values())
    for (const p of props) candidateProperties.add(p);

  // STEP 3: match properties against DCAT class closure, assign correct prefix per class
  for (const property of candidateProperties) {
    const fullPropertyChain = resolveProperty(property);
    const local = localNameFromIri(property);
    if (!local) continue;

    for (const [className, classIri] of Object.entries(CLASS_IRIS)) {
      const classClosure = closure(classIri, graph.subclassMap, classClosureCache);
      let matched = false;

      for (const p of fullPropertyChain) {
        for (const cls of classClosure) {
          if (expandedPropertyDomains.get(cls)?.has(p)) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      if (matched) {
        const prefix = CLASS_TO_PREFIX[className] ?? "dataset";
        addToMap(keysByProperty, property, `${prefix}.${local}`);
      }
    }
  }

  // STEP 4: curated overrides (dcterms/prov/foaf properties DCAT uses but doesn't own)
  for (const [iri, keys] of CURATED_OVERRIDES) {
    for (const key of keys) {
      addToMap(keysByProperty, iri, key);
    }
  }

  return keysByProperty;
}

export function analyzeTurtleSchema(turtle: string): SchemaAnalysis {
  const parsed = parseTurtle(turtle);
  const local = parsed?.ontology ?? emptyGraph();

  const base = getBaseOntologyGraph();
  const merged = emptyGraph();
  mergeInto(merged, base);
  mergeInto(merged, local);

  const keyMap = buildPropertyKeyMap(merged);

  // All inferred keys from the ontology graph (includes inherited properties)
  const allKeys = new Set<string>();
  const allIris = new Set<string>();
  for (const [iri, keys] of keyMap) {
    for (const k of keys) allKeys.add(k);
    allIris.add(iri);
  }

  // Custom = IRIs used in the input file that aren't in the keyMap
  const custom = new Set<string>();
  for (const iri of [...(parsed?.predicateIris ?? []), ...local.properties]) {
    if (!keyMap.has(iri) && !isInfra(iri) && !iri.startsWith(NS.dcat)) {
      custom.add(iri);
    }
  }

  allKeys.add("dataset.uri");
  allKeys.add("distribution.uri");
  allKeys.add("catalogRecord.uri");

  return {
    usesDcat: allIris.size > 0,
    dcatKeys: [...allKeys],
    dcatIris: [...allIris],
    customProperties: [...custom],
    classHints: [...(parsed?.classHints ?? [])],
  };
}