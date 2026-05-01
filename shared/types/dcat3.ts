/**
 * TypeScript interfaces for DCAT 3 (Data Catalog Vocabulary)
 * Based on https://www.w3.org/ns/dcat3
 *
 * Types from external vocabularies (dcterms, foaf, skos, prov, vcard) are
 * represented as lightweight interfaces or string IRIs where full modelling
 * would require separate packages.
 */

// ---------------------------------------------------------------------------
// Primitive / external-vocabulary helpers
// ---------------------------------------------------------------------------

/** An IRI represented as a string. */
export type IRI = string;

/** An RDF literal (plain string, language-tagged, or typed). */
export type Literal = string;

/** xsd:decimal represented as a JS number. */
export type Decimal = number;

/** xsd:duration string (ISO 8601 duration, e.g. "PT1H"). */
export type Duration = string;

/** xsd:date / xsd:dateTime / xsd:gYear – kept generic as per the spec. */
export type DateOrDateTime = string | Date;

/** Minimal representation of dcterms:PeriodOfTime. */
export interface PeriodOfTime {
  /** dcat:startDate – the start of the period. */
  startDate?: DateOrDateTime;
  /** dcat:endDate – the end of the period. */
  endDate?: DateOrDateTime;
}

/** Minimal representation of dcterms:Location. */
export interface Location {
  /** dcat:bbox – geographic bounding box (e.g. WKT literal). */
  bbox?: Literal;
  /** dcat:centroid – geographic centroid (e.g. WKT literal). */
  centroid?: Literal;
  /** Plain geometry literal or IRI. */
  geometry?: Literal | IRI;
}

/** Minimal foaf:Agent (person, organization, …). */
export interface Agent {
  uri?: IRI;
  name?: string;
  homepage?: IRI;
}

/** Minimal vcard:Kind contact point. */
export type ContactPoint = IRI | Record<string, unknown>;

/** Minimal skos:Concept (used for themes, roles, …). */
export interface Concept {
  uri: IRI;
  prefLabel?: string;
}

/** dcterms:MediaType IRI or string. */
export type MediaType = IRI;

/** foaf:Document IRI. */
export type Document = IRI;

// ---------------------------------------------------------------------------
// dcat:Role  (subclass of skos:Concept)
// ---------------------------------------------------------------------------

/**
 * The function of a resource or agent with respect to another resource,
 * in the context of resource attribution or resource relationships.
 */
export interface Role extends Concept {}

// ---------------------------------------------------------------------------
// dcat:Relationship
// ---------------------------------------------------------------------------

/**
 * An association class for attaching additional information to a relationship
 * between DCAT Resources.
 */
export interface Relationship {
  /** The related resource (dcat:Resource or any rdfs:Resource). */
  relation?: IRI | Resource;
  /** dcat:hadRole – the role of the related resource. */
  hadRole?: Role | IRI;
}

// ---------------------------------------------------------------------------
// dcat:Resource  (abstract base – superclass of Dataset, DataService, Catalog)
// ---------------------------------------------------------------------------

/**
 * A resource published or curated by a single agent.
 * This is the superclass of dcat:Dataset, dcat:DataService and dcat:Catalog.
 */
export interface Resource {
  /** IRI identifying this resource. */
  uri?: IRI;

  // --- Core descriptive properties (from dcterms) ---
  /** dcterms:title */
  title?: string | string[];
  /** dcterms:description */
  description?: string | string[];
  /** dcterms:identifier */
  identifier?: string | string[];
  /** dcterms:issued */
  issued?: DateOrDateTime;
  /** dcterms:modified */
  modified?: DateOrDateTime;
  /** dcterms:language */
  language?: IRI | IRI[];
  /** dcterms:publisher */
  publisher?: Agent | IRI;
  /** dcterms:creator */
  creator?: Agent | IRI | (Agent | IRI)[];
  /** prov:wasAttributedTo */
  wasAttributedTo?: Agent | IRI | (Agent | IRI)[];
  /** dcterms:rightsHolder */
  rightsHolder?: Agent | IRI;
  /** dcterms:license */
  license?: IRI;
  /** dcterms:rights */
  rights?: IRI | string;
  /** dcterms:accessRights */
  accessRights?: IRI | string;
  /** dcterms:conformsTo */
  conformsTo?: IRI | IRI[];
  /** dcterms:type */
  type?: IRI | IRI[];

