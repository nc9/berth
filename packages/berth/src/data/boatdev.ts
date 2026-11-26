import { envVarsFromAuth } from "../catalog/auth.ts";
import { AUTH } from "./auth.ts";
import type { ContainerType, Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://docs.boat.dev/pricing.md";

const SIZES = [
  { id: "small", vcpu: 2, gb: 4, disk: 51, hourly: 0.018 },
  { id: "default", vcpu: 4, gb: 8, disk: 51, hourly: 0.036 },
  { id: "large", vcpu: 8, gb: 16, disk: 111, hourly: 0.072 },
  { id: "xlarge", vcpu: 16, gb: 32, disk: 251, hourly: 0.2 },
] as const;

function sizeType(s: (typeof SIZES)[number]): ContainerType {
  return {
    id: s.id,
    provider: "boatdev",
    kind: "preset",
    vcpu: s.vcpu,
    memoryMiB: s.gb * 1024,
    diskGiB: s.disk,
    os: ["linux"],
    arch: ["x86_64"],
    isolation: "linux-vm",
    regions: ["de", "fi", "fr"],
    limits: {
      ...(s.id === "xlarge" ? { planGate: "$100/month plan or higher" } : {}),
    },
    notes: [
      "Docs list memory and disk as '4 GB' and '51 GB' and do not say GB or GiB; values are converted as GiB (x1024 MiB). Unverified unit.",
      "Price is per VM-hour; the per-vCPU rate is derived (VM price / vCPUs) and includes memory and disk. Billed per second, only while running; a stopped sandbox has no compute charge. No per-second or per-start minimum is stated.",
      "Extra starts above the plan's included starts cost USD 0.03 to 0.07 each; create, fork and resume each count as one start. Not modelled as a rate.",
      "Network policy has three modes: open, deny, and an allow list of up to 100 entries (domains, *. wildcards, IPs or CIDRs; the cap is shared). Enforced on the host and changeable on a running sandbox. Source: https://docs.boat.dev/network-policy/outbound.md",
      'Docs say "there is no pause". pause.supported models stop/resume: the disk is kept, memory and processes only usually when resumed within 10 minutes.',
      "Auto-stop defaults to 1 hour, maximum 30 days, or off (limits.md). This is an idle auto-stop, not a documented maximum lifetime, so maxLifetimeSec is not set.",
      "SSH access is documented at https://docs.boat.dev/ssh-access.md; the schema has no field for it.",
      ...(s.id === "small"
        ? ["The free trial has no large or xlarge size."]
        : []),
    ],
    price: {
      currency: "USD",
      billing: "wall-clock",
      granularity: "s",
      rates: [
        rate(
          "vcpu",
          "per-vcpu-hour",
          s.hourly / s.vcpu,
          {
            value: s.hourly,
            unit: `USD per hour per VM (${s.vcpu} vCPU/${s.gb} GB/${s.disk} GB disk)`,
          },
          PRICING,
        ),
      ],
    },
  };
}

export const boatdev: Provider = {
  meta: {
    id: "boatdev",
    name: "boat.dev",
    website: "https://boat.dev",
    docs: "https://docs.boat.dev",
    pricingUrl: PRICING,
    description:
      "Persistent Ubuntu VMs for AI agents with SSH, Docker and fast snapshot forking, billed per second.",
    logo: { brandUrl: "https://boat.dev" },
    auth: AUTH.boatdev,
    envVars: envVarsFromAuth(AUTH.boatdev),
    isolation: ["linux-vm"],
    regions: [
      {
        id: "de",
        name: "Germany",
        geo: "eu",
        selectable: false,
      },
      { id: "fi", name: "Finland", geo: "eu", selectable: false },
      { id: "fr", name: "France", geo: "eu", selectable: false },
    ],
    sizingMode: "presets",
    freeTier:
      "7-day free trial, card required, 25 compute hours, 2 concurrent sandboxes (no permanent free tier documented)",
    status: "unverified",
    verifiedAt: READ_AT,
    capabilities: {
      createFrom: ["snapshot"],
      snapshots: { fs: true, memory: false, fork: true },
      pause: { supported: true, keepsMemory: false },
      egress: {
        policies: ["open", "none", "allowlist"],
        domainMax: 100,
        cidrMax: 100,
        runtimeUpdate: true,
      },
      discovery: { types: false, regions: false, pricing: "docs" },
    },
  },
  types: SIZES.map(sizeType),
};
