import { DataFactory, Writer } from "n3";
import type { FileProcessJobReturnType, ProcessedFields } from "~~/shared/types/workers";

type KnownValue = string | number | boolean | Record<string, any> | Array<any> | null | undefined;

const NS = {
  dcat: "http://www.w3.org/ns/dcat#",
  dcterms: "http://purl.org/dc/terms/",
  prov: "http://www.w3.org/ns/prov#",
  adms: "http://www.w3.org/ns/adms#",
  foaf: "http://xmlns.com/foaf/0.1/",
  skos: "http://www.w3.org/2004/02/skos/core#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
} as const;

const { namedNode, literal, blankNode } = DataFactory;

const DATASET_PREDICATES: Record<string, string> = {
  uri: "",
  title: `${NS.dcterms}title`,
  description: `${NS.dcterms}description`,
  identifier: `${NS.dcterms}identifier`,
  issued: `${NS.dcterms}issued`,
  modified: `${NS.dcterms}modified`,
  language: `${NS.dcterms}language`,
  publisher: `${NS.dcterms}publisher`,
  creator: `${NS.dcterms}creator`,
  wasAttributedTo: `${NS.prov}wasAttributedTo`,
  rightsHolder: `${NS.dcterms}rightsHolder`,
  license: `${NS.dcterms}license`,
  rights: `${NS.dcterms}rights`,
  accessRights: `${NS.dcterms}accessRights`,
  conformsTo: `${NS.dcterms}conformsTo`,
  type: `${NS.dcterms}type`,
  keyword: `${NS.dcat}keyword`,
  theme: `${NS.dcat}theme`,
  contactPoint: `${NS.dcat}contactPoint`,
  landingPage: `${NS.dcat}landingPage`,
  version: `${NS.dcat}version`,
  versionNotes: `${NS.adms}versionNotes`,
  hasVersion: `${NS.dcat}hasVersion`,
  isVersionOf: `${NS.dcat}isVersionOf`,
  hasCurrentVersion: `${NS.dcat}hasCurrentVersion`,
  previousVersion: `${NS.dcat}previousVersion`,
  nextVersion: `${NS.dcat}nextVersion`,
  qualifiedRelation: `${NS.dcat}qualifiedRelation`,
  qualifiedAttribution: `${NS.prov}qualifiedAttribution`,
  inCatalog: `${NS.dcat}inCatalog`,
  distribution: `${NS.dcat}distribution`,
  spatial: `${NS.dcterms}spatial`,
  spatialResolutionInMeters: `${NS.dcat}spatialResolutionInMeters`,
  temporal: `${NS.dcterms}temporal`,
  temporalResolution: `${NS.dcat}temporalResolution`,
  accrualPeriodicity: `${NS.dcterms}accrualPeriodicity`,
  inSeries: `${NS.dcat}inSeries`,
  prev: `${NS.dcat}prev`,
  next: `${NS.dcat}next`,
  first: `${NS.dcat}first`,
  last: `${NS.dcat}last`,
};

const DISTRIBUTION_PREDICATES: Record<string, string> = {
  uri: "",
  title: `${NS.dcterms}title`,
  description: `${NS.dcterms}description`,
  issued: `${NS.dcterms}issued`,
  modified: `${NS.dcterms}modified`,
  license: `${NS.dcterms}license`,
  rights: `${NS.dcterms}rights`,
  conformsTo: `${NS.dcterms}conformsTo`,
  language: `${NS.dcterms}language`,
  accessURL: `${NS.dcat}accessURL`,
  downloadURL: `${NS.dcat}downloadURL`,
  accessService: `${NS.dcat}accessService`,
  format: `${NS.dcterms}format`,
  mediaType: `${NS.dcat}mediaType`,
  compressFormat: `${NS.dcat}compressFormat`,
  packageFormat: `${NS.dcat}packageFormat`,
  byteSize: `${NS.dcat}byteSize`,
  spatialResolutionInMeters: `${NS.dcat}spatialResolutionInMeters`,
  temporalResolution: `${NS.dcat}temporalResolution`,
  spatial: `${NS.dcterms}spatial`,
  temporal: `${NS.dcterms}temporal`,
};

const DATA_SERVICE_PREDICATES: Record<string, string> = {
  uri: "",
  title: `${NS.dcterms}title`,
  description: `${NS.dcterms}description`,
  endpointURL: `${NS.dcat}endpointURL`,
  endpointDescription: `${NS.dcat}endpointDescription`,
  servesDataset: `${NS.dcat}servesDataset`,
};

