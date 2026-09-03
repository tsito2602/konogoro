import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stagingConfig = readFileSync(new URL("../../wrangler.staging.jsonc", import.meta.url), "utf8");
const productionConfig = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const stagingWorkflow = readFileSync(new URL("../../.github/workflows/deploy-staging.yml", import.meta.url), "utf8");

describe("staging deployment configuration", () => {
  it("uses resources isolated from production", () => {
    const productionDatabaseId = productionConfig.match(/"database_id": "([^"]+)"/)?.[1];

    if (!productionDatabaseId) throw new Error("Production D1 database ID is missing");
    expect(stagingConfig).toContain('"name": "konogoro-staging"');
    expect(stagingConfig).toContain('"database_name": "family-timeline-staging"');
    expect(stagingConfig).toContain('"bucket_name": "family-timeline-media-staging"');
    expect(stagingConfig).toContain('"STAGING": "true"');
    expect(stagingConfig).not.toContain(productionDatabaseId);
    expect(stagingConfig).not.toContain('"triggers"');
  });

  it("deploys only from the staging branch", () => {
    expect(stagingWorkflow).toContain("      - staging");
    expect(stagingWorkflow).toContain("wrangler.staging.jsonc");
    expect(stagingWorkflow).toContain("family-timeline-staging");
    expect(stagingWorkflow).toContain("family-timeline-media-staging");
    expect(stagingWorkflow).not.toContain("r2 bucket list --json");
    expect(stagingWorkflow).toContain("already exists, and you own it");
  });
});
