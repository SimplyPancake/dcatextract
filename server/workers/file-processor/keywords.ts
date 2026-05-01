import * as path from "node:path";

export function extractKeywords(inferred: Record<string, unknown>, ext: string, filename: string): string[] {
    const kws = new Set<string>();

    // Format-based
    if ([".csv", ".tsv"].includes(ext)) kws.add("tabular data");
    if (ext === ".json") kws.add("json");
    if (ext === ".geojson" || inferred.jsonType === "GeoJSON FeatureCollection") {
        kws.add("geospatial"); kws.add("vector");
    }
    if ([".ttl", ".n3", ".rdf", ".nt", ".jsonld"].includes(ext)) {
        kws.add("linked data"); kws.add("rdf");
    }
    if (ext === ".pdf") kws.add("document");
    if ([".png", ".jpg", ".jpeg"].includes(ext)) kws.add("image");
    if ([".tif", ".tiff"].includes(ext)) { kws.add("raster"); kws.add("geospatial"); }
    if (ext === ".parquet") { kws.add("tabular data"); kws.add("parquet"); }
    if (ext === ".gpkg") { kws.add("geospatial"); kws.add("geopackage"); }

    // Column / key based
    const cols = [
        ...(inferred.columns as string[] ?? []),
        ...(inferred.keys as string[] ?? []),
        ...(inferred.properties as string[] ?? []),
        ...(inferred.geoColumns as string[] ?? []),
    ];
    for (const col of cols) {
        if (/^(lat|latitude|lon|longitude|lng|x|y|geometry|geom|wkt|bbox)$/i.test(col)) kws.add("geospatial");
        if (/^(date|time|timestamp|year|month|day|datetime)$/i.test(col)) kws.add("time series");
        if (/^(pop|population|census|inhabitants|household)$/i.test(col)) kws.add("demographics");
        if (/^(temp|temperature|precip|rainfall|wind|humidity|co2|pm\d+)$/i.test(col)) kws.add("environment");
        if (/^(price|cost|revenue|gdp|income|wage|salary|budget)$/i.test(col)) kws.add("economics");
        if (/^(id|identifier|code|uuid|key)$/i.test(col)) kws.add("reference data");
    }

    // Filename stem words
    const stem = path.basename(filename, ext).toLowerCase();
    for (const word of stem.replace(/[-_.]/g, " ").split(/\s+/)) {
        if (word.length > 3 && !/^\d+$/.test(word)) kws.add(word);
    }

    return [...kws];
}