const CATALOG_RECORD_PREDICATES: Record<string, string> = {
  uri: "",
  primaryTopic: `${NS.foaf}primaryTopic`,
  title: `${NS.dcterms}title`,
  description: `${NS.dcterms}description`,
  issued: `${NS.dcterms}issued`,
  modified: `${NS.dcterms}modified`,
  language: `${NS.dcterms}language`,
  conformsTo: `${NS.dcterms}conformsTo`,
  status: `${NS.adms}status`,
  source: `${NS.dcterms}source`,
};

function isIriValue(value: string): boolean {
  return /^(https?:|urn:|mailto:)/i.test(value);
}

function isPeriodOfTime(value: Record<string, any>): boolean {
  return "startDate" in value || "endDate" in value;
}

function isLocation(value: Record<string, any>): boolean {
  return "bbox" in value || "centroid" in value || "geometry" in value;
}

function isAgent(value: Record<string, any>): boolean {
  return "uri" in value || "name" in value || "homepage" in value;
}

function isConcept(value: Record<string, any>): boolean {
  return "uri" in value || "prefLabel" in value;
}

function literalForValue(value: string | number | boolean): ReturnType<typeof literal> {
  if (typeof value === "number") {
    return literal(String(value), namedNode(`${NS.xsd}decimal`));
  }
  if (typeof value === "boolean") {
    return literal(value ? "true" : "false", namedNode(`${NS.xsd}boolean`));
  }
  if (typeof value === "string") {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
    if (dateTime.test(value)) {
      return literal(value, namedNode(`${NS.xsd}dateTime`));
    }
    if (dateOnly.test(value)) {
      return literal(value, namedNode(`${NS.xsd}date`));
    }
  }
  return literal(String(value));
}

function valueToTerm(value: string | number | boolean) {
  if (typeof value === "string" && isIriValue(value)) return namedNode(value);
  return literalForValue(value);
}

function getValue(fields: ProcessedFields, key: string): KnownValue {
  return fields[key]?.result?.value ?? null;
}

function subjectFromFields(fields: ProcessedFields, uriKey: string) {
  const uriValue = getValue(fields, uriKey);
  if (typeof uriValue === "string" && isIriValue(uriValue)) {
    return namedNode(uriValue);
  }
  return blankNode();
}

function addPeriodOfTime(writer: Writer, subject: any, predicate: string, value: Record<string, any>) {
  const node = blankNode();
  writer.addQuad(subject, namedNode(predicate), node);

  if (value.startDate) {
    writer.addQuad(node, namedNode(`${NS.dcat}startDate`), literalForValue(value.startDate));
  }
  if (value.endDate) {
    writer.addQuad(node, namedNode(`${NS.dcat}endDate`), literalForValue(value.endDate));
  }
}

function addLocation(writer: Writer, subject: any, predicate: string, value: Record<string, any>) {
  const node = blankNode();
  writer.addQuad(subject, namedNode(predicate), node);

  if (value.bbox) {
    writer.addQuad(node, namedNode(`${NS.dcat}bbox`), literalForValue(value.bbox));
  }
  if (value.centroid) {
    writer.addQuad(node, namedNode(`${NS.dcat}centroid`), literalForValue(value.centroid));
  }
  if (value.geometry) {
    const term = typeof value.geometry === "string" && isIriValue(value.geometry)
      ? namedNode(value.geometry)
      : literalForValue(value.geometry);
    writer.addQuad(node, namedNode(`${NS.dcat}geometry`), term);
  }
}

function addAgent(writer: Writer, subject: any, predicate: string, value: Record<string, any>) {
  const node = typeof value.uri === "string" && isIriValue(value.uri)
    ? namedNode(value.uri)
    : blankNode();

  writer.addQuad(subject, namedNode(predicate), node);
  writer.addQuad(node, namedNode(`${NS.rdf}type`), namedNode(`${NS.foaf}Agent`));

  if (value.name) {
    writer.addQuad(node, namedNode(`${NS.foaf}name`), literalForValue(value.name));
  }
  if (value.homepage) {
    const homepageTerm = typeof value.homepage === "string" && isIriValue(value.homepage)
      ? namedNode(value.homepage)
      : literalForValue(value.homepage);
    writer.addQuad(node, namedNode(`${NS.foaf}homepage`), homepageTerm);
  }
}

function addConcept(writer: Writer, subject: any, predicate: string, value: Record<string, any>) {
  const node = typeof value.uri === "string" && isIriValue(value.uri)
    ? namedNode(value.uri)
    : blankNode();

  writer.addQuad(subject, namedNode(predicate), node);
  writer.addQuad(node, namedNode(`${NS.rdf}type`), namedNode(`${NS.skos}Concept`));

  if (value.prefLabel) {
    writer.addQuad(node, namedNode(`${NS.skos}prefLabel`), literalForValue(value.prefLabel));
  }
}