  // --- DCAT-specific properties ---
  /** dcat:keyword */
  keyword?: string | string[];
  /** dcat:theme */
  theme?: Concept | IRI | (Concept | IRI)[];
  /** dcat:contactPoint */
  contactPoint?: ContactPoint | ContactPoint[];
  /** dcat:landingPage */
  landingPage?: Document | Document[];

  // --- Versioning (DCAT 3) ---
  /** dcat:version */
  version?: string;
  /** dcat:versionNotes */
  versionNotes?: string | string[];
  /** dcat:hasVersion */
  hasVersion?: Resource | IRI | (Resource | IRI)[];
  /** dcat:isVersionOf – inverse of dcat:hasVersion */
  isVersionOf?: Resource | IRI;
  /** dcat:hasCurrentVersion */
  hasCurrentVersion?: Resource | IRI;
  /** dcat:previousVersion */
  previousVersion?: Resource | IRI;
  /** dcat:nextVersion – inverse of dcat:previousVersion */
  nextVersion?: Resource | IRI;

  // --- Relations ---
  /** dcat:qualifiedRelation */
  qualifiedRelation?: Relationship | Relationship[];
  /** prov:qualifiedAttribution */
  qualifiedAttribution?: Attribution | Attribution[];

  // --- Catalog membership (DCAT 3) ---
  /** dcat:inCatalog – inverse of dcat:resource */
  inCatalog?: Catalog | IRI;
}

// ---------------------------------------------------------------------------
// prov:Attribution  (used with dcat:hadRole)
// ---------------------------------------------------------------------------

export interface Attribution {
  agent?: Agent | IRI;
  /** dcat:hadRole */
  hadRole?: Role | IRI;
}

// ---------------------------------------------------------------------------
// dcat:Distribution
// ---------------------------------------------------------------------------

/**
 * A specific representation of a dataset.
 */
export interface Distribution {
  uri?: IRI;

  /** dcterms:title */
  title?: string | string[];
  /** dcterms:description */
  description?: string | string[];
  /** dcterms:issued */
  issued?: DateOrDateTime;
  /** dcterms:modified */
  modified?: DateOrDateTime;
  /** dcterms:license */
  license?: IRI;
  /** dcterms:rights */
  rights?: IRI | string;
  /** dcterms:conformsTo */
  conformsTo?: IRI | IRI[];
  /** dcterms:language */
  language?: IRI | IRI[];

  /** dcat:accessURL (required) – URL giving access to the distribution. */
  accessURL: IRI | IRI[];
  /** dcat:downloadURL – direct download URL. */
  downloadURL?: IRI | IRI[];

  /** dcat:accessService – data service providing access. */
  accessService?: DataService | IRI | (DataService | IRI)[];

  /** dcterms:format */
  format?: IRI;
  /** dcat:mediaType – IANA media type. */
  mediaType?: MediaType;
  /** dcat:compressFormat – compression format. */
  compressFormat?: MediaType;
  /** dcat:packageFormat – packaging format. */
  packageFormat?: MediaType;

  /** dcat:byteSize */
  byteSize?: Decimal;

  /** dcat:spatialResolutionInMeters */
  spatialResolutionInMeters?: Decimal;
  /** dcat:temporalResolution – ISO 8601 duration. */
  temporalResolution?: Duration;

  /** dcterms:spatial */
  spatial?: Location | IRI | (Location | IRI)[];
  /** dcterms:temporal */
  temporal?: PeriodOfTime;
}

// ---------------------------------------------------------------------------
// dcat:Dataset
// ---------------------------------------------------------------------------

/**
 * A collection of data, published or curated by a single source,
 * and available for access or download in one or more representations.
 */
export interface Dataset extends Resource {
  /** dcat:distribution */
  distribution?: Distribution | Distribution[];

  /** dcterms:spatial / dcat:spatialResolutionInMeters */
  spatial?: Location | IRI | (Location | IRI)[];
  /** dcat:spatialResolutionInMeters */
  spatialResolutionInMeters?: Decimal;

