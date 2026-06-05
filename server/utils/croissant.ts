import { DataFactory, Writer } from "n3";

const NS = {
  dcat: "http://www.w3.org/ns/dcat#",
  dcterms: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
} as const;

const { namedNode, literal, blankNode } = DataFactory;

type AnyRecord = Record<string, any>;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return null;
}

function extractString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") {
    const obj = value as AnyRecord;
    return (
      stringValue(obj["@id"]) ||
      stringValue(obj.url) ||
      stringValue(obj.name) ||
      stringValue(obj.identifier) ||
      stringValue(obj["@name"]) ||
      null
    );
  }
  return null;
}

function isIri(value: string): boolean {
  return /^(https?:|urn:|mailto:)/i.test(value);
}

function typeValues(node: AnyRecord): string[] {
  const raw = node["@type"] ?? node.type;
  return asArray(raw)
    .map((value) => (typeof value === "string" ? value : null))
    .filter((value): value is string => Boolean(value));
}

function isDatasetNode(node: AnyRecord): boolean {
  return typeValues(node).some((value) => value.endsWith("Dataset"));
}

function literalForValue(value: string | number | boolean) {
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

function addLiteralOrIri(writer: Writer, subject: any, predicate: string, value: string) {
  const term = isIri(value) ? namedNode(value) : literalForValue(value);
  writer.addQuad(subject, namedNode(predicate), term);
}

function addAgent(writer: Writer, subject: any, predicate: string, agent: AnyRecord) {
  const uri = stringValue(agent.url) ?? stringValue(agent.uri) ?? stringValue(agent["@id"]);
  const node = uri && isIri(uri) ? namedNode(uri) : blankNode();

  writer.addQuad(subject, namedNode(predicate), node);
//   writer.addQuad(node, namedNode(`${NS.rdf}type`), namedNode(`${NS.foaf}Agent`));

  const name = stringValue(agent.name) ?? stringValue(agent["@name"]);
  if (name) {
    writer.addQuad(node, namedNode(`${NS.foaf}name`), literalForValue(name));
  }

  if (uri && !isIri(uri)) {
    writer.addQuad(node, namedNode(`${NS.foaf}homepage`), literalForValue(uri));
  } else if (uri) {
    writer.addQuad(node, namedNode(`${NS.foaf}homepage`), namedNode(uri));
  }
}

function addAgents(writer: Writer, subject: any, predicate: string, agents: unknown) {
  for (const entry of asArray(agents)) {
    if (typeof entry === "string") {
      addLiteralOrIri(writer, subject, predicate, entry);
      continue;
    }
    if (entry && typeof entry === "object") {
      addAgent(writer, subject, predicate, entry as AnyRecord);
    }
  }
}

function findDatasetNode(root: AnyRecord): { dataset: AnyRecord | null; nodesById: Map<string, AnyRecord> } {
  const graph = Array.isArray(root["@graph"]) ? root["@graph"] : [];
  const nodesById = new Map<string, AnyRecord>();

  for (const node of graph) {
    if (node && typeof node === "object" && typeof node["@id"] === "string") {
      nodesById.set(node["@id"], node);
    }
  }

  if (isDatasetNode(root)) return { dataset: root, nodesById };
  const dataset = graph.find((node) => node && typeof node === "object" && isDatasetNode(node as AnyRecord)) as AnyRecord | undefined;
  return { dataset: dataset ?? null, nodesById };
}

function resolveNode(entry: any, nodesById: Map<string, AnyRecord>): AnyRecord | null {
  if (!entry) return null;
  if (typeof entry === "string") return nodesById.get(entry) ?? null;
  if (typeof entry === "object") {
    const id = typeof entry["@id"] === "string" ? entry["@id"] : null;
    return (id && nodesById.get(id)) ?? (entry as AnyRecord);
  }
  return null;
}

export async function convertCroissantToDcatTurtle(croissant: unknown): Promise<string> {
  if (!croissant || typeof croissant !== "object") {
    throw new Error("Croissant schema is not a valid object");
  }

  const { dataset, nodesById } = findDatasetNode(croissant as AnyRecord);
  if (!dataset) {
    throw new Error("Croissant schema missing dataset node");
  }

  const writer = new Writer({
    prefixes: {
      dcat: NS.dcat,
      dcterms: NS.dcterms,
      foaf: NS.foaf,
      rdf: NS.rdf,
      xsd: NS.xsd,
    },
  });

  const datasetId =
    stringValue(dataset.url) ||
    stringValue(dataset["@id"]) ||
    stringValue(dataset.identifier);
  const datasetSubject = datasetId && isIri(datasetId) ? namedNode(datasetId) : blankNode();

//   writer.addQuad(datasetSubject, namedNode(`${NS.rdf}type`), namedNode(`${NS.dcat}Dataset`));

  const title = stringValue(dataset.name) ?? stringValue(dataset.title);
  if (title) addLiteralOrIri(writer, datasetSubject, `${NS.dcterms}title`, title);

  const description = stringValue(dataset.description);
  if (description) addLiteralOrIri(writer, datasetSubject, `${NS.dcterms}description`, description);

  const identifier = stringValue(dataset.identifier);
  if (identifier) addLiteralOrIri(writer, datasetSubject, `${NS.dcterms}identifier`, identifier);

  const issued = stringValue(dataset.datePublished);
  if (issued) writer.addQuad(datasetSubject, namedNode(`${NS.dcterms}issued`), literalForValue(issued));

  const modified = stringValue(dataset.dateModified);
  if (modified) writer.addQuad(datasetSubject, namedNode(`${NS.dcterms}modified`), literalForValue(modified));

  const version = stringValue(dataset.version);
  if (version) addLiteralOrIri(writer, datasetSubject, `${NS.dcat}version`, version);

  const landingPage = stringValue(dataset.url) ?? stringValue(dataset.sameAs);
  if (landingPage) addLiteralOrIri(writer, datasetSubject, `${NS.dcat}landingPage`, landingPage);

  const license = stringValue(dataset.license);
  const licenseValue = license ?? extractString(dataset.license);
  if (licenseValue) addLiteralOrIri(writer, datasetSubject, `${NS.dcterms}license`, licenseValue);

  const keywords = asArray(dataset.keywords)
    .map((value) => extractString(value))
    .filter((value): value is string => Boolean(value));
  for (const keyword of keywords) {
    addLiteralOrIri(writer, datasetSubject, `${NS.dcat}keyword`, keyword);
  }

  addAgents(writer, datasetSubject, `${NS.dcterms}publisher`, dataset.publisher);
  addAgents(writer, datasetSubject, `${NS.dcterms}creator`, dataset.creator);

  const languages = asArray(dataset.inLanguage)
    .map((value) => extractString(value))
    .filter((value): value is string => Boolean(value));
  for (const language of languages) {
    addLiteralOrIri(writer, datasetSubject, `${NS.dcterms}language`, language);
  }

  const conformsTo = asArray(dataset.conformsTo)
    .map((value) => extractString(value))
    .filter((value): value is string => Boolean(value));
  for (const standard of conformsTo) {
    addLiteralOrIri(writer, datasetSubject, `${NS.dcterms}conformsTo`, standard);
  }

  const distributions = asArray(dataset.distribution ?? dataset.distributions ?? dataset.hasPart)
    .map((entry) => resolveNode(entry, nodesById))
    .filter((node): node is AnyRecord => Boolean(node));

  for (const dist of distributions) {
    const contentUrl = stringValue(dist.contentUrl) ?? stringValue(dist.contentURL) ?? stringValue(dist.url);
    const distSubject = contentUrl && isIri(contentUrl) ? namedNode(contentUrl) : blankNode();

    // writer.addQuad(distSubject, namedNode(`${NS.rdf}type`), namedNode(`${NS.dcat}Distribution`));
    // writer.addQuad(datasetSubject, namedNode(`${NS.dcat}distribution`), distSubject);

    const distTitle = stringValue(dist.name) ?? stringValue(dist.title);
    if (distTitle) addLiteralOrIri(writer, distSubject, `${NS.dcterms}title`, distTitle);

    const distDescription = stringValue(dist.description);
    if (distDescription) addLiteralOrIri(writer, distSubject, `${NS.dcterms}description`, distDescription);

    if (contentUrl) {
      addLiteralOrIri(writer, distSubject, `${NS.dcat}downloadURL`, contentUrl);
      addLiteralOrIri(writer, distSubject, `${NS.dcat}accessURL`, contentUrl);
    }

    const mediaType = extractString(dist.encodingFormat) ?? extractString(dist.fileFormat);
    if (mediaType) addLiteralOrIri(writer, distSubject, `${NS.dcat}mediaType`, mediaType);

    const byteSize = dist.contentSize ?? dist.contentSizeBytes;
    if (typeof byteSize === "number") {
      writer.addQuad(distSubject, namedNode(`${NS.dcat}byteSize`), literalForValue(byteSize));
    } else if (typeof byteSize === "string" && /^\d+$/.test(byteSize)) {
      writer.addQuad(distSubject, namedNode(`${NS.dcat}byteSize`), literalForValue(Number(byteSize)));
    }

    const distLicense = extractString(dist.license);
    if (distLicense) addLiteralOrIri(writer, distSubject, `${NS.dcterms}license`, distLicense);
  }

  return await new Promise<string>((resolve, reject) => {
    writer.end((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}
