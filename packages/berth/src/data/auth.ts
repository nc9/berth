import type { AuthField, AuthMethod } from "../catalog/types.ts";

// Auth methods per provider. Field names are stable ids; `env` is the
// conventional variable name. No values live here: secret fields never carry
// `example` or `default`.
//
// Status: `verified` only where the vendor's docs page was read (see
// research/). Everything else is `unverified`, with the reason in `notes`:
// these methods were recorded from the env names already in the catalog and
// the vendors' usual SDK conventions, and still need a docs pass.

const V = "2026-11-26";
const UNREAD = "Not confirmed against the vendor docs yet; ";

const secret = (
  name: string,
  env: string,
  description: string,
  required = true,
): AuthField => ({ name, env, secret: true, required, description });

const plain = (
  name: string,
  env: string,
  description: string,
  extra: { required?: boolean; example?: string; default?: string } = {},
): AuthField => ({
  name,
  env,
  secret: false,
  required: extra.required ?? true,
  description,
  ...(extra.example !== undefined ? { example: extra.example } : {}),
  ...(extra.default !== undefined ? { default: extra.default } : {}),
});

function method(
  m: Omit<AuthMethod, "verifiedAt" | "status" | "notes"> & {
    verified?: boolean;
    notes?: string;
  },
): AuthMethod {
  const { verified, notes, ...rest } = m;
  return {
    ...rest,
    verifiedAt: V,
    status: verified ? "verified" : "unverified",
    ...(notes !== undefined ? { notes } : {}),
  };
}

const apiKey = (
  id: string,
  label: string,
  docsUrl: string,
  env: string,
  notes: string,
  verified = false,
  more: AuthField[] = [],
): AuthMethod[] => [
  method({
    id,
    kind: "api_key",
    label,
    default: true,
    docsUrl,
    fields: [secret("api-key", env, `${label}.`), ...more],
    verified,
    notes,
  }),
];