function addValue(writer: Writer, subject: any, predicate: string, value: KnownValue) {
  if (value === null || value === undefined || value === "") return;

  if (Array.isArray(value)) {
    for (const item of value) addValue(writer, subject, predicate, item);
    return;
  }

  if (typeof value === "object") {
    if (isPeriodOfTime(value)) {
      addPeriodOfTime(writer, subject, predicate, value);
      return;
    }
    if (isLocation(value)) {
      addLocation(writer, subject, predicate, value);
      return;
    }
    if (isAgent(value)) {
      addAgent(writer, subject, predicate, value);
      return;
    }
    if (isConcept(value)) {
      addConcept(writer, subject, predicate, value);
      return;
    }

    writer.addQuad(subject, namedNode(predicate), literal(JSON.stringify(value)));
    return;
  }

  writer.addQuad(subject, namedNode(predicate), valueToTerm(value));
}

function addFields(
  writer: Writer,
  subject: any,
  fields: ProcessedFields,
  predicateMap: Record<string, string>,
) {
  for (const [key, field] of Object.entries(fields)) {
    const value = field?.result?.value;
    if (value === null || value === undefined || value === "") continue;

    let predicate = "";
    if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("urn:")) {
      predicate = key;
    } else if (key.includes(".")) {
      const local = key.slice(key.indexOf(".") + 1);
      predicate = predicateMap[local] ?? "";
    }

    if (!predicate) continue;
    if (predicate === "") continue;

    addValue(writer, subject, predicate, value as KnownValue);
  }
}

function hasAnyValue(fields: ProcessedFields): boolean {
  return Object.values(fields).some((field) => {
    const value = field?.result?.value;
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}

export async function buildDcatTurtle(results: FileProcessJobReturnType): Promise<string> {
  const writer = new Writer({
    prefixes: {
      dcat: NS.dcat,
      dcterms: NS.dcterms,
      prov: NS.prov,
      adms: NS.adms,
      foaf: NS.foaf,
      skos: NS.skos,
      rdf: NS.rdf,
      xsd: NS.xsd,
    },
  });

  const datasetSubject = subjectFromFields(results.dataset, "dataset.uri");
  writer.addQuad(datasetSubject, namedNode(`${NS.rdf}type`), namedNode(`${NS.dcat}Dataset`));
  addFields(writer, datasetSubject, results.dataset, DATASET_PREDICATES);

  const distributionSubjects = results.distributions.map((dist) => {
    const subject = subjectFromFields(dist, "distribution.uri");
    writer.addQuad(subject, namedNode(`${NS.rdf}type`), namedNode(`${NS.dcat}Distribution`));
    addFields(writer, subject, dist, DISTRIBUTION_PREDICATES);
    writer.addQuad(datasetSubject, namedNode(`${NS.dcat}distribution`), subject);
    return subject;
  });

  if (hasAnyValue(results.dataService)) {
    const dataServiceSubject = subjectFromFields(results.dataService, "dataService.uri");
    writer.addQuad(dataServiceSubject, namedNode(`${NS.rdf}type`), namedNode(`${NS.dcat}DataService`));
    addFields(writer, dataServiceSubject, results.dataService, DATA_SERVICE_PREDICATES);

    const servesDatasetValue = getValue(results.dataService, "dataService.servesDataset");
    const hasServesDataset = servesDatasetValue !== null && servesDatasetValue !== undefined;
    if (!hasServesDataset) {
      writer.addQuad(dataServiceSubject, namedNode(`${NS.dcat}servesDataset`), datasetSubject);
    }
  }

  if (hasAnyValue(results.catalogRecord)) {
    const recordSubject = subjectFromFields(results.catalogRecord, "catalogRecord.uri");
    writer.addQuad(recordSubject, namedNode(`${NS.rdf}type`), namedNode(`${NS.dcat}CatalogRecord`));
    const catalogPredicates = { ...CATALOG_RECORD_PREDICATES, primaryTopic: "" };
    addFields(writer, recordSubject, results.catalogRecord, catalogPredicates);

    const primaryTopicValue = getValue(results.catalogRecord, "catalogRecord.primaryTopic");
    if (typeof primaryTopicValue === "string" && isIriValue(primaryTopicValue)) {
      writer.addQuad(recordSubject, namedNode(`${NS.foaf}primaryTopic`), namedNode(primaryTopicValue));
    } else {
      writer.addQuad(recordSubject, namedNode(`${NS.foaf}primaryTopic`), datasetSubject);
    }
  }

  return new Promise<string>((resolve, reject) => {
    writer.end((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}
