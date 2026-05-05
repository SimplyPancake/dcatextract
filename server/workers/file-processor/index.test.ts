import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
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

    const zipCheck = spawnSync("zip", ["-v"], { stdio: "ignore" });
    const unzipCheck = spawnSync("unzip", ["-v"], { stdio: "ignore" });
    const zipTest = zipCheck.status === 0 && unzipCheck.status === 0 ? it : it.skip;

    zipTest("accepts a zip file", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-zip-"));
        const srcDir = path.join(tmpDir, "src");
        const sourceFile = path.join(srcDir, "sample.txt");
        const zipPath = path.join(tmpDir, "fixtures.zip");

        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(sourceFile, "hello", "utf8");

        try {
            const zipResult = spawnSync("zip", ["-j", zipPath, sourceFile], { stdio: "ignore" });
            if (zipResult.status !== 0) {
                throw new Error("Failed to create test zip file");
            }

            expect(inferDcatFromFiles([zipPath])).toBeUndefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    zipTest("rejects zip-slip entries", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-zipslip-"));
        const parentDir = path.join(tmpDir, "parent");
        const workDir = path.join(tmpDir, "work");
        const zipPath = path.join(tmpDir, "zipslip.zip");

        fs.mkdirSync(parentDir, { recursive: true });
        fs.mkdirSync(workDir, { recursive: true });
        fs.writeFileSync(path.join(parentDir, "evil.txt"), "evil", "utf8");

        try {
            const zipResult = spawnSync("zip", ["-q", zipPath, "../parent/evil.txt"], {
                cwd: workDir,
                stdio: "ignore",
            });
            if (zipResult.status !== 0) {
                throw new Error("Failed to create zip-slip test archive");
            }

            expect(() => inferDcatFromFiles([zipPath])).toThrow("Failed to extract zip: Zip contains unsafe entry");
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    zipTest("rejects zips deeper than max depth", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcat-zipdepth-"));
        const srcDir = path.join(tmpDir, "src");
        const deepDir = path.join(srcDir, "a", "b", "c", "d", "e", "f");
        const sourceFile = path.join(deepDir, "sample.txt");
        const zipPath = path.join(tmpDir, "deep.zip");

        fs.mkdirSync(deepDir, { recursive: true });
        fs.writeFileSync(sourceFile, "hello", "utf8");

        try {
            const zipResult = spawnSync("zip", ["-q", "-r", zipPath, "."], {
                cwd: srcDir,
                stdio: "ignore",
            });
            if (zipResult.status !== 0) {
                throw new Error("Failed to create deep zip archive");
            }

            expect(() => inferDcatFromFiles([zipPath])).toThrow("Failed to extract zip: Zip exceeds max depth");
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
