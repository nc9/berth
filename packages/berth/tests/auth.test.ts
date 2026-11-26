import { describe, expect, test } from "bun:test";
import {
  builtInProviders,
  envVarsFromAuth,
  validateAuthConfig,
  validateProvider,
} from "../src/index.ts";
import type { ProviderMeta } from "../src/index.ts";
import { fixture } from "./fixture.ts";

const meta = (): ProviderMeta => structuredClone(fixture().meta);

describe("auth data", () => {
  test("every provider has auth, exactly one default, and no secret example", () => {
    for (const { meta: m } of builtInProviders) {
      expect(m.auth.length).toBeGreaterThan(0);
      expect(m.auth.filter((a) => a.default).length).toBe(1);
      expect(validateProvider(m)).toEqual([]);
    }
  });

  test("envVars is derived from the default method's fields", () => {
    for (const { meta: m } of builtInProviders) {
      const def = m.auth.find((a) => a.default)!;
      expect(m.envVars).toEqual(
        def.fields.flatMap((f) => (f.env ? [f.env] : [])),
      );
      expect(m.envVars).toEqual(envVarsFromAuth(m.auth));
    }
  });

  test("pins existing envVars for providers that already had them", () => {
    const env = (id: string) =>
      builtInProviders.find((p) => p.meta.id === id)!.meta.envVars;
    expect(env("modal")).toEqual(["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]);
    expect(env("aws")).toEqual([
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "AWS_REGION",
    ]);
    expect(env("gcp")).toEqual([
      "GOOGLE_APPLICATION_CREDENTIALS",
      "GOOGLE_CLOUD_PROJECT",
    ]);
    expect(env("azure")).toEqual([
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
      "AZURE_SUBSCRIPTION_ID",
    ]);
    for (const [id, old] of [
      ["aws", ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]],
      ["boatdev", ["BOAT_API_KEY"]],
      ["daytona", ["DAYTONA_API_KEY"]],
      ["e2b", ["E2B_API_KEY"]],
      ["morph", ["MORPH_API_KEY"]],
    ] as const)
      for (const n of old) expect(env(id)).toContain(n);
  });

  test("multi-method providers list each method", () => {
    const kinds = (id: string) =>
      builtInProviders
        .find((p) => p.meta.id === id)!
        .meta.auth.map((a) => a.kind);
    expect(kinds("aws")).toEqual(["iam_keys", "iam_role"]);
    expect(kinds("azure")).toEqual([
      "oauth_client",
      "oauth_client",
      "workload_identity",
    ]);
    expect(kinds("gcp")).toEqual(["service_account_json", "workload_identity"]);
  });
});

describe("auth validation refusals", () => {
  test("fixture is valid", () => expect(validateProvider(meta())).toEqual([]));

  test("no auth", () => {
    const m = meta();
    m.auth = [];
    expect(validateProvider(m).join()).toContain("at least one method");
  });

  test("two defaults", () => {
    const m = meta();
    m.auth.push({ ...m.auth[0]!, id: "other" });
    expect(validateProvider(m).join()).toContain("exactly one auth method");
  });

  test("no default", () => {
    const m = meta();
    delete m.auth[0]!.default;
    expect(validateProvider(m).join()).toContain("exactly one auth method");
  });

  test("secret field with example or default", () => {
    const m = meta();
    m.auth[0]!.fields[0]!.example = "sk-real";
    m.auth[0]!.fields[0]!.default = "sk-real";
    const e = validateProvider(m).join();
    expect(e).toContain("must not carry an example");
    expect(e).toContain("must not carry a default");
  });

  test("duplicate field name", () => {
    const m = meta();
    m.auth[0]!.fields.push({ ...m.auth[0]!.fields[1]! });
    expect(validateProvider(m).join()).toContain("duplicate field name");
  });

  test("unverified method needs notes", () => {
    const m = meta();
    m.auth[0]!.status = "unverified";
    expect(validateProvider(m).join()).toContain("needs the reason in notes");
  });
});

describe("validateAuthConfig", () => {
  test("complete config is ok", () => {
    const r = validateAuthConfig("modal", "token-pair", {
      "token-id": "present",
      "token-secret": "present",
    });
    expect(r).toEqual({
      missing: [],
      unknown: [],
      inlineSecrets: [],
      ok: true,
    });
  });

  test("reports missing required and unknown fields", () => {
    const r = validateAuthConfig("aws", "iam-keys", {
      "access-key-id": "present",
      bogus: "x",
    });
    expect(r.missing).toEqual(["secret-access-key", "region"]);
    expect(r.unknown).toEqual(["bogus"]);
    expect(r.ok).toBe(false);
  });

  test("optional fields may be absent; non-secret values are accepted", () => {
    const r = validateAuthConfig("daytona", "api-key", {
      "api-key": "present",
      "api-url": "https://daytona.example.com",
    });
    expect(r.ok).toBe(true);
  });

  test("flags a secret field given a value instead of presence", () => {
    const r = validateAuthConfig("e2b", "api-key", { "api-key": "e2b_abc" });
    expect(r.inlineSecrets).toEqual(["api-key"]);
    expect(JSON.stringify(r)).not.toContain("e2b_abc");
    expect(r.ok).toBe(false);
  });

  test("empty string counts as missing", () => {
    expect(
      validateAuthConfig("e2b", "api-key", { "api-key": "" }).missing,
    ).toEqual(["api-key"]);
  });

  test("unknown provider or method throws", () => {
    expect(() => validateAuthConfig("nope", "x", {})).toThrow();
    expect(() => validateAuthConfig("aws", "nope", {})).toThrow();
  });
});

describe("auth config for project and subscription ids", () => {
  test("stored gcp project and azure subscription are known fields", () => {
    expect(
      validateAuthConfig("gcp", "service-account-json", {
        credentials: "present",
        "project-id": "p",
      }).ok,
    ).toBe(true);
    expect(
      validateAuthConfig("azure", "service-principal", {
        "tenant-id": "t",
        "client-id": "c",
        "client-secret": "present",
        "subscription-id": "s",
      }).ok,
    ).toBe(true);
  });

  test("a method without a fields array is reported, not thrown", () => {
    const m = meta();
    (m.auth[0] as { fields?: unknown }).fields = undefined;
    expect(validateProvider(m).join()).toContain("fields must be an array");
  });
});
