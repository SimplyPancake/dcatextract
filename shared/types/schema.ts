export interface CustomProperty {
  iri: string
  context: 'dataset' | 'distribution' | 'dataService' | 'catalogRecord'
}

export interface SchemaAnalysis {
  usesDcat: boolean
  dcatKeys: string[]
  dcatIris: string[]
  customProperties: CustomProperty[]   // was: string[]
  classHints: string[]
}

export type SchemaStoreResponse = {
  stored: boolean;
  analysis?: SchemaAnalysis;
  message?: string;
};
