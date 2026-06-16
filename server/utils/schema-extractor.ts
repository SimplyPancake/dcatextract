/**
 * Extract pre-filled metadata values from DCAT and Croissant schemas.
 * Avoids re-deriving information that's already in the dataset provider's metadata.
 */

type AnyRecord = Record<string, any>;

interface ExtractedAgent {
  name?: string;
  url?: string;
}

interface ExtractedSpatialTemporal {
  startDate?: string;
  endDate?: string;
  bbox?: string;
  centroid?: string;
}

interface ExtractedDistribution {
  title?: string;
  description?: string;
  format?: string;
  mediaType?: string;
  license?: string;
  accessURL?: string;
  downloadURL?: string;
  byteSize?: number;
}

interface ExtractedMetadata {
  // Basic properties
  title?: string;
  description?: string;
  identifier?: string;
  version?: string;
  
  // Categories and keywords
  keywords?: string[];
  theme?: string[];
  subject?: string[];
  
  // Agents
  creator?: ExtractedAgent[];
  publisher?: ExtractedAgent[];
  contactPoint?: ExtractedAgent;
  
  // Rights and licensing
  license?: string;
  rights?: string;
  accessRights?: string;
  
  // Dates
  issued?: string;
  modified?: string;
  
  // Language and standards
  inLanguage?: string[];
  conformsTo?: string[];
  
  // Coverage
  spatial?: ExtractedSpatialTemporal;
  temporal?: ExtractedSpatialTemporal;
  
  // Update frequency
  accrualPeriodicity?: string;
  
  // URL references
  landingPage?: string;
  documentation?: string;
  
  // Dataset type classification
  type?: string;
  
  // Distributions (file formats, access methods)
  distributions?: ExtractedDistribution[];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return undefined;
}

function extractStringFromValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "object") {
    const obj = value as AnyRecord;
    return (
      stringValue(obj["@id"]) ||
      stringValue(obj.url) ||
      stringValue(obj.name) ||
      stringValue(obj.identifier) ||
      stringValue(obj["@name"]) ||
      undefined
    );
  }
  return undefined;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractAgent(agent: unknown): ExtractedAgent | null {
  if (typeof agent === "string") {
    return { name: agent };
  }
  if (agent && typeof agent === "object") {
    const obj = agent as AnyRecord;
    return {
      name: stringValue(obj.name) ?? stringValue(obj["@name"]) ?? undefined,
      url: stringValue(obj.url) ?? stringValue(obj.uri) ?? stringValue(obj["@id"]) ?? undefined,
    };
  }
  return null;
}

/**
 * Extract metadata values from Croissant JSON-LD format.
 * Croissant is a ML dataset metadata standard used by HuggingFace, Kaggle, etc.
 */
