import { describe, expect, test } from "bun:test";
import { catalog } from "@nc9/berth";
import { MODAL_INFO } from "../src/index.ts";

describe("modal adapter vs catalog record", () => {
  const caps = catalog.getProvider("modal")?.capabilities;
  const info: {
    network: {
      egressPolicy: readonly string[];
      mutuallyExclusive: boolean;
      ingress: boolean;
    };
    createFrom: readonly string[];
    labels: boolean;
    list: boolean;
    pause: boolean;
    arch: readonly string[];
  } = MODAL_INFO;

  test("catalog has a modal record", () => {
    expect(caps).toBeDefined();
  });

  test("egress, creation and listing facts agree", () => {
    expect([...info.network.egressPolicy].sort()).toEqual(
      [...(caps?.egress?.policies ?? [])].sort(),
    );
    expect(info.network.mutuallyExclusive).toBe(
      !!caps?.egress?.mutuallyExclusive,
    );
    expect(info.network.ingress).toBe(!!caps?.ingress);
    expect([...info.createFrom]).toEqual([...(caps?.createFrom ?? [])]);
    expect(info.labels).toBe(!!caps?.labels);
    expect(info.list).toBe(!!caps?.list);
    expect(info.pause).toBe(!!caps?.pause?.supported);
  });

  test("architecture is not documented, so not claimed", () => {
    expect(info.arch).toEqual([]);
  });
});
