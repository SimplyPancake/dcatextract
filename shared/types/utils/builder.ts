/**
 * Builder classes for DCAT 3
 * Each builder follows a fluent interface pattern and produces the
 * corresponding plain interface from dcat3.ts via .build().
 */

import type {
  IRI,
  DateOrDateTime,
  Decimal,
  Duration,
  PeriodOfTime,
  Location,
  Agent,
  Concept,
  MediaType,
  ContactPoint,
  Document,
  Role,
  Relationship,
  Attribution,
  Resource,
  Distribution,
  Dataset,
  DatasetSeries,
  DataService,
  CatalogRecord,
  Catalog,
} from "#shared/types/dcat3";

export type SelectionMap = Record<string, boolean>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asArray<T>(value: T | T[] | undefined, addition: T): T[] {
  if (value === undefined) return [addition];
  return Array.isArray(value) ? [...value, addition] : [value, addition];
}

function applySelection<T extends Record<string, any>>(
  data: T,
  selected: SelectionMap | undefined,
  prefix: string,
  keys: readonly string[],
): T {
  if (!selected) return data;
  const next: Record<string, any> = { ...data };
  for (const key of keys) {
    const selectionKey = `${prefix}.${key}`;
    if (!(selectionKey in selected)) {
      next[key] = null;
    }
  }
  return next as T;
}

