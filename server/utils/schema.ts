import type { SchemaAnalysis } from "~~/shared/types/schema";
import { Parser } from "n3";

const NAMESPACE_IRIS = {
  dcat: "http://www.w3.org/ns/dcat#",
  dcterms: "http://purl.org/dc/terms/",
  prov: "http://www.w3.org/ns/prov#",
  foaf: "http://xmlns.com/foaf/0.1/",
  vcard: "http://www.w3.org/2006/vcard/ns#",
};

const KNOWN_NAMESPACE_LIST = Object.values(NAMESPACE_IRIS);

const CLASS_IRIS = {
  Dataset: "http://www.w3.org/ns/dcat#Dataset",
  Distribution: "http://www.w3.org/ns/dcat#Distribution",
  DataService: "http://www.w3.org/ns/dcat#DataService",
  CatalogRecord: "http://www.w3.org/ns/dcat#CatalogRecord",
};

const CLASS_IRI_SET = new Set(Object.values(CLASS_IRIS));

const CLASS_PREFIX: Record<string, string> = {
  Dataset: "dataset",
  Distribution: "distribution",
  DataService: "dataService",
  CatalogRecord: "catalogRecord",
};

const IRI_TO_KEYS = new Map<string, string[]>();

function addMapping(iri: string, keys: string[]) {
  IRI_TO_KEYS.set(iri, keys);
}

addMapping(`${NAMESPACE_IRIS.dcterms}title`, ["dataset.title", "distribution.title", "catalogRecord.title"]);
addMapping(`${NAMESPACE_IRIS.dcterms}description`, ["dataset.description", "distribution.description", "catalogRecord.description"]);
addMapping(`${NAMESPACE_IRIS.dcterms}identifier`, ["dataset.identifier"]);
addMapping(`${NAMESPACE_IRIS.dcterms}issued`, ["dataset.issued", "distribution.issued", "catalogRecord.issued"]);
addMapping(`${NAMESPACE_IRIS.dcterms}modified`, ["dataset.modified", "distribution.modified", "catalogRecord.modified"]);
addMapping(`${NAMESPACE_IRIS.dcterms}language`, ["dataset.language", "distribution.language", "catalogRecord.language"]);
addMapping(`${NAMESPACE_IRIS.dcterms}publisher`, ["dataset.publisher"]);
addMapping(`${NAMESPACE_IRIS.dcterms}creator`, ["dataset.creator"]);
addMapping(`${NAMESPACE_IRIS.dcterms}rightsHolder`, ["dataset.rightsHolder"]);
addMapping(`${NAMESPACE_IRIS.dcterms}license`, ["dataset.license", "distribution.license"]);
addMapping(`${NAMESPACE_IRIS.dcterms}rights`, ["dataset.rights", "distribution.rights"]);
addMapping(`${NAMESPACE_IRIS.dcterms}accessRights`, ["dataset.accessRights"]);
addMapping(`${NAMESPACE_IRIS.dcterms}conformsTo`, ["dataset.conformsTo", "distribution.conformsTo", "catalogRecord.conformsTo"]);
addMapping(`${NAMESPACE_IRIS.dcterms}type`, ["dataset.type"]);
addMapping(`${NAMESPACE_IRIS.dcterms}spatial`, ["dataset.spatial", "distribution.spatial"]);
addMapping(`${NAMESPACE_IRIS.dcterms}temporal`, ["dataset.temporal", "distribution.temporal"]);
addMapping(`${NAMESPACE_IRIS.dcterms}accrualPeriodicity`, ["dataset.accrualPeriodicity"]);
addMapping(`${NAMESPACE_IRIS.dcterms}format`, ["distribution.format"]);