  /** dcterms:temporal */
  temporal?: PeriodOfTime;
  /** dcat:temporalResolution */
  temporalResolution?: Duration;

  /** dcterms:accrualPeriodicity */
  accrualPeriodicity?: IRI;

  // --- Dataset series membership (DCAT 3) ---
  /** dcat:inSeries – series this dataset belongs to. */
  inSeries?: DatasetSeries | IRI | (DatasetSeries | IRI)[];
  /** dcat:prev – previous resource in a series. */
  prev?: Dataset | IRI;
  /** dcat:next – inverse of dcat:prev. */
  next?: Dataset | IRI;
  /** dcat:first – first resource in the series. */
  first?: Dataset | IRI;
  /** dcat:last – last resource in the series. */
  last?: Dataset | IRI;
}

// ---------------------------------------------------------------------------
// dcat:DatasetSeries  (DCAT 3, subclass of dcat:Dataset)
// ---------------------------------------------------------------------------

/**
 * A collection of datasets that are published separately but share some
 * common characteristics.
 */
export interface DatasetSeries extends Dataset {
  /** dcat:first – first dataset in the series. */
  first?: Dataset | IRI;
  /** dcat:last – last dataset in the series. */
  last?: Dataset | IRI;
  /** dcat:seriesMember – inverse of dcat:inSeries. */
  seriesMember?: Dataset | IRI | (Dataset | IRI)[];
}

// ---------------------------------------------------------------------------
// dcat:DataService  (subclass of dcat:Resource)
// ---------------------------------------------------------------------------

/**
 * A site or end-point providing operations related to the discovery of,
 * access to, or processing functions on, data or related resources.
 */
export interface DataService extends Resource {
  /** dcat:endpointURL (required) – root location or primary endpoint IRI. */
  endpointURL: IRI | IRI[];
  /** dcat:endpointDescription – description of the endpoint (e.g. OpenAPI). */
  endpointDescription?: IRI | IRI[];
  /** dcat:servesDataset – datasets this service can distribute. */
  servesDataset?: Dataset | IRI | (Dataset | IRI)[];
}

// ---------------------------------------------------------------------------
// dcat:CatalogRecord
// ---------------------------------------------------------------------------

/**
 * A record in a data catalog, describing the registration of a single dataset
 * or data service.
 */
export interface CatalogRecord {
  uri?: IRI;

  /** foaf:primaryTopic (required) – the described resource. */
  primaryTopic: Resource | IRI;

  /** dcterms:title */
  title?: string | string[];
  /** dcterms:description */
  description?: string | string[];
  /** dcterms:issued */
  issued?: DateOrDateTime;
  /** dcterms:modified */
  modified?: DateOrDateTime;
  /** dcterms:language */
  language?: IRI | IRI[];
  /** dcterms:conformsTo */
  conformsTo?: IRI | IRI[];
  /** adms:status */
  status?: IRI;
  /** dcterms:source – source metadata record. */
  source?: CatalogRecord | IRI;
}

// ---------------------------------------------------------------------------
// dcat:Catalog  (subclass of dcat:Dataset)
// ---------------------------------------------------------------------------

/**
 * A curated collection of metadata about resources (e.g. datasets and data
 * services in the context of a data catalog).
 */
export interface Catalog extends Dataset {
  /** dcat:dataset – datasets listed in this catalog. */
  dataset?: Dataset | Dataset[];
  /** dcat:service – data services listed in this catalog. */
  service?: DataService | DataService[];
  /** dcat:catalog – sub-catalogs listed in this catalog. */
  catalog?: Catalog | Catalog[];
  /** dcat:resource – any catalogued resource (most general). */
  resource?: Resource | Resource[];
  /** dcat:record – catalog records. */
  record?: CatalogRecord | CatalogRecord[];
  /** dcat:themeTaxonomy – knowledge organization system used to classify resources. */
  themeTaxonomy?: IRI | IRI[];
  /** _meta */
  _meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// InferOptions
// ---------------------------------------------------------------------------

export interface InferOptions {
    baseUri?: string;
    outPath?: string;
    verbose?: boolean;
}