export const AUTH = {
  aws: [
    method({
      id: "iam-keys",
      kind: "iam_keys",
      label: "IAM access keys",
      default: true,
      docsUrl:
        "https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html",
      fields: [
        secret("access-key-id", "AWS_ACCESS_KEY_ID", "IAM access key id."),
        secret(
          "secret-access-key",
          "AWS_SECRET_ACCESS_KEY",
          "IAM secret access key.",
        ),
        secret(
          "session-token",
          "AWS_SESSION_TOKEN",
          "Session token, only for temporary credentials.",
          false,
        ),
        plain("region", "AWS_REGION", "Region to create resources in.", {
          example: "us-east-1",
        }),
      ],
      notes: `${UNREAD}variable names are the AWS SDK convention.`,
    }),
    method({
      id: "iam-role",
      kind: "iam_role",
      label: "IAM role (instance, task or web identity)",
      docsUrl:
        "https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html",
      fields: [
        plain("region", "AWS_REGION", "Region to create resources in.", {
          example: "us-east-1",
        }),
        plain("role-arn", "AWS_ROLE_ARN", "Role to assume, when not ambient.", {
          required: false,
        }),
      ],
      notes: `${UNREAD}credentials come from the ambient environment (SDK default chain), so no secret field.`,
    }),
  ],
  azure: [
    method({
      id: "service-principal",
      kind: "oauth_client",
      label: "Entra service principal (client secret)",
      default: true,
      docsUrl:
        "https://learn.microsoft.com/en-us/azure/developer/intro/authentication-overview",
      fields: [
        plain("tenant-id", "AZURE_TENANT_ID", "Entra tenant id."),
        plain("client-id", "AZURE_CLIENT_ID", "App registration client id."),
        secret("client-secret", "AZURE_CLIENT_SECRET", "Client secret."),
        plain(
          "subscription-id",
          "AZURE_SUBSCRIPTION_ID",
          "Subscription to use.",
        ),
      ],
      notes: `${UNREAD}variable names are the Azure SDK convention.`,
    }),
    method({
      id: "workload-identity",
      kind: "workload_identity",
      label: "Managed identity or workload identity",
      docsUrl:
        "https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-overview",
      fields: [
        plain("tenant-id", "AZURE_TENANT_ID", "Entra tenant id."),
        plain("client-id", "AZURE_CLIENT_ID", "Identity client id."),
        plain(
          "subscription-id",
          "AZURE_SUBSCRIPTION_ID",
          "Subscription to use.",
        ),
      ],
      notes: `${UNREAD}credentials come from the ambient identity, so no secret field.`,
    }),
  ],
  gcp: [
    method({
      id: "service-account-json",
      kind: "service_account_json",
      label: "Service account key file",
      default: true,
      docsUrl:
        "https://cloud.google.com/docs/authentication/application-default-credentials",
      fields: [
        secret(
          "credentials",
          "GOOGLE_APPLICATION_CREDENTIALS",
          "Service account key (the env var holds a file path).",
        ),
        plain("project", "GOOGLE_CLOUD_PROJECT", "Project id."),
      ],
      notes: `${UNREAD}names follow Application Default Credentials.`,
    }),
    method({
      id: "workload-identity",
      kind: "workload_identity",
      label: "Workload identity federation or attached service account",
      docsUrl: "https://cloud.google.com/iam/docs/workload-identity-federation",
      fields: [plain("project", "GOOGLE_CLOUD_PROJECT", "Project id.")],
      notes: `${UNREAD}credentials come from the ambient environment, so no secret field.`,
    }),
  ],
  boatdev: apiKey(
    "api-key",
    "boat.dev API key",
    "https://docs.boat.dev",
    "BOAT_API_KEY",
    `${UNREAD}env name was already in the catalog.`,
  ),
  boxd: apiKey(
    "api-key",
    "boxd API key",
    "https://docs.omnara.com/machines/providers/boxd",
    "BOXD_API_KEY",
    `${UNREAD}boxd documents no credential name on the page read; the env name is a guess to confirm.`,
  ),
  morph: apiKey(
    "api-key",
    "Morph API key",
    "https://cloud.morph.so/docs/developers",
    "MORPH_API_KEY",
    "MORPH_API_KEY is named on the developer docs page.",
    true,
  ),
  blaxel: apiKey(
    "api-key",
    "Blaxel API key",
    "https://docs.blaxel.ai/Sandboxes/Overview",
    "BL_API_KEY",
    `${UNREAD}names follow the Blaxel SDK convention.`,
    false,
    [plain("workspace", "BL_WORKSPACE", "Workspace name.")],
  ),
  vercel: [
    method({
      id: "access-token",
      kind: "token_pair",
      label: "Access token with team and project",
      default: true,
      docsUrl: "https://vercel.com/docs/sandbox",
      fields: [
        secret("token", "VERCEL_TOKEN", "Vercel access token."),
        plain("team-id", "VERCEL_TEAM_ID", "Team id."),
        plain("project-id", "VERCEL_PROJECT_ID", "Project id."),
      ],
      notes: `${UNREAD}an OIDC token flow may also exist.`,
    }),
  ],
  cloudflare: apiKey(
    "api-token",
    "Cloudflare API token",
    "https://developers.cloudflare.com/sandbox/",
    "CLOUDFLARE_API_TOKEN",
    `${UNREAD}Sandboxes may run through Workers bindings with no token.`,
    false,
    [plain("account-id", "CLOUDFLARE_ACCOUNT_ID", "Account id.")],
  ),
  fly: apiKey(
    "api-token",
    "Fly.io access token",
    "https://docs.fly.io",
    "FLY_API_TOKEN",
    `${UNREAD}FLY_API_TOKEN is the flyctl convention.`,
  ),
  runloop: apiKey(
    "api-key",
    "Runloop API key",
    "https://docs.runloop.ai/docs/devboxes/lifecycle",
    "RUNLOOP_API_KEY",
    `${UNREAD}names follow the Runloop SDK convention.`,
  ),
  northflank: apiKey(
    "api-token",
    "Northflank API token",
    "https://northflank.com/docs",
    "NORTHFLANK_API_TOKEN",
    `${UNREAD}the env name is a guess to confirm.`,
  ),
  beam: apiKey(
    "api-token",
    "Beam token",
    "https://docs.beam.cloud/v2/sandbox/overview",
    "BEAM_TOKEN",
    `${UNREAD}the env name is a guess to confirm.`,
  ),
  daytona: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "Daytona API key",
      default: true,
      docsUrl: "https://www.daytona.io/docs/en/sandboxes/",
      fields: [
        secret("api-key", "DAYTONA_API_KEY", "Daytona API key."),
        plain("api-url", "DAYTONA_API_URL", "API URL, for self-hosted.", {
          required: false,
        }),
        plain("target", "DAYTONA_TARGET", "Target region.", {
          required: false,
        }),
      ],
      notes: `${UNREAD}DAYTONA_API_URL and DAYTONA_TARGET follow the Daytona SDK convention and have no default recorded.`,
    }),
  ],
  modal: [
    method({
      id: "token-pair",
      kind: "token_pair",
      label: "Modal token id and secret",
      default: true,
      docsUrl: "https://modal.com/docs/guide/sandboxes",
      fields: [
        secret("token-id", "MODAL_TOKEN_ID", "Modal token id."),
        secret("token-secret", "MODAL_TOKEN_SECRET", "Modal token secret."),
      ],
      notes: `${UNREAD}names were already in the catalog.`,
    }),
  ],
  e2b: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "E2B API key",
      default: true,
      docsUrl: "https://docs.e2b.dev",
      fields: [
        secret("api-key", "E2B_API_KEY", "E2B API key."),
        plain("domain", "E2B_DOMAIN", "Domain, for self-hosted.", {
          required: false,
        }),
      ],
      notes: `${UNREAD}E2B_DOMAIN follows the E2B SDK convention (the adapter takes domain and apiUrl).`,
    }),
  ],
} satisfies Record<string, AuthMethod[]>;
