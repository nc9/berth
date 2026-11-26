import { envVarsFromAuth } from "../catalog/auth.ts";
import { AUTH } from "./auth.ts";
import type { ContainerType, Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const RETAIL = "https://prices.azure.com/api/retail/prices";
const ACA_METERS = `${RETAIL}?$filter=serviceName eq 'Azure Container Apps' and armRegionName eq 'eastus' and priceType eq 'Consumption'`;
const ACI_METERS = `${RETAIL}?$filter=serviceName eq 'Container Instances' and armRegionName eq 'eastus' and priceType eq 'Consumption'`;
const VM_METERS = `${RETAIL}?$filter=armSkuName eq 'Standard_D2s_v5' and armRegionName eq 'eastus' and priceType eq 'Consumption'`;

const FIREWALL_NOTE =
  "No native domain allowlist. A domain allowlist needs Azure Firewall FQDN rules (unverified, page not read).";

const GIB = 1024;

const sandboxTiers = [
  ["xs", 0.25, 0.5, 5],
  ["s", 0.5, 1, 10],
  ["m", 1, 2, 20],
  ["l", 2, 4, 40],
  ["xl", 4, 8, 80],
  ["2xl", 8, 16, 160],
  ["3xl", 16, 32, 320],
] as const;

const sandboxes: ContainerType[] = sandboxTiers.map(
  ([tier, vcpu, gib, disk]) => ({
    id: `aca-sandbox-${tier}`,
    service: "container-apps-sandboxes",
    provider: "azure",
    kind: "preset",
    status: "preview",
    vcpu,
    memoryMiB: gib * GIB,
    diskGiB: disk,
    os: ["linux"],
    arch: ["x86_64"],
    isolation: "microvm",
    regions: ["eastus"],
    notes: [
      "Status is preview per the issue; secondary sources conflict (GA week of 2026-09-23 vs public preview) and the Learn page shows no banner.",
      "OS, architecture, GPU and regions are not documented: Linux x86_64 and eastus are assumptions.",
      "The egress proxy sits outside the sandbox, allows or blocks by host and injects secrets. Without a policy outbound is unrestricted. Wildcard syntax is unconfirmed (details page not read).",
      "Max lifetime is not documented. Auto-suspend on idle; auto-delete N days after stop.",
      "Rates are the Container Apps Consumption meters. Whether sandboxes have their own meter is unconfirmed, so they are marked unverified.",
      "Source: https://learn.microsoft.com/en-us/azure/container-apps/sandboxes-overview",
    ],
    price: {
      currency: "USD",
      billing: "wall-clock",
      granularity: "s",
      rates: [
        rate(
          "vcpu",
          "per-vcpu-hour",
          0.0864,
          { value: 0.000024, unit: "usd/vcpu-second" },
          ACA_METERS,
          true,
        ),
        rate(
          "memory",
          "per-gib-hour",
          0.0108,
          { value: 0.000003, unit: "usd/gib-second" },
          ACA_METERS,
          true,
        ),
      ],
    },
    capabilities: {
      createFrom: ["image", "snapshot"],
      snapshots: { fs: true, memory: true, fork: false },
      pause: { supported: true, keepsMemory: true },
      egress: { policies: ["open", "allowlist"] },
      exec: { detached: false, streaming: true, tty: true },
      files: { upload: true, download: true },
      ingress: true,
      discovery: { types: false, regions: false, pricing: "api" },
    },
  }),
);

const vmSizeNote =
  "Representative Standard_D2s_v5 (2 vCPU/8 GiB), not a range. List real SKUs with Resource SKUs (needs credentials).";

export const azure: Provider = {
  meta: {
    id: "azure",
    name: "Microsoft Azure",
    website: "https://azure.microsoft.com",
    docs: "https://learn.microsoft.com/en-us/azure/",
    pricingUrl: "https://azure.microsoft.com/en-us/pricing/",
    description:
      "Sandbox-shaped Azure services: Container Apps Sandboxes and dynamic sessions, ACI and VMs.",
    logo: {
      brandUrl: "https://learn.microsoft.com/en-us/azure/architecture/icons/",
    },
    auth: AUTH.azure,
    envVars: envVarsFromAuth(AUTH.azure),
    isolation: ["container", "microvm", "linux-vm"],
    regions: [
      { id: "eastus", name: "East US", geo: "us", selectable: true },
      { id: "eastus2", name: "East US 2", geo: "us", selectable: true },
      { id: "westeurope", name: "West Europe", geo: "eu", selectable: true },
    ],
    sizingMode: "presets",
    freeTier: "unverified",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    ...sandboxes,
    {
      id: "aca-dynamic-sessions",
      service: "container-apps-dynamic-sessions",
      provider: "azure",
      kind: "template",
      // Custom-container example only; code-interpreter session sizes are not documented.
      vcpu: 0.25,
      memoryMiB: 512,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "microvm",
      regions: ["eastus", "eastus2", "westeurope"],
      notes: [
        "Size is the custom-container example (0.25 vCPU/0.5 Gi); code-interpreter session sizes are not documented. Architecture is assumed.",
        "Hyper-V isolation, reported as microvm (Azure does not name the class).",
        "36 regions are listed in the docs; only three are included here.",
        "Egress is blocked by default; sessionNetworkConfiguration EgressEnabled turns it on. No domain allowlist.",
        "Code interpreter is billed per allocated session in one-hour increments. The $0.03/hour meter (eastus, Retail Prices API) fits no rate dimension, so it is not in `rates`.",
        "Microsoft recommends Sandboxes over sessions for new projects.",
      ],
      capabilities: {
        createFrom: ["builtin", "image"],
        egress: { policies: ["none", "open"] },
        ingress: true,
        discovery: { types: false, regions: true, pricing: "api" },
      },
    },
    {
      id: "aci-linux",
      service: "aci",
      provider: "azure",
      kind: "free-form",
      vcpu: { min: 1, max: 32 },
      memoryMiB: { min: 1 * GIB, max: 256 * GIB },
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "container",
      regions: ["eastus"],
      notes: [
        "Max 32 vCPU/256 GB per standard group (big containers). The lower bounds are placeholders: the minimum size is not documented on the page read.",
        "x64 only. Container group on a shared Azure VM; hypervisor isolation is unverified. Confidential containers exist.",
        "The meter runs from the first image pull until the group stops. Image max 15 GB.",
        "Spot (preview) and GPU meters exist and are not modelled.",
        FIREWALL_NOTE,
      ],
      price: {
        currency: "USD",
        billing: "wall-clock",
        granularity: "s",
        rates: [
          rate(
            "vcpu",
            "per-vcpu-hour",
            0.0405,
            { value: 0.0405, unit: "usd/vcpu-hour" },
            ACI_METERS,
          ),
          rate(
            "memory",
            "per-gib-hour",
            0.00445,
            { value: 0.00445, unit: "usd/gb-hour" },
            ACI_METERS,
          ),
        ],
      },
      capabilities: {
        createFrom: ["image"],
        egress: { policies: ["open"] },
        discovery: { types: false, regions: false, pricing: "api" },
      },
    },
    {
      id: "aci-windows",
      service: "aci",
      provider: "azure",
      kind: "free-form",
      vcpu: { min: 1, max: 32 },
      memoryMiB: { min: 1 * GIB, max: 256 * GIB },
      os: ["windows"],
      arch: ["x86_64"],
      isolation: "container",
      regions: ["eastus"],
      notes: [
        "Max 32 vCPU/256 GB per standard group; lower bounds are placeholders.",
        "No price: the Windows software meter ($0.000012/s) has an unconfirmed per-vCPU unit and the Windows vCPU and memory rates were not read.",
        FIREWALL_NOTE,
      ],
      capabilities: {
        createFrom: ["image"],
        egress: { policies: ["open"] },
        discovery: { types: false, regions: false, pricing: "api" },
      },
    },
    {
      id: "vm-linux",
      service: "virtual-machines",
      provider: "azure",
      kind: "free-form",
      vcpu: 2,
      memoryMiB: 8 * GIB,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "linux-vm",
      regions: ["eastus"],
      notes: [
        vmSizeNote,
        `The whole-VM meter is $0.096/h (eastus, 2026-11-26) and fits no per-vCPU rate dimension, so it is not in \`rates\`. Source: ${VM_METERS}`,
        "Spot is $0.020266/h and is not modelled.",
        FIREWALL_NOTE,
      ],
      capabilities: {
        createFrom: ["image"],
        egress: { policies: ["open"] },
        discovery: { types: true, regions: false, pricing: "api" },
      },
    },
    {
      id: "vm-windows",
      service: "virtual-machines",
      provider: "azure",
      kind: "free-form",
      vcpu: 2,
      memoryMiB: 8 * GIB,
      os: ["windows"],
      arch: ["x86_64"],
      isolation: "linux-vm",
      regions: ["eastus"],
      notes: [
        vmSizeNote,
        "Isolation class linux-vm means a full hypervisor VM; the guest is Windows.",
        `The whole-VM meter is $0.188/h (eastus, 2026-11-26) and fits no per-vCPU rate dimension, so it is not in \`rates\`. Source: ${VM_METERS}`,
        "No macOS offering was found.",
        FIREWALL_NOTE,
      ],
      capabilities: {
        createFrom: ["image"],
        egress: { policies: ["open"] },
        discovery: { types: true, regions: false, pricing: "api" },
      },
    },
  ],
};
