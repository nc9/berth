import type { AuthField, AuthMethod } from "../catalog/types.ts";

// Auth methods per provider, read from each vendor's official docs on
// 2026-11-26. `docsUrl` is the page that states the fields. Env names are
// only recorded where that page states them; a field whose variable the docs
// do not name has no `env`. Anything the docs do not confirm is `unverified`
// with the reason in `notes`. No values live here: secret fields never carry
// `example` or `default`.

const V = "2026-11-26";

const secret = (
  name: string,
  env: string | undefined,
  description: string,
  required = true,
): AuthField => ({
  name,
  ...(env !== undefined ? { env } : {}),
  secret: true,
  required,
  description,
});

const plain = (
  name: string,
  env: string | undefined,
  description: string,
  extra: { required?: boolean; example?: string; default?: string } = {},
): AuthField => ({
  name,
  ...(env !== undefined ? { env } : {}),
  secret: false,
  required: extra.required ?? true,
  description,
  ...(extra.example !== undefined ? { example: extra.example } : {}),
  ...(extra.default !== undefined ? { default: extra.default } : {}),
});

function method(
  m: Omit<AuthMethod, "verifiedAt" | "status" | "notes"> & {
    verified: boolean;
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

const AWS_ENV =
  "https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html";
const AZ_ENV =
  "https://learn.microsoft.com/en-us/dotnet/api/overview/azure/identity-readme?view=azure-dotnet#environment-variables";
const GCP_ADC =
  "https://docs.cloud.google.com/docs/authentication/application-default-credentials";
const VERCEL_AUTH = "https://vercel.com/docs/sandbox/concepts/authentication";
const DAYTONA_AUTH = "https://www.daytona.io/docs/en/authentication";

export const AUTH = {
  aws: [
    method({
      id: "iam-keys",
      kind: "iam_keys",
      label: "IAM access keys",
      default: true,
      docsUrl: AWS_ENV,
      fields: [
        secret("access-key-id", "AWS_ACCESS_KEY_ID", "AWS access key id."),
        secret(
          "secret-access-key",
          "AWS_SECRET_ACCESS_KEY",
          "Secret key associated with the access key.",
        ),
        secret(
          "session-token",
          "AWS_SESSION_TOKEN",
          "Required only for temporary credentials from AWS STS.",
          false,
        ),
        plain("region", "AWS_REGION", "AWS Region to send requests to.", {
          example: "us-west-2",
        }),
      ],
      verified: true,
    }),
    method({
      id: "iam-role",
      kind: "iam_role",
      label: "IAM role (web identity, instance or container role)",
      docsUrl: AWS_ENV,
      fields: [
        plain("region", "AWS_REGION", "AWS Region to send requests to.", {
          example: "us-west-2",
        }),
        plain(
          "role-arn",
          "AWS_ROLE_ARN",
          "ARN of the IAM role to assume with a web identity provider.",
          { required: false },
        ),
        plain(
          "web-identity-token-file",
          "AWS_WEB_IDENTITY_TOKEN_FILE",
          "Path to a file holding an OAuth 2.0 access token or OIDC ID token, used with the role ARN.",
          { required: false },
        ),
        plain(
          "role-session-name",
          "AWS_ROLE_SESSION_NAME",
          "Name attached to the role session.",
          { required: false },
        ),
      ],
      verified: true,
      notes:
        "Role ARN, token file and session name apply to assume-role-with-web-identity only. Instance and container roles come from the ambient environment and need no variable on this page.",
    }),
  ],
  azure: [
    method({
      id: "service-principal",
      kind: "oauth_client",
      label: "Entra service principal (client secret)",
      default: true,
      docsUrl: AZ_ENV,
      fields: [
        plain(
          "tenant-id",
          "AZURE_TENANT_ID",
          "ID of the application's Microsoft Entra tenant.",
        ),
        plain(
          "client-id",
          "AZURE_CLIENT_ID",
          "ID of a Microsoft Entra application.",
        ),
        secret(
          "client-secret",
          "AZURE_CLIENT_SECRET",
          "One of the application's client secrets.",
        ),
      ],
      verified: true,
      notes:
        "The docs page names no subscription variable, so none is recorded; consumers pass the subscription to the adapter.",
    }),
    method({
      id: "workload-identity",
      kind: "workload_identity",
      label: "Managed identity or workload identity",
      docsUrl: AZ_ENV,
      fields: [
        plain(
          "client-id",
          "AZURE_CLIENT_ID",
          "Client id of the workload identity application or user-assigned managed identity.",
          { required: false },
        ),
      ],
      verified: false,
      notes:
        "Only AZURE_CLIENT_ID is stated on the page read. Other workload identity variables (such as a federated token file) are not stated there, so the field list is unconfirmed.",
    }),
  ],
  gcp: [
    method({
      id: "service-account-json",
      kind: "service_account_json",
      label: "Service account key file",
      default: true,
      docsUrl: GCP_ADC,
      fields: [
        secret(
          "credentials",
          "GOOGLE_APPLICATION_CREDENTIALS",
          "Path to the service account key JSON file.",
        ),
      ],
      verified: true,
      notes:
        "The ADC page names no project variable, so none is recorded. It warns that service account keys are a security risk.",
    }),
    method({
      id: "workload-identity",
      kind: "workload_identity",
      label: "Workload identity federation or attached service account",
      docsUrl: GCP_ADC,
      fields: [
        plain(
          "credentials",
          "GOOGLE_APPLICATION_CREDENTIALS",
          "Path to a Workload Identity Federation credential configuration file. Omit on a resource with an attached service account.",
          { required: false },
        ),
      ],
      verified: true,
    }),
  ],
  boatdev: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "boat.dev API key",
      default: true,
      docsUrl: "https://docs.boat.dev",
      fields: [
        secret("api-key", "BOAT_API_KEY", "API key (sent as a Bearer token)."),
        plain("api-base", "BOAT_API_BASE", "API base URL.", {
          required: false,
          default: "https://boat.dev/api/v1",
        }),
      ],
      verified: true,
    }),
  ],
  boxd: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "boxd API key",
      default: true,
      docsUrl: "https://docs.omnara.com/machines/providers/boxd",
      fields: [secret("api-key", undefined, "boxd API key for one boxd org.")],
      verified: false,
      notes:
        "The page documents the key (console or `boxd auth keys create`) but names no environment variable.",
    }),
  ],
  morph: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "Morph API key",
      default: true,
      docsUrl: "https://cloud.morph.so/docs/developers",
      fields: [secret("api-key", "MORPH_API_KEY", "Morph Cloud API key.")],
      verified: true,
    }),
  ],
  blaxel: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "Blaxel API key and workspace",
      default: true,
      docsUrl: "https://docs.blaxel.ai/Sandboxes/Overview",
      fields: [
        secret("api-key", "BL_API_KEY", "Blaxel API key."),
        plain("workspace", "BL_WORKSPACE", "Workspace name."),
      ],
      verified: true,
      notes:
        "The docs say the SDK reads credentials from environment variables, a .env file or a CLI login session, not constructor arguments. On Blaxel itself auth is automatic.",
    }),
  ],
  vercel: [
    method({
      id: "access-token",
      kind: "token_pair",
      label: "Access token with team and project",
      default: true,
      docsUrl: VERCEL_AUTH,
      fields: [
        secret(
          "token",
          "VERCEL_TOKEN",
          "Vercel access token with access to the team.",
        ),
        plain("team-id", "VERCEL_TEAM_ID", "Vercel team id."),
        plain("project-id", "VERCEL_PROJECT_ID", "Vercel project id."),
      ],
      verified: true,
      notes:
        "Documented for external CI/CD and non-Vercel hosting. The docs recommend the OIDC method where it is available.",
    }),
    method({
      id: "oidc-token",
      kind: "other",
      label: "Vercel OIDC token",
      docsUrl: VERCEL_AUTH,
      fields: [
        secret(
          "oidc-token",
          "VERCEL_OIDC_TOKEN",
          "OIDC token tied to one Vercel project; from `vercel env pull` locally (expires after 12 hours), automatic on Vercel.",
        ),
      ],
      verified: true,
    }),
  ],
  cloudflare: [
    method({
      id: "worker-binding",
      kind: "other",
      label: "Worker binding",
      default: true,
      docsUrl: "https://developers.cloudflare.com/sandbox/",
      fields: [],
      verified: false,
      notes:
        "The Sandbox page says sandboxes are reached through a Worker and names no API token or environment variable. Credentials for deploying the Worker are not documented there.",
    }),
  ],
  fly: [
    method({
      id: "api-token",
      kind: "api_key",
      label: "Fly.io access token",
      default: true,
      docsUrl: "https://docs.fly.io/machines/api/working-with-machines-api.md",
      fields: [
        secret(
          "api-token",
          "FLY_API_TOKEN",
          "Fly.io token (tokens from `fly tokens create` start with `FlyV1 `), sent as a Bearer token.",
        ),
        plain("api-hostname", "FLY_API_HOSTNAME", "Machines API base URL.", {
          required: false,
          default: "https://api.machines.dev",
        }),
      ],
      verified: true,
    }),
  ],
  runloop: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "Runloop API key",
      default: true,
      docsUrl: "https://docs.runloop.ai/docs/tutorials/quickstart.md",
      fields: [
        secret(
          "api-key",
          "RUNLOOP_API_KEY",
          "Runloop API key, loaded by the SDK.",
        ),
      ],
      verified: true,
      notes: "The page names no base URL variable.",
    }),
  ],
  northflank: [
    method({
      id: "api-token",
      kind: "api_key",
      label: "Northflank API token",
      default: true,
      docsUrl: "https://northflank.com/docs/v1/api/use-the-javascript-client",
      fields: [
        secret(
          "api-token",
          undefined,
          "API token from team settings; team- or organization-scoped.",
        ),
      ],
      verified: false,
      notes:
        "The docs name no environment variable; the token is passed to the client's context provider. An organization-scoped token needs a teamId on team and project requests.",
    }),
  ],
  beam: [
    method({
      id: "api-token",
      kind: "api_key",
      label: "Beam API token",
      default: true,
      docsUrl: "https://docs.beam.cloud/v2/getting-started/authentication.md",
      fields: [
        secret(
          "token",
          "BEAM_TOKEN",
          "API token used by the CLI and Python SDK for the default context (TypeScript SDK: beamOpts.token).",
        ),
      ],
      verified: true,
    }),
  ],
  daytona: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "Daytona API key",
      default: true,
      docsUrl: DAYTONA_AUTH,
      fields: [
        secret("api-key", "DAYTONA_API_KEY", "Daytona API key."),
        plain("api-url", "DAYTONA_API_URL", "URL of the Daytona API.", {
          required: false,
          default: "https://app.daytona.io/api",
        }),
        plain(
          "target",
          "DAYTONA_TARGET",
          "Default region for sandboxes and snapshots.",
          {
            required: false,
          },
        ),
      ],
      verified: true,
    }),
    method({
      id: "jwt",
      kind: "other",
      label: "Daytona JWT and organization",
      docsUrl: DAYTONA_AUTH,
      fields: [
        secret(
          "jwt-token",
          "DAYTONA_JWT_TOKEN",
          "JWT token from daytona-v0 login.",
        ),
        plain(
          "organization-id",
          "DAYTONA_ORGANIZATION_ID",
          "Organization id, needed with a JWT.",
        ),
        plain("api-url", "DAYTONA_API_URL", "URL of the Daytona API.", {
          required: false,
          default: "https://app.daytona.io/api",
        }),
        plain(
          "target",
          "DAYTONA_TARGET",
          "Default region for sandboxes and snapshots.",
          {
            required: false,
          },
        ),
      ],
      verified: true,
    }),
  ],
  modal: [
    method({
      id: "token-pair",
      kind: "token_pair",
      label: "Modal token id and secret",
      default: true,
      docsUrl: "https://modal.com/docs/reference/modal.config",
      fields: [
        secret("token-id", "MODAL_TOKEN_ID", "Modal token id."),
        secret("token-secret", "MODAL_TOKEN_SECRET", "Modal token secret."),
      ],
      verified: true,
      notes: "The two values must be set together.",
    }),
  ],
  e2b: [
    method({
      id: "api-key",
      kind: "api_key",
      label: "E2B API key",
      default: true,
      docsUrl: "https://docs.e2b.dev/api-key",
      fields: [secret("api-key", "E2B_API_KEY", "E2B API key.")],
      verified: true,
      notes:
        "The page does not mention E2B_DOMAIN, so no domain field is recorded.",
    }),
  ],
} satisfies Record<string, AuthMethod[]>;
