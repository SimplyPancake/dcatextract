export type DataProvider = 'Kaggle' | 'HuggingFace' | 'CKAN' | 'GitHub' | 'Unknown'

export type URLScanResult = {
	sourceType: DataProvider
	identifier: string
}

type DatasetProviderConfig = {
  provider: DataProvider;
  baseUrl: string;
  identifierRegex: RegExp;
  example: string;
};

export const datasetProviders: DatasetProviderConfig[] = [
  {
    provider: "Kaggle",
    baseUrl: "https://www.kaggle.com/datasets/",
    
    // Matches:
    // https://www.kaggle.com/datasets/hamnamunir/pakistan-education-system-dataset-2022-2025
    //
    // Captures:
    // 1 => hamnamunir
    // 2 => pakistan-education-system-dataset-2022-2025
    identifierRegex:
      /^https:\/\/www\.kaggle\.com\/datasets\/([^/]+)\/([^/?#]+)\/?$/,

    example:
      "https://www.kaggle.com/datasets/hamnamunir/pakistan-education-system-dataset-2022-2025",
  },

  {
    provider: "HuggingFace",
    baseUrl: "https://huggingface.co/datasets/",

    // Matches:
    // https://huggingface.co/datasets/dianetc/OBLIQ-Bench
    //
    // Captures:
    // 1 => dianetc
    // 2 => OBLIQ-Bench
    identifierRegex:
      /^https:\/\/huggingface\.co\/datasets\/([^/]+)\/([^/?#]+)\/?$/,

    example:
      "https://huggingface.co/datasets/dianetc/OBLIQ-Bench",
  },

  {
    provider: "GitHub",
    baseUrl: "https://github.com/",

    // Matches repos:
    // https://github.com/user/repo
    //
    // Optional support for tree/blob paths:
    // https://github.com/user/repo/tree/main/data
    //
    // Captures:
    // 1 => user
    // 2 => repo
    identifierRegex:
      /^https:\/\/github\.com\/([^/]+)\/([^/?#]+)(?:\/.*)?$/,

    example:
      "https://github.com/user/repo",
  },
];