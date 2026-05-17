import {
    describe,
    expect,
    it,
    beforeEach,
    afterEach,
} from "bun:test";
import {
    addGlobalEntity,
    resetGlobalGraph,
    clearMemoryOnly,
    getGlobalGraph,
    initOrama,
} from "../knowledgeGraph.js";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getProjectsDir } from "../envUtils.js";
import { sanitizePath } from "../sessionStoragePortable.js";
import {
    acquireSharedMutationLock,
    releaseSharedMutationLock,
} from "../../test/sharedMutationLock.js";

describe("SQLite Storage Layer", () => {
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const cwd = process.cwd();
    let configDir: string;

    beforeEach(async () => {
        await acquireSharedMutationLock("SQLiteProvider.test.ts");
        configDir = mkdtempSync(join(tmpdir(), "kaltcode-sqlite-"));
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

    it("persists data in SQLite database", async () => {
        const sqlitePath = join(
            getProjectsDir(),
            sanitizePath(cwd),
            "knowledge.db",
        );

        // 1. Add data
        await addGlobalEntity("tool", "sqlite-test", { status: "durable" });
        expect(existsSync(sqlitePath)).toBe(true);

        // 2. Simulate process restart (clear memory cache)
        clearMemoryOnly();

        // 3. Load should come from SQLite (hydrated by JSON)
        const graph = getGlobalGraph();
        const entity = Object.values(graph.entities).find(
            (e) => e.name === "sqlite-test",
        );
        expect(entity).toBeDefined();
        expect(entity?.attributes.status).toBe("durable");
    });

    it("self-heals SQLite from JSON if DB is deleted", async () => {
        const sqlitePath = join(
            getProjectsDir(),
            sanitizePath(cwd),
            "knowledge.db",
        );
        const jsonPath = join(
            getProjectsDir(),
            sanitizePath(cwd),
            "knowledge_graph.json",
        );

        // 1. Add data to both
        await addGlobalEntity("tool", "self-heal-test", { val: "safe" });
        expect(existsSync(sqlitePath)).toBe(true);
        expect(existsSync(jsonPath)).toBe(true);

        // 2. Delete SQLite DB but keep JSON
        clearMemoryOnly();
        rmSync(sqlitePath);
        expect(existsSync(sqlitePath)).toBe(false);

        // 3. Requesting the graph should trigger hydration from JSON into a NEW SQLite DB
        // In the async architecture, we must await initialization to trigger the rebuild.
        await initOrama(cwd);
        const graph = getGlobalGraph();
        const entity = Object.values(graph.entities).find(
            (e) => e.name === "self-heal-test",
        );
        expect(entity).toBeDefined();
        expect(entity?.attributes.val).toBe("safe");

        // 4. Verify SQLite was recreated
        expect(existsSync(sqlitePath)).toBe(true);
    });

    it("handles large transactions (Stress Test)", async () => {
        const count = 100;

        // Add 100 entities sequentially (mutation queue)
        for (let i = 0; i < count; i++) {
            await addGlobalEntity("bulk", `item_${i}`, { index: String(i) });
        }

        clearMemoryOnly();
        const graph = getGlobalGraph();
        expect(Object.keys(graph.entities).length).toBe(count);
    });
});