export function extractFromCroissant(croissant: unknown): ExtractedMetadata {
  if (!croissant || typeof croissant !== "object") return {};

  const root = croissant as AnyRecord;
  const graph = Array.isArray(root["@graph"]) ? root["@graph"] : [];

  // Find dataset node in graph
  const datasetNode = graph.find((node) => {
    const types = asArray(node?.["@type"]);
    return types.some((t) => typeof t === "string" && t.includes("Dataset"));
  }) ?? root;

  if (!datasetNode || typeof datasetNode !== "object") return {};

  const ds = datasetNode as AnyRecord;
  console.log(`[croissant-extract] Dataset node keys:`, Object.keys(ds).sort());

  // Extract distributions if present
  const distributions: ExtractedDistribution[] = [];
  const distRefs = asArray(ds.distribution ?? ds.distributions ?? ds.hasPart);
  for (const dist of distRefs) {
    const resolved = typeof dist === "string" ? graph.find(n => n?.["@id"] === dist) : dist;
    if (resolved && typeof resolved === "object") {
      distributions.push({
        title: stringValue(resolved.name) ?? stringValue(resolved.title) ?? undefined,
        description: stringValue(resolved.description) ?? undefined,
        format: extractStringFromValue(resolved.encodingFormat ?? resolved.fileFormat) ?? undefined,
        mediaType: extractStringFromValue(resolved.encodingFormat ?? resolved.fileFormat) ?? undefined,
        license: extractStringFromValue(resolved.license) ?? undefined,
        accessURL: extractStringFromValue(resolved.contentUrl ?? resolved.url) ?? undefined,
        downloadURL: extractStringFromValue(resolved.contentUrl ?? resolved.url) ?? undefined,
        byteSize: typeof resolved.contentSize === "number" ? resolved.contentSize : undefined,
      });
    }
  }

  return {
    title: stringValue(ds.name) ?? stringValue(ds.title) ?? undefined,
    description: stringValue(ds.description) ?? undefined,
    identifier: stringValue(ds.identifier ?? ds["@id"]) ?? undefined,
    version: stringValue(ds.version) ?? undefined,
    keywords: (() => { const vals = asArray(ds.keywords).map((k) => extractStringFromValue(k)).filter((k): k is string => k !== null); return vals.length > 0 ? vals : undefined; })(),
    theme: (() => { const vals = asArray(ds.theme ?? ds.subject).map((t) => extractStringFromValue(t)).filter((t): t is string => t !== null); return vals.length > 0 ? vals : undefined; })(),
    subject: (() => { const vals = asArray(ds.subject).map((s) => extractStringFromValue(s)).filter((s): s is string => s !== null); return vals.length > 0 ? vals : undefined; })(),
    creator: (() => { const vals = asArray(ds.creator).map((c) => extractAgent(c)).filter((c): c is ExtractedAgent => c !== null); return vals.length > 0 ? vals : undefined; })(),
    publisher: (() => { const vals = asArray(ds.publisher).map((p) => extractAgent(p)).filter((p): p is ExtractedAgent => p !== null); return vals.length > 0 ? vals : undefined; })(),
    contactPoint: extractAgent(ds.contactPoint) ?? undefined,
    license: extractStringFromValue(ds.license) ?? undefined,
    rights: stringValue(ds.rights) ?? undefined,
    accessRights: stringValue(ds.accessRights) ?? undefined,
    issued: stringValue(ds.datePublished) ?? undefined,
    modified: stringValue(ds.dateModified) ?? undefined,
    inLanguage: (() => { const vals = asArray(ds.inLanguage).map((lang) => extractStringFromValue(lang)).filter((lang): lang is string => lang !== null); return vals.length > 0 ? vals : undefined; })(),
    conformsTo: (() => { const vals = asArray(ds.conformsTo).map((c) => extractStringFromValue(c)).filter((c): c is string => c !== null); return vals.length > 0 ? vals : undefined; })(),
    spatial: ds.spatialCoverage ? {
      bbox: stringValue(ds.spatialCoverage.box) ?? undefined,
      centroid: stringValue(ds.spatialCoverage.centroid) ?? undefined,
    } : undefined,
    temporal: ds.temporalCoverage ? {
      startDate: stringValue(ds.temporalCoverage.startDate ?? ds.temporalCoverage.start) ?? undefined,
      endDate: stringValue(ds.temporalCoverage.endDate ?? ds.temporalCoverage.end) ?? undefined,
    } : undefined,
    accrualPeriodicity: extractStringFromValue(ds.accrualPeriodicity) ?? undefined,
    landingPage: extractStringFromValue(ds.url ?? ds.sameAs) ?? undefined,
    documentation: extractStringFromValue(ds.documentation) ?? undefined,
    type: stringValue(ds.type) ?? undefined,
    distributions: distributions.length > 0 ? distributions : undefined,
  };
}

/**
 * Extract metadata values from Zenodo JSON API format.
 * Zenodo's API returns rich metadata about datasets.
 */
