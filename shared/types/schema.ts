export type SchemaAnalysis = {
  usesDcat: boolean;
  dcatKeys: string[];
  dcatIris: string[];
  customProperties: string[];
  classHints: string[];
};

export type SchemaStoreResponse = {
  stored: boolean;
  analysis?: SchemaAnalysis;
  message?: string;
};