export const RESOURCE_KEYS = [
  "uri",
  "title",
  "description",
  "identifier",
  "issued",
  "modified",
  "language",
  "publisher",
  "creator",
  "wasAttributedTo",
  "rightsHolder",
  "license",
  "rights",
  "accessRights",
  "conformsTo",
  "type",
  "keyword",
  "theme",
  "contactPoint",
  "landingPage",
  "version",
  "versionNotes",
  "hasVersion",
  "isVersionOf",
  "hasCurrentVersion",
  "previousVersion",
  "nextVersion",
  "qualifiedRelation",
  "qualifiedAttribution",
  "inCatalog",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const DATASET_KEYS = [
  ...RESOURCE_KEYS,
  "distribution",
  "spatial",
  "spatialResolutionInMeters",
  "temporal",
  "temporalResolution",
  "accrualPeriodicity",
  "inSeries",
  "prev",
  "next",
  "first",
  "last",
] as const;
export type DatasetKey = (typeof DATASET_KEYS)[number];

export const DATA_SERVICE_KEYS = [
  ...RESOURCE_KEYS,
  "endpointURL",
  "endpointDescription",
  "servesDataset",
] as const;
export type DataServiceKey = (typeof DATA_SERVICE_KEYS)[number];

export const DISTRIBUTION_KEYS = [
  "uri",
  "title",
  "description",
  "issued",
  "modified",
  "license",
  "rights",
  "conformsTo",
  "language",
  "downloadURL",
  "accessURL",
  "accessService",
  "format",
  "mediaType",
  "compressFormat",
  "packageFormat",
  "byteSize",
  "spatialResolutionInMeters",
  "temporalResolution",
  "spatial",
  "temporal",
] as const;
export type DistributionKey = (typeof DISTRIBUTION_KEYS)[number];

export const CATALOG_RECORD_KEYS = [
  "uri",
  "primaryTopic",
  "title",
  "description",
  "issued",
  "modified",
  "language",
  "conformsTo",
  "status",
  "source",
] as const;
export type CatalogRecordKey = (typeof CATALOG_RECORD_KEYS)[number];

export const CATALOG_KEYS = [
  ...RESOURCE_KEYS,
  "dataset",
  "service",
  "catalog",
  "resource",
  "record",
  "themeTaxonomy",
] as const;
export type CatalogKey = (typeof CATALOG_KEYS)[number];

export const AGENT_KEYS = ["uri", "name", "homepage"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const PERIOD_OF_TIME_KEYS = ["startDate", "endDate"] as const;
export type PeriodOfTimeKey = (typeof PERIOD_OF_TIME_KEYS)[number];

export const LOCATION_KEYS = ["bbox", "centroid", "geometry"] as const;
export type LocationKey = (typeof LOCATION_KEYS)[number];

// ---------------------------------------------------------------------------
// AgentBuilder
// ---------------------------------------------------------------------------

export class AgentBuilder {
  private data: Agent = {};
  private readonly selectedProperties?: SelectionMap;

  constructor(selectedProperties?: SelectionMap) {
    this.selectedProperties = selectedProperties;
  }

  uri(uri: IRI): this {
    this.data.uri = uri;
    return this;
  }
  name(name: string): this {
    this.data.name = name;
    return this;
  }
  homepage(url: IRI): this {
    this.data.homepage = url;
    return this;
  }
  build(): Agent {
    return applySelection(
      { ...this.data },
      this.selectedProperties,
      "agent",
      AGENT_KEYS,
    ) as Agent;
  }
}

// ---------------------------------------------------------------------------
// PeriodOfTimeBuilder
// ---------------------------------------------------------------------------

export class PeriodOfTimeBuilder {
  private data: PeriodOfTime = {};
  private readonly selectedProperties?: SelectionMap;

  constructor(selectedProperties?: SelectionMap) {
    this.selectedProperties = selectedProperties;
  }

  startDate(date: DateOrDateTime): this {
    this.data.startDate = date;
    return this;
  }
  endDate(date: DateOrDateTime): this {
    this.data.endDate = date;
    return this;
  }
  build(): PeriodOfTime {
    return applySelection(
      { ...this.data },
      this.selectedProperties,
      "periodOfTime",
      PERIOD_OF_TIME_KEYS,
    ) as PeriodOfTime;
  }
}

// ---------------------------------------------------------------------------
// LocationBuilder
// ---------------------------------------------------------------------------

export class LocationBuilder {
  private data: Location = {};
  private readonly selectedProperties?: SelectionMap;

  constructor(selectedProperties?: SelectionMap) {
    this.selectedProperties = selectedProperties;
  }

  bbox(wkt: string): this {
    this.data.bbox = wkt;
    return this;
  }
  centroid(wkt: string): this {
    this.data.centroid = wkt;
    return this;
  }
  geometry(value: string): this {
    this.data.geometry = value;
    return this;
  }
  build(): Location {
    return applySelection(
      { ...this.data },
      this.selectedProperties,
      "location",
      LOCATION_KEYS,
    ) as Location;
  }
}

// ---------------------------------------------------------------------------
// DistributionBuilder
// ---------------------------------------------------------------------------

export class DistributionBuilder {
  private data: Partial<Distribution> & { accessURL: IRI | IRI[] };
  private readonly selectedProperties?: SelectionMap;

  constructor(accessURL: IRI, selectedProperties?: SelectionMap) {
    this.data = { accessURL };
    this.selectedProperties = selectedProperties;
  }

  uri(uri: IRI): this {
    this.data.uri = uri;
    return this;
  }
  title(title: string): this {
    this.data.title = asArray(this.data.title, title);
    return this;
  }
  description(desc: string): this {
    this.data.description = asArray(this.data.description, desc);
    return this;
  }
  issued(date: DateOrDateTime): this {
    this.data.issued = date;
    return this;
  }
  modified(date: DateOrDateTime): this {
    this.data.modified = date;
    return this;
  }
  license(iri: IRI): this {
    this.data.license = iri;
    return this;
  }
  rights(value: IRI | string): this {
    this.data.rights = value;
    return this;
  }
  conformsTo(iri: IRI): this {
    this.data.conformsTo = asArray(this.data.conformsTo, iri);
    return this;
  }
  language(iri: IRI): this {
    this.data.language = asArray(this.data.language, iri);
    return this;
  }
  downloadURL(url: IRI): this {
    this.data.downloadURL = asArray(this.data.downloadURL, url);
    return this;
  }
  accessService(service: DataService | IRI): this {
    this.data.accessService = asArray(this.data.accessService, service);
    return this;
  }
  format(iri: IRI): this {
    this.data.format = iri;
    return this;
  }
  mediaType(mt: MediaType): this {
    this.data.mediaType = mt;
    return this;
  }
  compressFormat(mt: MediaType): this {
    this.data.compressFormat = mt;
    return this;
  }
  packageFormat(mt: MediaType): this {
    this.data.packageFormat = mt;
    return this;
  }
  byteSize(bytes: Decimal): this {
    this.data.byteSize = bytes;
    return this;
  }
  spatialResolutionInMeters(meters: Decimal): this {
    this.data.spatialResolutionInMeters = meters;
    return this;
  }
  temporalResolution(duration: Duration): this {
    this.data.temporalResolution = duration;
    return this;
  }
  spatial(location: Location | IRI): this {
    this.data.spatial = asArray(this.data.spatial, location);
    return this;
  }
  temporal(period: PeriodOfTime): this {
    this.data.temporal = period;
    return this;
  }

  build(): Distribution {
    return applySelection(
      this.data as Distribution,
      this.selectedProperties,
      "distribution",
      DISTRIBUTION_KEYS,
    ) as Distribution;
  }
}

// ---------------------------------------------------------------------------
// Base ResourceBuilder  (shared by Dataset, DataService, Catalog)
// ---------------------------------------------------------------------------

abstract class ResourceBuilder<
  T extends ResourceBuilder<T, R>,
  R extends Resource,
> {
  protected readonly selectedProperties?: SelectionMap;
  private readonly selectionBaseKey?: string;

  /**
   *
   */
  constructor(
    selectedProperties?: SelectionMap,
    selectionBaseKey?: string,
  ) {
    this.selectedProperties = selectedProperties;
    this.selectionBaseKey = selectionBaseKey;
  }
  protected data: Partial<R> = {};

  protected applySelection(data: Partial<R>, keys: readonly string[]): R {
    if (!this.selectedProperties || !this.selectionBaseKey) {
      return data as R;
    }
    return applySelection(
      data as Record<string, any>,
      this.selectedProperties,
      this.selectionBaseKey,
      keys,
    ) as R;
  }

  uri(uri: IRI): T {
    this.data.uri = uri;
    return this as unknown as T;
  }
  title(title: string): T {
    this.data.title = asArray(this.data.title as any, title) as any;
    return this as unknown as T;
  }
  description(desc: string): T {
    this.data.description = asArray(this.data.description as any, desc) as any;
    return this as unknown as T;
  }
  identifier(id: string): T {
    this.data.identifier = asArray(this.data.identifier as any, id) as any;
    return this as unknown as T;
  }
  issued(date: DateOrDateTime): T {
    this.data.issued = date;
    return this as unknown as T;
  }
  modified(date: DateOrDateTime): T {
    this.data.modified = date;
    return this as unknown as T;
  }
  language(iri: IRI): T {
    this.data.language = asArray(this.data.language as any, iri) as any;
    return this as unknown as T;
  }
  publisher(agent: Agent | IRI): T {
    this.data.publisher = agent;
    return this as unknown as T;
  }
  creator(agent: Agent | IRI): T {
    this.data.creator = asArray(this.data.creator as any, agent) as any;
    return this as unknown as T;
  }
  wasAttributedTo(agent: Agent | IRI): T {
    this.data.wasAttributedTo = asArray(
      this.data.wasAttributedTo as any,
      agent,
    ) as any;
    return this as unknown as T;
  }
  rightsHolder(agent: Agent | IRI): T {
    this.data.rightsHolder = agent;
    return this as unknown as T;
  }
  license(iri: IRI): T {
    this.data.license = iri;
    return this as unknown as T;
  }
  rights(value: IRI | string): T {
    this.data.rights = value;
    return this as unknown as T;
  }
  accessRights(value: IRI | string): T {
    this.data.accessRights = value;
    return this as unknown as T;
  }
  conformsTo(iri: IRI): T {
    this.data.conformsTo = asArray(this.data.conformsTo as any, iri) as any;
    return this as unknown as T;
  }
  type(iri: IRI): T {
    this.data.type = asArray(this.data.type as any, iri) as any;
    return this as unknown as T;
  }
  keyword(kw: string): T {
    this.data.keyword = asArray(this.data.keyword as any, kw) as any;
    return this as unknown as T;
  }
  theme(concept: Concept | IRI): T {
    this.data.theme = asArray(this.data.theme as any, concept) as any;
    return this as unknown as T;
  }
  contactPoint(cp: ContactPoint): T {
    this.data.contactPoint = asArray(this.data.contactPoint as any, cp) as any;
    return this as unknown as T;
  }
  landingPage(doc: Document): T {
    this.data.landingPage = asArray(this.data.landingPage as any, doc) as any;
    return this as unknown as T;
  }
  version(v: string): T {
    this.data.version = v;
    return this as unknown as T;
  }
  versionNotes(notes: string): T {
    this.data.versionNotes = asArray(
      this.data.versionNotes as any,
      notes,
    ) as any;
    return this as unknown as T;
  }
  hasVersion(resource: Resource | IRI): T {
    this.data.hasVersion = asArray(
      this.data.hasVersion as any,
      resource,
    ) as any;
    return this as unknown as T;
  }
  isVersionOf(resource: Resource | IRI): T {
    this.data.isVersionOf = resource;
    return this as unknown as T;
  }
  hasCurrentVersion(resource: Resource | IRI): T {
    this.data.hasCurrentVersion = resource;
    return this as unknown as T;
  }
  previousVersion(resource: Resource | IRI): T {
    this.data.previousVersion = resource;
    return this as unknown as T;
  }
  nextVersion(resource: Resource | IRI): T {
    this.data.nextVersion = resource;
    return this as unknown as T;
  }
  qualifiedRelation(rel: Relationship): T {
    this.data.qualifiedRelation = asArray(
      this.data.qualifiedRelation as any,
      rel,
    ) as any;
    return this as unknown as T;
  }
  qualifiedAttribution(attr: Attribution): T {
    this.data.qualifiedAttribution = asArray(
      this.data.qualifiedAttribution as any,
      attr,
    ) as any;
    return this as unknown as T;
  }
  inCatalog(catalog: Catalog | IRI): T {
    this.data.inCatalog = catalog;
    return this as unknown as T;
  }

  abstract build(): R;
}

// ---------------------------------------------------------------------------
// DatasetBuilder
// ---------------------------------------------------------------------------

export class DatasetBuilder extends ResourceBuilder<DatasetBuilder, Dataset> {
  constructor(selectedProperties?: SelectionMap) {
    super(selectedProperties, "dataset");
  }
  distribution(dist: Distribution): this {
    this.data.distribution = asArray(
      this.data.distribution as any,
      dist,
    ) as any;
    return this;
  }
  spatial(location: Location | IRI): this {
    this.data.spatial = asArray(this.data.spatial as any, location) as any;
    return this;
  }
  spatialResolutionInMeters(meters: Decimal): this {
    this.data.spatialResolutionInMeters = meters;
    return this;
  }
  temporal(period: PeriodOfTime): this {
    this.data.temporal = period;
    return this;
  }
  temporalResolution(duration: Duration): this {
    this.data.temporalResolution = duration;
    return this;
  }
  accrualPeriodicity(iri: IRI): this {
    this.data.accrualPeriodicity = iri;
    return this;
  }
  inSeries(series: DatasetSeries | IRI): this {
    this.data.inSeries = asArray(this.data.inSeries as any, series) as any;
    return this;
  }
  prev(dataset: Dataset | IRI): this {
    this.data.prev = dataset;
    return this;
  }
  next(dataset: Dataset | IRI): this {
    this.data.next = dataset;
    return this;
  }
  first(dataset: Dataset | IRI): this {
    this.data.first = dataset;
    return this;
  }
  last(dataset: Dataset | IRI): this {
    this.data.last = dataset;
    return this;
  }

  build(): Dataset {
    return this.applySelection({ ...this.data }, DATASET_KEYS);
  }
}

// ---------------------------------------------------------------------------
// DatasetSeriesBuilder
// ---------------------------------------------------------------------------

export class DatasetSeriesBuilder extends ResourceBuilder<
  DatasetSeriesBuilder,
  DatasetSeries
> {
  constructor(selectedProperties?: SelectionMap) {
    super(selectedProperties, "datasetSeries");
  }
  first(dataset: Dataset | IRI): this {
    this.data.first = dataset;
    return this;
  }
  last(dataset: Dataset | IRI): this {
    this.data.last = dataset;
    return this;
  }
  seriesMember(dataset: Dataset | IRI): this {
    this.data.seriesMember = asArray(
      this.data.seriesMember as any,
      dataset,
    ) as any;
    return this;
  }
  temporal(period: PeriodOfTime): this {
    this.data.temporal = period;
    return this;
  }
  accrualPeriodicity(iri: IRI): this {
    this.data.accrualPeriodicity = iri;
    return this;
  }

  build(): DatasetSeries {
    return this.applySelection({ ...this.data }, RESOURCE_KEYS);
  }
}

// ---------------------------------------------------------------------------
// DataServiceBuilder
// ---------------------------------------------------------------------------

export class DataServiceBuilder extends ResourceBuilder<
  DataServiceBuilder,
  DataService
> {
  private endpointURLValue: IRI | IRI[];

  constructor(endpointURL: IRI, selectedProperties?: SelectionMap) {
    super(selectedProperties, "dataService");
    this.endpointURLValue = endpointURL;
  }

  endpointDescription(iri: IRI): this {
    this.data.endpointDescription = asArray(
      this.data.endpointDescription as any,
      iri,
    ) as any;
    return this;
  }
  servesDataset(dataset: Dataset | IRI): this {
    this.data.servesDataset = asArray(
      this.data.servesDataset as any,
      dataset,
    ) as any;
    return this;
  }

  build(): DataService {
    return this.applySelection(
      { ...this.data, endpointURL: this.endpointURLValue },
      DATA_SERVICE_KEYS,
    );
  }
}

// ---------------------------------------------------------------------------
// CatalogRecordBuilder
// ---------------------------------------------------------------------------

export class CatalogRecordBuilder {
  private data: Partial<CatalogRecord> & { primaryTopic: Resource | IRI };
  private readonly selectedProperties?: SelectionMap;

  constructor(primaryTopic: Resource | IRI, selectedProperties?: SelectionMap) {
    this.data = { primaryTopic };
    this.selectedProperties = selectedProperties;
  }

  uri(uri: IRI): this {
    this.data.uri = uri;
    return this;
  }
  title(title: string): this {
    this.data.title = asArray(this.data.title, title);
    return this;
  }
  description(desc: string): this {
    this.data.description = asArray(this.data.description, desc);
    return this;
  }
  issued(date: DateOrDateTime): this {
    this.data.issued = date;
    return this;
  }
  modified(date: DateOrDateTime): this {
    this.data.modified = date;
    return this;
  }
  language(iri: IRI): this {
    this.data.language = asArray(this.data.language, iri);
    return this;
  }
  conformsTo(iri: IRI): this {
    this.data.conformsTo = asArray(this.data.conformsTo, iri);
    return this;
  }
  status(iri: IRI): this {
    this.data.status = iri;
    return this;
  }
  source(record: CatalogRecord | IRI): this {
    this.data.source = record;
    return this;
  }

  build(): CatalogRecord {
    return applySelection(
      this.data as CatalogRecord,
      this.selectedProperties,
      "catalogRecord",
      CATALOG_RECORD_KEYS,
    ) as CatalogRecord;
  }
}

// ---------------------------------------------------------------------------
// CatalogBuilder
// ---------------------------------------------------------------------------

export class CatalogBuilder extends ResourceBuilder<CatalogBuilder, Catalog> {
  constructor(selectedProperties?: SelectionMap) {
    super(selectedProperties, "catalog");
  }
  addDataset(dataset: Dataset): this {
    this.data.dataset = asArray(this.data.dataset as any, dataset) as any;
    return this;
  }
  addService(service: DataService): this {
    this.data.service = asArray(this.data.service as any, service) as any;
    return this;
  }
  addCatalog(catalog: Catalog): this {
    this.data.catalog = asArray(this.data.catalog as any, catalog) as any;
    return this;
  }
  addResource(resource: Resource): this {
    this.data.resource = asArray(this.data.resource as any, resource) as any;
    return this;
  }
  addRecord(record: CatalogRecord): this {
    this.data.record = asArray(this.data.record as any, record) as any;
    return this;
  }
  themeTaxonomy(iri: IRI): this {
    this.data.themeTaxonomy = asArray(
      this.data.themeTaxonomy as any,
      iri,
    ) as any;
    return this;
  }

  build(): Catalog {
    return this.applySelection({ ...this.data }, CATALOG_KEYS);
  }
}

// ===========================================================================
// Example usage
// ===========================================================================

// const csvDistribution = new DistributionBuilder(
//   "https://data.example.org/air-quality/2024.csv",
// )
//   .title("Air quality 2024 - CSV")
//   .mediaType("text/csv")
//   .byteSize(4_200_000)
//   .downloadURL("https://data.example.org/air-quality/2024.csv")
//   .build();

// const apiDistribution = new DistributionBuilder(
//   "https://api.example.org/air-quality",
// )
//   .title("Air quality - REST API")
//   .mediaType("application/json")
//   .build();

// const temporalCoverage = new PeriodOfTimeBuilder()
//   .startDate("2024-01-01")
//   .endDate("2024-12-31")
//   .build();

// const publisher = new AgentBuilder()
//   .uri("https://example.org/org/env-agency")
//   .name("Environmental Agency")
//   .homepage("https://example.org")
//   .build();

// const airQualityDataset = new DatasetBuilder()
//   .uri("https://data.example.org/datasets/air-quality-2024")
//   .title("Air Quality Measurements 2024")
//   .description("Hourly air quality readings from 50 monitoring stations.")
//   .issued("2024-01-15")
//   .modified("2024-12-31")
//   .publisher(publisher)
//   .keyword("air quality")
//   .keyword("environment")
//   .keyword("pollution")
//   .theme({ uri: "http://eurovoc.europa.eu/2467", prefLabel: "Air quality" })
//   .license("https://creativecommons.org/licenses/by/4.0/")
//   .temporal(temporalCoverage)
//   .accrualPeriodicity("http://purl.org/cld/freq/hourly")
//   .distribution(csvDistribution)
//   .distribution(apiDistribution)
//   .build();

// const sparqlService = new DataServiceBuilder(
//   "https://sparql.example.org/endpoint",
// )
//   .uri("https://data.example.org/services/sparql")
//   .title("SPARQL endpoint")
//   .description("Query all datasets in the catalog using SPARQL 1.1.")
//   .endpointDescription("https://sparql.example.org/endpoint?service")
//   .servesDataset(airQualityDataset)
//   .build();

// const record = new CatalogRecordBuilder(airQualityDataset)
//   .uri("https://data.example.org/records/air-quality-2024")
//   .issued("2024-01-15")
//   .modified("2024-12-31")
//   .build();

// const catalog = new CatalogBuilder()
//   .uri("https://data.example.org/catalog")
//   .title("Example Open Data Catalog")
//   .description("A catalog of environmental datasets published by the agency.")
//   .publisher(publisher)
//   .license("https://creativecommons.org/licenses/by/4.0/")
//   .themeTaxonomy("http://eurovoc.europa.eu/")
//   .addDataset(airQualityDataset)
//   .addService(sparqlService)
//   .addRecord(record)
//   .build();

// console.log(JSON.stringify(catalog, null, 2));
