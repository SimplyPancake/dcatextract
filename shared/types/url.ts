export type DataProvider = 'Kaggle' | 'HuggingFace' | 'GitHub' | 'Zenodo' | 'Unknown'

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

  {
    provider: "Zenodo",
    baseUrl: "https://zenodo.org/records/",

    // Matches records:
    // https://zenodo.org/records/1234567
    // https://zenodo.org/record/1234567
    identifierRegex:
      /^https:\/\/zenodo\.org\/(?:records|record)\/([0-9]+)(?:\/.*)?$/,

    example:
      "https://zenodo.org/records/1234567",
  },
];

export const PROVIDER_BASE_URLS: Record<DataProvider, string | null> = {
  Kaggle: "https://www.kaggle.com/datasets/",
  HuggingFace: "https://huggingface.co/datasets/",
  GitHub: "https://github.com/",
  Zenodo: "https://zenodo.org/records/",
  CKAN: null,
  Unknown: null,
};

export const PROVIDER_DOWNLOAD_BASE_URLS: Record<DataProvider, string | null> = {
  Kaggle: "https://www.kaggle.com/api/v1/datasets/download/",
  HuggingFace: "https://huggingface.co/datasets/",
  GitHub: "https://codeload.github.com/",
  Zenodo: "https://zenodo.org/api/records/",
  CKAN: null,
  Unknown: null,
};

export function getProviderBaseUrl(provider: DataProvider): string | null {
  return PROVIDER_BASE_URLS[provider] ?? null;
}

export function getProviderDownloadBaseUrl(provider: DataProvider): string | null {
  return PROVIDER_DOWNLOAD_BASE_URLS[provider] ?? null;
}

export function buildProviderAccessUrl(
  provider: DataProvider,
  identifier: string,
  sourceUrl?: string
): string | null {
  if (sourceUrl && /^https?:\/\//.test(sourceUrl)) return sourceUrl;
  const base = getProviderBaseUrl(provider);
  return base ? `${base}${identifier}` : null;
}

export function buildProviderDownloadUrl(
  provider: DataProvider,
  identifier: string,
  branch: "main" | "master" = "main"
): string | null {
  const base = getProviderDownloadBaseUrl(provider);
  if (!base) return null;
  if (provider === "GitHub") {
    return `${base}${identifier}/zip/refs/heads/${branch}`;
  }
  if (provider === "HuggingFace") {
    return `${base}${identifier}/archive/refs/heads/${branch}.zip`;
  }
  if (provider === "Kaggle") {
    return `${base}${identifier}`;
  }
  if (provider === "Zenodo") {
    return `${base}${identifier}`;
  }
  return null;
}