addMapping(`${NAMESPACE_IRIS.dcat}keyword`, ["dataset.keyword"]);
addMapping(`${NAMESPACE_IRIS.dcat}theme`, ["dataset.theme"]);
addMapping(`${NAMESPACE_IRIS.dcat}contactPoint`, ["dataset.contactPoint"]);
addMapping(`${NAMESPACE_IRIS.dcat}landingPage`, ["dataset.landingPage"]);
addMapping(`${NAMESPACE_IRIS.dcat}distribution`, ["dataset.distribution"]);
addMapping(`${NAMESPACE_IRIS.dcat}inCatalog`, ["dataset.inCatalog"]);
addMapping(`${NAMESPACE_IRIS.dcat}qualifiedRelation`, ["dataset.qualifiedRelation"]);
addMapping(`${NAMESPACE_IRIS.dcat}version`, ["dataset.version"]);
addMapping(`${NAMESPACE_IRIS.dcat}versionNotes`, ["dataset.versionNotes"]);
addMapping(`${NAMESPACE_IRIS.dcat}hasVersion`, ["dataset.hasVersion"]);
addMapping(`${NAMESPACE_IRIS.dcat}isVersionOf`, ["dataset.isVersionOf"]);
addMapping(`${NAMESPACE_IRIS.dcat}hasCurrentVersion`, ["dataset.hasCurrentVersion"]);
addMapping(`${NAMESPACE_IRIS.dcat}previousVersion`, ["dataset.previousVersion"]);
addMapping(`${NAMESPACE_IRIS.dcat}nextVersion`, ["dataset.nextVersion"]);
addMapping(`${NAMESPACE_IRIS.dcat}inSeries`, ["dataset.inSeries"]);
addMapping(`${NAMESPACE_IRIS.dcat}prev`, ["dataset.prev"]);
addMapping(`${NAMESPACE_IRIS.dcat}next`, ["dataset.next"]);
addMapping(`${NAMESPACE_IRIS.dcat}first`, ["dataset.first"]);
addMapping(`${NAMESPACE_IRIS.dcat}last`, ["dataset.last"]);
addMapping(`${NAMESPACE_IRIS.dcat}spatialResolutionInMeters`, ["dataset.spatialResolutionInMeters", "distribution.spatialResolutionInMeters"]);
addMapping(`${NAMESPACE_IRIS.dcat}temporalResolution`, ["dataset.temporalResolution", "distribution.temporalResolution"]);
addMapping(`${NAMESPACE_IRIS.dcat}accessURL`, ["distribution.accessURL"]);
addMapping(`${NAMESPACE_IRIS.dcat}downloadURL`, ["distribution.downloadURL"]);
addMapping(`${NAMESPACE_IRIS.dcat}accessService`, ["distribution.accessService"]);
addMapping(`${NAMESPACE_IRIS.dcat}mediaType`, ["distribution.mediaType"]);
addMapping(`${NAMESPACE_IRIS.dcat}compressFormat`, ["distribution.compressFormat"]);
addMapping(`${NAMESPACE_IRIS.dcat}packageFormat`, ["distribution.packageFormat"]);
addMapping(`${NAMESPACE_IRIS.dcat}byteSize`, ["distribution.byteSize"]);
addMapping(`${NAMESPACE_IRIS.dcat}endpointURL`, ["dataService.endpointURL"]);
addMapping(`${NAMESPACE_IRIS.dcat}endpointDescription`, ["dataService.endpointDescription"]);
addMapping(`${NAMESPACE_IRIS.dcat}servesDataset`, ["dataService.servesDataset"]);
addMapping(`${NAMESPACE_IRIS.dcat}primaryTopic`, ["catalogRecord.primaryTopic"]);
addMapping(`${NAMESPACE_IRIS.dcat}status`, ["catalogRecord.status"]);
addMapping(`${NAMESPACE_IRIS.dcat}source`, ["catalogRecord.source"]);

addMapping(`${NAMESPACE_IRIS.prov}wasAttributedTo`, ["dataset.wasAttributedTo"]);
addMapping(`${NAMESPACE_IRIS.prov}qualifiedAttribution`, ["dataset.qualifiedAttribution"]);

const PREFIX_DECLARATION = /@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\./g;
const PREFIX_DECLARATION_ALT = /PREFIX\s+([A-Za-z][\w-]*):\s*<([^>]+)>/gi;
const PREFIXED_NAME = /\b([A-Za-z][\w-]*):([A-Za-z_][\w-]*)\b/g;
const IRI_LITERAL = /<([^>]+)>/g;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

function collectPrefixes(turtle: string): Record<string, string> {
  const prefixMap: Record<string, string> = {};
  for (const match of turtle.matchAll(PREFIX_DECLARATION)) {
    if (!match[1] || !match[2]) continue;
    prefixMap[match[1]] = match[2];
  }
  for (const match of turtle.matchAll(PREFIX_DECLARATION_ALT)) {
    if (!match[1] || !match[2]) continue;
    prefixMap[match[1]] = match[2];
  }
  return prefixMap;
}

function resolvePrefixedName(prefixMap: Record<string, string>, prefix: string, local: string): string | null {
  const iriBase = prefixMap[prefix];
  if (!iriBase) return null;
  return `${iriBase}${local}`;
}

function isKnownNamespace(iri: string): boolean {
  return KNOWN_NAMESPACE_LIST.some(ns => iri.startsWith(ns));
}

function dcatSyntheticKey(iri: string): string | null {
  if (!iri.startsWith(NAMESPACE_IRIS.dcat)) return null;
  const local = iri.slice(NAMESPACE_IRIS.dcat.length);
  return local ? `dcat.${local}` : null;
}