export function extractFromZenodo(zenodoJson: unknown): ExtractedMetadata {
  if (!zenodoJson || typeof zenodoJson !== "object") return {};

  const z = zenodoJson as AnyRecord;
  console.log(`[zenodo-extract] Extracting from Zenodo JSON`);

  // Extract creators/contributors as agents
  const creators: ExtractedAgent[] = [];
  for (const creator of asArray(z.creators)) {
    if (typeof creator === "object" && creator !== null) {
      creators.push({
        name: stringValue(creator.name) ?? stringValue(creator.given_name) ?? undefined,
        url: stringValue(creator.orcid) ?? undefined,
      });
    }
  }

  // Extract contributors
  const contributors: ExtractedAgent[] = [];
  for (const contrib of asArray(z.contributors)) {
    if (typeof contrib === "object" && contrib !== null) {
      contributors.push({
        name: stringValue(contrib.name) ?? stringValue(contrib.given_name) ?? undefined,
        url: stringValue(contrib.orcid) ?? undefined,
      });
    }
  }

  // Combine creators and contributors, use creators as primary
  const allCreators = creators.length > 0 ? creators : contributors.length > 0 ? contributors : undefined;

  // Extract dates
  let issued = stringValue(z.publication_date) ?? stringValue(z.created);
  let modified = stringValue(z.updated);

  // Extract keywords/subjects
  const keywords = asArray(z.keywords).map((k) => stringValue(k)).filter((k): k is string => k !== undefined);
  const subjects = asArray(z.subjects).filter((s) => typeof s === "object").map((s) => stringValue((s as AnyRecord).term)).filter((s): s is string => s !== undefined);

  return {
    title: stringValue(z.title) ?? undefined,
    description: stringValue(z.description) ?? undefined,
    identifier: stringValue(z.doi) ?? stringValue(z.record_id) ?? undefined,
    version: stringValue(z.version) ?? undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
    theme: subjects.length > 0 ? subjects : undefined,
    subject: subjects.length > 0 ? subjects : undefined,
    creator: allCreators,
    publisher: z.communities && Array.isArray(z.communities) && z.communities.length > 0 ? [{
      name: z.communities.map((c: any) => c.title ?? c.id).join(", "),
      url: "https://zenodo.org"
    }] : undefined,
    license: stringValue(z.license?.id ?? z.license) ?? undefined,
    rights: stringValue(z.access_right) ?? undefined,
    issued,
    modified,
    inLanguage: z.language ? [z.language] : undefined,
    // Note: Zenodo doesn't explicitly provide spatial/temporal in standard fields
    type: "Dataset",
  };
}

/**
 * Extract metadata values from DCAT RDF/Turtle format.
 * Returns structured metadata that doesn't require N3 parsing.
 * For now, use simple regex extraction for common fields.
 * Full DCAT parsing requires RDF parser (n3 library).
 */
export function extractFromDcat(text: string): ExtractedMetadata {
  const result: ExtractedMetadata = {};

  // Helper to extract value from regex match
  const extractValue = (pattern: RegExp): string | undefined => {
    const match = text.match(pattern);
    if (match) return match[1] ?? match[2] ?? match[3];
    return undefined;
  };

  // Helper to extract all values matching a pattern
  const extractAll = (pattern: RegExp): string[] => {
    const matches = text.matchAll(pattern);
    return Array.from(matches)
      .map((m) => m[1] ?? m[2] ?? m[3])
      .filter((v): v is string => v !== null);
  };

  // Basic properties
  result.title = extractValue(/dcterms:title\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.description = extractValue(/dcterms:description\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.identifier = extractValue(/dcterms:identifier\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.version = extractValue(/dcat:version\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);

  // Keywords and themes
  result.keywords = extractAll(/dcat:keyword\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/g);
  result.theme = extractAll(/dcat:theme\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/g);
  result.subject = extractAll(/dcterms:subject\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/g);

  // Rights and licensing
  result.license = extractValue(/dcterms:license\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.rights = extractValue(/dcterms:rights\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.accessRights = extractValue(/dcterms:accessRights\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);

  // Dates
  result.issued = extractValue(/dcterms:issued\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.modified = extractValue(/dcterms:modified\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);

  // Language and standards
  result.inLanguage = extractAll(/dcterms:language\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/g);
  result.conformsTo = extractAll(/dcterms:conformsTo\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/g);

  // URL references
  result.landingPage = extractValue(/dcat:landingPage\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);
  result.documentation = extractValue(/foaf:page\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);

  // Update frequency
  result.accrualPeriodicity = extractValue(/dcterms:accrualPeriodicity\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);

  // Type classification
  result.type = extractValue(/dcterms:type\s+(?:<([^>]+)>|["\']([^"\']*)["\']|([^\s;\.]+))/);

  return result;
}
