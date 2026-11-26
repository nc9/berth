import { describe, expect, test } from "bun:test";
import { catalog, validateProviders } from "../src/index.ts";
import { providers } from "../src/data/index.ts";

const ids = (r: { provider: string; id: string }[]) =>
  r.map((t) => `${t.provider}/${t.id}`).sort();

describe("cloud catalog data", () => {
  test("validates with zero errors", () => {
    expect(validateProviders(providers)).toEqual([]);
  });
  test("one provider per cloud, every type has a service tag", () => {
    expect(catalog.getProviders().map((p) => p.id)).toEqual([
      "aws",
      "azure",
      "gcp",
      "daytona",
      "modal",
      "e2b",
    ]);
    for (const t of catalog
      .getTypes("aws")
      .concat(catalog.getTypes("azure"), catalog.getTypes("gcp")))
      expect(t.service).toBeTruthy();
  });
  test("each documented service is present", () => {
    const services = (p: string) => [
      ...new Set(catalog.getTypes(p).map((t) => t.service)),
    ];
    expect(services("aws")).toEqual([
      "lambda-microvms",
      "agentcore-code-interpreter",
      "fargate",
      "ec2",
    ]);
    expect(services("azure")).toEqual([
      "container-apps-sandboxes",
      "container-apps-dynamic-sessions",
      "aci",
      "virtual-machines",
    ]);
    expect(services("gcp")).toEqual([
      "cloud-run-jobs",
      "cloud-run-sandboxes",
      "gke-agent-sandbox",
      "compute-engine",
    ]);
  });
  test("macos is only AWS EC2 Mac, with a 24 h minimum", () => {
    expect(ids(catalog.find({ os: "macos" }))).toEqual(["aws/ec2-mac"]);
    expect(catalog.getType("aws", "ec2-mac")?.capabilities?.minBillingSec).toBe(
      86400,
    );
  });
  test("allowlist egress is only Azure ACA Sandboxes", () => {
    const found = catalog
      .find({ egress: "allowlist" })
      .filter((t) => ["aws", "azure", "gcp"].includes(t.provider));
    expect(found.length).toBeGreaterThan(0);
    for (const t of found) {
      expect(t.provider).toBe("azure");
      expect(t.service).toBe("container-apps-sandboxes");
    }
  });
  test("preview products carry preview status", () => {
    expect(
      [
        ...new Set(catalog.find({ status: "preview" }).map((t) => t.service)),
      ].sort(),
    ).toEqual(["cloud-run-sandboxes", "container-apps-sandboxes"]);
  });
  test("every rate has a source, date and raw value", () => {
    for (const t of catalog.getTypes())
      for (const r of t.price?.rates ?? []) {
        expect(r.sourceUrl.startsWith("https://")).toBe(true);
        expect(r.verifiedAt).toBeTruthy();
        expect(r.raw).toBeDefined();
      }
  });
  test("third-party Lambda MicroVM rates are marked unverified", () => {
    const rates = catalog.getType("aws", "lambda-microvm")?.price?.rates ?? [];
    expect(rates.length).toBe(2);
    for (const r of rates) expect(r.unverified).toBe(true);
  });
  test("types without researched prices have no price", () => {
    for (const id of ["ec2-linux", "ec2-windows", "ec2-mac"])
      expect(catalog.getType("aws", id)?.price).toBeUndefined();
    for (const t of catalog.getTypes("gcp")) expect(t.price).toBeUndefined();
  });
});
