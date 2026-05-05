import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { inferDcatFromFiles } from "./index.js";

describe("inferDcatFromFiles", () => {
    it("throws when no files are provided", () => {
        expect(() => inferDcatFromFiles([])).toThrow("No files provided for inference");
    });

    it("accepts a file array", () => {
        const fixturesFolder = path.join(__dirname, "__fixtures__");
        const fixtures = fs.readdirSync(fixturesFolder);

        const filePaths = fixtures.map((name) => path.join(fixturesFolder, name));
        expect(inferDcatFromFiles(filePaths)).toBeUndefined();
    });

    it("accepts files with shell metacharacters in the name", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-weird-"));
        const weirdName = "weird;name $(touch x).txt";
        const filePath = path.join(tmpDir, weirdName);

        fs.writeFileSync(filePath, "hello", "utf8");

        try {
            expect(inferDcatFromFiles([filePath])).toBeUndefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