function filterKeysByClassHints(keys: string[], classHints: Set<string>): string[] {
  if (classHints.size === 0) return keys;
  return keys.filter(key => {
    const prefix = key.split(".")[0] ?? "";
    for (const classHint of classHints) {
      if (CLASS_PREFIX[classHint] === prefix) return true;
    }
    return false;
  });
}

function addClassHintsFromIris(iris: Set<string>, classHints: Set<string>) {
  for (const [className, classIri] of Object.entries(CLASS_IRIS)) {
    if (iris.has(classIri)) {
      classHints.add(className);
    }
  }
}

function addClassHintsFromPredicates(predicateIris: Set<string>, classHints: Set<string>) {
  for (const iri of predicateIris) {
    const keys = IRI_TO_KEYS.get(iri);
    if (!keys) continue;

    const prefixes = new Set(
      keys
        .map(key => key.split('.')[0])
        .filter((prefix): prefix is string => !!prefix)
    );
    if (prefixes.size !== 1) continue;

    const prefix = [...prefixes][0];
    const className = Object.entries(CLASS_PREFIX).find(([, value]) => value === prefix)?.[0];
    if (className) {
      classHints.add(className);
    }
  }
}

function addClassHintsFromText(turtle: string, classHints: Set<string>) {
  for (const className of Object.keys(CLASS_IRIS)) {
    if (turtle.match(new RegExp(`\\b${className}\\b`))) {
      classHints.add(className);
    }
  }
}

function parseTurtleIris(turtle: string): { iris: Set<string>; predicateIris: Set<string>; classHints: Set<string> } | null {
  try {
    const parser = new Parser();
    const quads = parser.parse(turtle);
    const iris = new Set<string>();
    const predicateIris = new Set<string>();
    const classHints = new Set<string>();

    for (const quad of quads) {
      const subject = quad.subject;
      const predicate = quad.predicate;
      const object = quad.object;

      if (subject.termType === "NamedNode") iris.add(subject.value);
      if (predicate.termType === "NamedNode") {
        iris.add(predicate.value);
        predicateIris.add(predicate.value);
      }
      if (object.termType === "NamedNode") iris.add(object.value);

      if (predicate.termType === "NamedNode" && predicate.value === RDF_TYPE && object.termType === "NamedNode") {
        for (const [className, classIri] of Object.entries(CLASS_IRIS)) {
          if (object.value === classIri) classHints.add(className);
        }
      }
    }

    return { iris, predicateIris, classHints };
  } catch {
    return null;
  }
}

export function analyzeTurtleSchema(turtle: string): SchemaAnalysis {
  const parsed = parseTurtleIris(turtle);
  const prefixMap = collectPrefixes(turtle);
  const iris = parsed?.iris ?? new Set<string>();
  const predicateIris = parsed?.predicateIris ?? new Set<string>();
  const classHints = parsed?.classHints ?? new Set<string>();

  if (!parsed) {
    for (const match of turtle.matchAll(IRI_LITERAL)) {
      const iri = match[1];
      if (iri) iris.add(iri);
    }

    for (const match of turtle.matchAll(PREFIXED_NAME)) {
      const prefix = match[1];
      const local = match[2];
      if (!prefix || !local) continue;
      const iri = resolvePrefixedName(prefixMap, prefix, local);
      if (iri) iris.add(iri);
    }

    addClassHintsFromText(turtle, classHints);
  }

  addClassHintsFromIris(iris, classHints);
  addClassHintsFromPredicates(predicateIris, classHints);

  const dcatKeys = new Set<string>();
  const dcatIris = new Set<string>();
  const customProperties = new Set<string>();

  for (const iri of iris) {
    if (CLASS_IRI_SET.has(iri)) {
      continue;
    }

    if (isKnownNamespace(iri)) {
      dcatIris.add(iri);
      const keys = IRI_TO_KEYS.get(iri);
      if (keys) {
        const filteredKeys = filterKeysByClassHints(keys, classHints);
        for (const key of filteredKeys) {
          dcatKeys.add(key);
        }
      } else if (predicateIris.has(iri)) {
        const syntheticKey = dcatSyntheticKey(iri);
        if (syntheticKey) {
          dcatKeys.add(syntheticKey);
        } else {
          customProperties.add(iri);
        }
      }
    } else if (predicateIris.has(iri) && (iri.startsWith("http://") || iri.startsWith("https://"))) {
      customProperties.add(iri);
    }
  }

  return {
    usesDcat: dcatIris.size > 0,
    dcatKeys: [...dcatKeys],
    dcatIris: [...dcatIris],
    customProperties: [...customProperties],
    classHints: [...classHints],
  };
}
