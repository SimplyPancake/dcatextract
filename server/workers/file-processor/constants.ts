export const MEDIA_TYPES: Record<string, string> = {
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".json": "application/json",
    ".jsonld": "application/ld+json",
    ".geojson": "application/geo+json",
    ".xml": "application/xml",
    ".rdf": "application/rdf+xml",
    ".ttl": "text/turtle",
    ".n3": "text/n3",
    ".nt": "application/n-triples",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tar": "application/x-tar",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".shp": "application/octet-stream",
    ".gpkg": "application/geopackage+sqlite3",
    ".parquet": "application/vnd.apache.parquet",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
};

export const DCAT_FORMAT_IRIS: Record<string, string> = {
    ".csv": "https://www.iana.org/assignments/media-types/text/csv",
    ".json": "https://www.iana.org/assignments/media-types/application/json",
    ".geojson": "https://www.iana.org/assignments/media-types/application/geo+json",
    ".pdf": "https://www.iana.org/assignments/media-types/application/pdf",
    ".xlsx": "https://www.iana.org/assignments/media-types/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ttl": "https://www.iana.org/assignments/media-types/text/turtle",
};

export const SHAPEFILE_EXTS = new Set([".shp", ".dbf", ".prj", ".shx", ".cpg", ".qpj", ".sbn", ".sbx"]);

export const SKIP_FILES = new Set([
    "readme.md", "readme.txt", "readme", "license", "license.md", "license.txt",
    "changelog.md", "changelog", ".gitignore", ".gitattributes", ".dsstore",
    "makefile", "dockerfile", "package.json", "package-lock.json", "yarn.lock",
]);
