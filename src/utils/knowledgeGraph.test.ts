import {
    describe,
    expect,
    it,
    beforeEach,
    afterEach,
} from "bun:test";
import {
    addGlobalEntity,
    addGlobalRelation,
    addGlobalSummary,
    searchGlobalGraph,
    loadProjectGraph,
    getProjectGraphPath,
    resetGlobalGraph,
    clearMemoryOnly,
} from "./knowledgeGraph.js";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { getProjectsDir } from "./envUtils.js";
import { sanitizePath } from "./sessionStoragePortable.js";
import {
    acquireSharedMutationLock,
    releaseSharedMutationLock,
} from "../test/sharedMutationLock.js";

describe("KnowledgeGraph Global Persistence & RAG", () => {
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const cwd = process.cwd();
    let configDir: string;

    beforeEach(async () => {
        await acquireSharedMutationLock("knowledgeGraph.test.ts");
        configDir = mkdtempSync(join(tmpdir(), "openclaude-test-"));
        process.env.CLAUDE_CONFIG_DIR = configDir;
        resetGlobalGraph();
    });

    afterEach(() => {
        try {
            resetGlobalGraph();
        } finally {
            try {
                if (originalConfigDir === undefined) {
                    delete process.env.CLAUDE_CONFIG_DIR;
                } else {
                    process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
                }
            } finally {
                const dirToRemove = configDir;
                configDir = "";
                try {
                    if (dirToRemove) {
                        rmSync(dirToRemove, { recursive: true, force: true });
                    }
                } finally {
                    releaseSharedMutationLock();
                }
            }
        }
    });

    it("persists entities across loads", async () => {
        await addGlobalEntity("tool", "openclaude", { status: "alpha" });
        const path = getProjectGraphPath(cwd);
        expect(existsSync(path)).toBe(true);

        // Clear cache and reload
        clearMemoryOnly();
        const graph = loadProjectGraph(cwd);
        const entities = Object.values(graph.entities).filter(
            (e) => e.name === "openclaude",
        );
        expect(entities.length).toBe(1);
        expect(entities[0].attributes.status).toBe("alpha");
    });

    it("performs keyword-based RAG search", async () => {
        await addGlobalSummary("The database uses PostgreSQL version 15.", [
            "database",
            "postgres",
            "sql",
        ]);
        await addGlobalSummary(
            "The frontend is built with React and Tailwind.",
            ["frontend", "react", "css"],
        );

        const result = await searchGlobalGraph("PostgreSQL");
        expect(result.toLowerCase()).toContain("database");
        expect(result.toLowerCase()).toContain("postgresql");
        expect(result.toLowerCase()).not.toContain("react");
    });

    it("deduplicates entities and updates attributes", async () => {
        await addGlobalEntity("tool", "openclaude", { status: "alpha" });
        await addGlobalEntity("tool", "openclaude", {
            status: "beta",
            version: "0.6.0",
        });

        const graph = loadProjectGraph(cwd);
        const entities = Object.values(graph.entities).filter(
            (e) => e.name === "openclaude",
        );
        expect(entities.length).toBe(1);
        expect(entities[0].attributes.status).toBe("beta");
        expect(entities[0].attributes.version).toBe("0.6.0");
    });

    it("clears Orama database and persistence file on resetGlobalGraph", async () => {
        const { initOrama, getOramaPersistencePath } =
            await import("./knowledgeGraph.js");

        await initOrama(cwd);
        await addGlobalSummary("Orama test summary", ["orama"]);

        const oramaPath = getOramaPersistencePath(cwd);
        expect(require("fs").existsSync(oramaPath)).toBe(true);

        resetGlobalGraph();
        expect(require("fs").existsSync(oramaPath)).toBe(false);
    });

    describe("Hybrid Architecture: Orama + JSON", () => {
        it("creates Orama persistence by default", async () => {
            const oramaPath = join(
                getProjectsDir(),
                sanitizePath(cwd),
                "knowledge.orama",
            );

            // Ensure clean state: remove orama file if it exists from previous tests
            if (existsSync(oramaPath)) rmSync(oramaPath);
            clearMemoryOnly();

            await addGlobalEntity("test", "orama-active", { val: "yes" });
            expect(existsSync(oramaPath)).toBe(true);

            const result = await searchGlobalGraph("orama-active");
            expect(result).toContain("ORAMA RAG");
            expect(result).toContain("orama-active");
        });

        it("restores Orama from persistence file", async () => {
            // First run: add and save
            await addGlobalEntity("test", "persistent-orama", { data: "42" });
            clearMemoryOnly(); // Reset in-memory oramaDb cache

            // Second run: search (should trigger restore)
            const result = await searchGlobalGraph("persistent-orama");
            expect(result).toContain("ORAMA RAG");
            expect(result).toContain("persistent-orama");
        });

        it("rebuilds Orama from JSON if persistence is missing", async () => {
            const oramaPath = join(
                getProjectsDir(),
                sanitizePath(cwd),
                "knowledge.orama",
            );

            // 1. Add data via standard hybrid path
            await addGlobalEntity("type", "rebuild-test", { status: "ok" });
            expect(existsSync(oramaPath)).toBe(true);

            // 2. Kill memory and delete Orama file, but keep JSON
            clearMemoryOnly();
            rmSync(oramaPath);
            expect(existsSync(oramaPath)).toBe(false);

            // 3. Search should trigger self-healing rebuild from JSON
            const result = await searchGlobalGraph("rebuild-test");
            expect(result).toContain("ORAMA RAG");
            expect(result).toContain("rebuild-test");
            expect(existsSync(oramaPath)).toBe(true);
        });

        it("quarantines corrupted JSON persistence and starts from an empty graph", () => {
            const path = getProjectGraphPath(cwd);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, "{not-json", "utf8");

            clearMemoryOnly();
            const graph = loadProjectGraph(cwd);

            expect(Object.keys(graph.entities)).toHaveLength(0);
            expect(
                readdirSync(dirname(path)).some((entry) =>
                    entry.startsWith("knowledge_graph.json.corrupted."),
                ),
            ).toBe(true);
        });

        it("returns an empty string for no-hit searches even if rules exist", async () => {
            const { addGlobalRule } = await import("./knowledgeGraph.js");
            resetGlobalGraph();
            await addGlobalRule("Always use TypeScript.");

            const result = await searchGlobalGraph(
                "definitely-no-memory-matches",
            );
            expect(result).toBe("");
        });
    });
});
