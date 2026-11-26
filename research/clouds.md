# Container/sandbox provider registry: the three hyperscalers

Read 2026-11-26, web pages only, no credentials. Scope: AWS, Azure, GCP. Sandbox-native vendors (Modal, Daytona, E2B...) are covered elsewhere.
Every fact carries a source URL. `UNVERIFIED` = not confirmed from a primary page (secondary source, search snippet, or not fetched). "Not documented" = the docs page read does not say.

Key finding: all three clouds shipped purpose-built agent-sandbox products in 2026 (Lambda MicroVMs, ACA Sandboxes, Cloud Run sandboxes / GKE Agent Sandbox). They are the right adapter targets; the classic services (Fargate, ACI, Cloud Run jobs, VMs) are fallbacks and the only route to Windows/macOS.

---

## 1. AWS

### 1.1 Lambda MicroVMs (new, June 2026) - best fit for agent runs

- Launched 2026-06-22; Firecracker VM per MicroVM, own kernel/memory/disk. https://aws.amazon.com/lambda/lambda-microvms , https://aws.amazon.com/about-aws/whats-new/2026/06/aws-lambda-microvms
- Regions at launch: us-east-1, us-east-2, us-west-2, ap-northeast-1, eu-west-1. https://aws.amazon.com/about-aws/whats-new/2026/06/aws-lambda-microvms
- Flow: build a MicroVM image from a Dockerfile (snapshot of initialised env) -> `run-microvm` -> suspend/resume/terminate. https://docs.aws.amazon.com/lambda/latest/dg/lambda-microvms-guide.html
- API (CLI namespace `lambda-microvms`): `run-microvm`, `suspend-microvm`, `resume-microvm`, `terminate-microvm`, `list-microvms`, `create-microvm-auth-token`, `create-microvm-shell-auth-token`. https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html , https://docs.aws.amazon.com/lambda/latest/dg/microvms-networking.html
- Max lifetime: `--maximum-duration-in-seconds` 1..28,800 (8 h) covering running + suspended time. https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html
- Sizes: baseline vCPU/memory per MicroVM, burst to 4x baseline. Example sizes in the bandwidth table: 0.25 vCPU/0.5 GB up to 4 vCPU/8 GB (a table of examples, not a full list). Full size list, disk size, GPU, OS/arch: not documented on pages read. https://docs.aws.amazon.com/lambda/latest/dg/microvms-networking.html
- List sizes by API: not documented.
- Exec/upload: HTTP/WebSocket/gRPC to a port in the VM through a per-VM HTTPS endpoint with JWE token (`HTTP_INGRESS`); `SHELL_INGRESS` connector gives shell access, "intended for development and troubleshooting. Don't attach to production". No file-upload API documented: run your own agent in the image (Longshore runner pattern). https://docs.aws.amazon.com/lambda/latest/dg/microvms-networking.html
- Egress: default public internet; optional VPC egress connector (security groups, NACLs, NAT, or service-managed Elastic IPs). Connectors fixed at run time. No native domain allowlist: build it with VPC + Network Firewall domain lists (SNI/Host match, `.example.com` wildcard) https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-domain-names.html . Network Firewall is billed extra (price not read, UNVERIFIED).
- Snapshot/image: image = snapshot (fast start); suspend preserves memory+disk; suspended = storage charge only. https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html
- Cold start: "near-instant"/"rapid", no number. https://aws.amazon.com/lambda/lambda-microvms
- Pricing (all UNVERIFIED, third-party, us-east-1, Graviton, June 2026): $0.0000276944/vCPU-s (= $0.0997/vCPU-h), $0.0000036667/GB-s (= $0.0132/GB-h); snapshot write ~$0.0038/GB, read ~$0.00155/GB, storage ~$0.08/GB-month. https://northflank.com/blog/aws-lambda-microvms-vs-northflank-pricing , https://www.eon.io/blog/aws-lambda-pricing . The AgentCore "committed baseline" rate on the AWS page is the same $0.0997/$0.0132, which supports it. AWS's own Lambda pricing page lists billed dimensions (compute per second, snapshot ops/storage, data transfer) but no MicroVM rates in the text I could read. https://aws.amazon.com/lambda/pricing/
- Windows/macOS: not documented (Linux assumed; UNVERIFIED).

### 1.2 Bedrock AgentCore Code Interpreter and Runtime

- Code Interpreter: each session in a dedicated microVM (isolated CPU, memory, filesystem), memory sanitised on end. Default timeout 900 s, up to 8 h. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-session-characteristics.html
- Languages: Python, JavaScript, TypeScript, plus shell and AWS CLI; file upload inline up to 100 MB, up to 5 GB via S3 terminal commands. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-tool.html , https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-resource-session-management.html
- Network modes: Sandbox (S3 only), Public, VPC. No domain allowlist. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-resource-management.html
- API actions: `CreateCodeInterpreter`, `StartCodeInterpreterSession`, `InvokeCodeInterpreter`, `StopCodeInterpreterSession`, `List/Get/Delete...`. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter-resource-session-management.html
- Not a general container: fixed interpreter runtime, you cannot bring your own image (custom = network/role settings only). Sizes not documented.
- Pricing (per second, region-agnostic on the page; only us-east-1 named): Code Interpreter $0.0895/vCPU-h and $0.00945/GB-h, 1 s minimum, 128 MB minimum memory billing; CPU billed on consumption, memory on peak. No free tier beyond new-customer credits (up to $200). https://aws.amazon.com/bedrock/agentcore/pricing/ (read 2026-11-26)
- AgentCore Runtime: v1 microVM $0.0895/vCPU-h, $0.00945/GB-h; v2 consumption $0.1276/vCPU-h (the page omits the `$`, assumed), $0.0169/GB-h; v2 committed baseline $0.0997/vCPU-h, $0.0132/GB-h. Per-second, CPU zero during I/O wait, idle memory reclaimed after 120 s. https://aws.amazon.com/bedrock/agentcore/pricing/
- Runtime interactive shell (agentcore exec) from 2026-06-05 and API name `InvokeAgentRuntimeCommandShell`: UNVERIFIED (blog only). https://aws.amazon.com/blogs/machine-learning/run-agents-securely-and-efficiently-with-the-next-generation-agentcore-runtime/
- Verdict on this service: good for stateless code execution; a poorer fit than Lambda MicroVMs for a full coding agent (no BYO image for the interpreter, 8 h cap, no allowlist).

### 1.3 ECS / Fargate

- Types: a task takes CPU/memory from a fixed combination table (not read in this pass; an API listing is not documented in pages read). ECS Exec example uses `.25 vcpu` / `.5 gb`. https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html
- OS/arch: Linux x86 and ARM, Windows x86; Spot is Linux only. https://aws.amazon.com/fargate/pricing/
- GPU on Fargate: not documented on the pricing page.
- Pricing (us-east-1, read 2026-11-26, per-second rates converted): Linux x86 ~$0.0405/vCPU-h, ~$0.0044/GB-h; Linux ARM ~$0.0324/vCPU-h, ~$0.0036/GB-h; Windows ~$0.0915/vCPU-h + ~$0.0460 Windows licence per vCPU-h, ~$0.0100/GB-h. Linux 1-minute minimum, Windows 5-minute minimum; 20 GB ephemeral included, extra ~$0.00011/GB-h; Spot up to 70% off. https://aws.amazon.com/fargate/pricing/
- Isolation: Firecracker microVM per task: UNVERIFIED (not on pages read).
- Cold start, max lifetime: not documented on pages read.
- Exec: ECS Exec over SSM Session Manager, Linux and Windows on Fargate, runs as root, 20-minute idle timeout (fixed), only enable at task start, read-only root FS unsupported. No file-upload API (push via exec stdin or S3). https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html
- Egress: security groups are IP-only; domain allowlist needs Network Firewall domain-list rules in the VPC (https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-domain-names.html). Route 53 Resolver DNS Firewall as DNS-level allowlist: UNVERIFIED (page not read).
- Snapshot: none; prebuilt image from ECR only (Fargate has no memory snapshot).

### 1.4 EC2 (Linux, Windows, Mac)

- List types via API: `DescribeInstanceTypes` (needs AWS credentials), filters include `processor-info.supported-architecture` (arm64|i386|x86_64), `vcpu-info.default-vcpus`, `memory-info.size-in-mib`, `bare-metal`, `supported-usage-class` (on-demand|spot|capacity-block), `hypervisor`; GPU info is returned in the `InstanceTypeInfo` object (field details not read). Page size 5..100. https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstanceTypes.html
- Regions/offerings: `DescribeInstanceTypeOfferings`, `DescribeRegions`: UNVERIFIED (not fetched).
- Mac: Apple silicon M1, M1 Ultra, M2, M2 Pro, M4, M4 Pro, M4 Max, M3 Ultra, plus Intel Mac1; Dedicated Hosts only, per-second billing with a 24-hour minimum host allocation (Apple licence); SSM agent supported; boot "within minutes". The valid-values list of DescribeInstanceTypes includes `mac1.metal`, `mac2.metal`, `mac2-m2.metal`, `mac2-m2pro.metal`, `mac2-m1ultra.metal`. https://aws.amazon.com/ec2/instance-types/mac/ , https://aws.amazon.com/ec2/dedicated-hosts/pricing/
- Mac prices (UNVERIFIED, third party, us-east-1): mac2.metal $0.65/h; mac-m4.metal ~$1.23/h; mac-m3ultra.metal $12.50/h. https://instances.vantage.sh/aws/ec2/mac2.metal , https://dev.classmethod.jp/en/articles/ec2-mac-m3ultra-metal-pricing-api/ . AWS's own pages say only "see calculator".
- Billing: Linux/Windows per second, 60 s minimum; Windows licence discount $0.046/vCPU-h with Optimize CPUs. https://aws.amazon.com/ec2/pricing/on-demand/
- Linux/Windows hourly examples (m7i.large etc.): not on the page read; get from the Price List API.
- Isolation: Nitro VM (hypervisor `nitro` filter value exists). https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstanceTypes.html
- Exec/upload: SSM Run Command / Session Manager (the Mac page confirms SSM Agent): file transfer via S3 or SSM; details UNVERIFIED.
- Snapshot/image: AMI + EBS snapshot (UNVERIFIED, not on pages read). No memory snapshot.
- Egress: security groups/NACL (IP only); Network Firewall for domains.
- Cold start: not documented (Mac "within minutes").

### 1.5 Lambda (classic) and Lambda Managed Instances

- Classic Lambda: $0.0000166667/GB-s x86 us-east-1, $0.20/M requests, free 1M requests + 400k GB-s/month, ephemeral storage $0.0000000309/GB-s above 512 MB. Arm rate not rendered. https://aws.amazon.com/lambda/pricing/ . Max duration (15 min) is not on the page read; do not use for agent runs.
- Managed Instances: EC2 price + 15% management fee (CPU) / 9.75% (GPU G-series) + $0.20/M requests. https://aws.amazon.com/lambda/pricing/ . Not a sandbox primitive.

### 1.6 CodeBuild

- Compute modes: EC2 and Lambda. Reserved-capacity fleets list Linux x86, ARM, Linux GPU (4-96 vCPU, NVMe SSD), macOS (M2: 8 vCPU/24 GiB/128 GB and 12 vCPU/32 GiB/256 GB) and Windows (2-96 vCPU, 4-192 GiB). https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-compute-types.html
- macOS only on reserved fleets (on-demand has no macOS, secondary https://aws.amazon.com/blogs/aws/add-macos-to-your-continuous-integration-pipelines-with-aws-codebuild ); reserved: per instance-minute, 60-minute minimum per instance, Mac instances 24-hour minimum before release. https://aws.amazon.com/codebuild/pricing/
- Example prices on the pricing page only: on-demand general1.small $0.005/min, Lambda arm 1 GB $0.00001/s, reserved small x86 $0.003/instance-min (region not stated). Free: 100 min/month general1.small/arm1.small, 6,000 s Lambda. Windows/macOS rates: not on the page text. https://aws.amazon.com/codebuild/pricing/
- API listing of types: not documented (table is docs only; `ListCuratedEnvironmentImages` etc. UNVERIFIED).
- Relevance: Turntable is its own CI server, so CodeBuild is a competitor/peer, not a substrate. Only useful as a source of "how AWS packages Mac/Windows runners".

### 1.7 Pricing machine-readability (AWS)

- Price List Bulk API: `DescribeServices`, `ListPriceLists`, `GetPriceListFileUrl` return URLs like `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<Service>/<ts>/<region>/index.json`, formats json and csv, historical via `EffectiveDate`. The CLI calls need AWS credentials; whether the resulting file URL is anonymous: not stated on the page (commonly public, UNVERIFIED). https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-ppslong.html
- Price List Query API (`GetProducts`): UNVERIFIED (not fetched), requires IAM credentials.
- No Fargate/Lambda MicroVM/AgentCore SKUs checked in the API; the AgentCore and MicroVM prices above come from web pages and third parties.

### 1.8 AWS egress allowlist, summary

Security groups: IP only. Domain allowlist = Network Firewall stateful domain-list rule groups (`Allow` action, `HTTP_HOST`/`TLS_SNI`, `.example.com` wildcard, optional `AWS_ROUTE_53_RESOLVED_DOMAIN`), deployed in the VPC. It matches SNI/Host, not IP, so a client can spoof them unless the resolved-domain target is also used. https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-domain-names.html

### 1.9 AWS logo/brand

Official AWS Architecture Icons page: https://aws.amazon.com/architecture/icons . Search snippet: icons for diagrams, whitepapers, presentations; terms ship with the download. Full usage rules: not read (UNVERIFIED). Logos for a product-registry UI should be treated as trademarks; use the icon set only as permitted by its terms.

---

## 2. Azure

### 2.1 Container Apps Sandboxes (new) - best fit for agent runs

- ARM resource `Microsoft.App/SandboxGroups`; each sandbox is a microVM from a disk image or snapshot; data plane for sandboxes/files/snapshots/egress; roles: "Container Apps SandboxGroup Data Owner". https://learn.microsoft.com/en-us/azure/container-apps/sandboxes-overview
- Status: Learn page dated 2026-11-06 describes it without a "preview" banner in the text I read; secondary sources conflict (GA week of 2026-09-23 vs public preview). UNVERIFIED. https://itnext.io/azure-container-apps-sandboxes-ai-agents-deep-dive-35d33ade661f , https://infoq.com/news/2026/06/untrusted-ai-agents-sandboxes
- Tiers: XS 0.25 vCPU/0.5 GiB/5 GiB, S 0.5/1/10, M 1/2/20 (default), L 2/4/40, XL 4/8/80, 2XL 8/16/160, 3XL 16/32/320. https://learn.microsoft.com/en-us/azure/container-apps/sandboxes-overview
- Startup: sub-second from cached images; faster from snapshots. Same page.
- Lifecycle: running/stopped; auto-suspend on idle, suspend mode memory (disk+memory) or disk, auto-delete N days after stop. Max lifetime: not documented. Same page.
- Egress: egress proxy outside the sandbox enforces allow/block by host and injects secrets; without a policy outbound is unrestricted; VNet integration via delegated subnet. Same page. Details page (https://sandboxes.azure.com/docs/sandboxes/sandbox/egress) not read; wildcard syntax not confirmed.
- Exec/upload: execute commands, files API, interactive shell, ports (HTTPS URL per port, anonymous or Entra auth); Python, TypeScript, .NET SDKs and REST. Same page.
- Snapshots/images: OCI images as root FS, public Microsoft images or private registry; snapshots incl. memory; volumes (Blob, BYO Blob, Data Disk). Same page.
- OS/arch, GPU, regions list, size list API: not documented on page read.
- Pricing: "same pay-per-second pricing as Consumption plan" (rates did not render on the pricing page). https://azure.microsoft.com/en-us/pricing/details/container-apps/ . Retail Prices API consumption meters read 2026-11-26, eastus: vCPU active $0.000024/s ($0.0864/h), memory active $0.000003/GiB-s ($0.0108/GiB-h), idle $0.000003/s each. Free monthly grant: 180,000 vCPU-s and 360,000 GiB-s (consumption; whether sandboxes share it is not stated). https://prices.azure.com/api/retail/prices?$filter=serviceName eq 'Azure Container Apps' and armRegionName eq 'eastus' and priceType eq 'Consumption' , https://learn.microsoft.com/en-us/azure/container-apps/billing . Whether a sandbox meter exists separately: not confirmed.

### 2.2 Container Apps dynamic sessions (older)

- Code-interpreter pools (built-in Python/Node/Shell) and custom-container pools; Hyper-V isolation; pre-warmed pools allocate in "milliseconds"; session id via query parameter; Entra token (audience `https://dynamicsessions.io`) and role "Azure ContainerApps Session Executor". https://learn.microsoft.com/en-us/azure/container-apps/sessions , https://learn.microsoft.com/en-us/azure/container-apps/sessions-usage
- Egress blocked by default; `sessionNetworkConfiguration.status` = `EgressEnabled`/disabled; no domain allowlist documented. https://learn.microsoft.com/en-us/azure/container-apps/sessions-usage
- Custom-container example resources `0.25 vCPU / 0.5Gi`, `cooldownPeriodInSeconds`; stop session API `/.management/stopSession`. https://learn.microsoft.com/en-us/azure/container-apps/sessions-custom-container
- Billing: code interpreter billed per allocated session in one-hour increments; custom container on Dedicated plan using E16 nodes. https://learn.microsoft.com/en-us/azure/container-apps/billing . Retail meter "Dynamic Sessions" $0.03/hour (eastus, read 2026-11-26) via the Retail Prices query above.
- Microsoft recommends Sandboxes over sessions for new projects. https://learn.microsoft.com/en-us/azure/container-apps/sandboxes-overview
- Regions: 36 listed (East US, East US 2, West Europe, ...). https://learn.microsoft.com/en-us/azure/container-apps/sessions

### 2.3 Container Apps jobs/apps (Consumption)

- Billing per second, vCPU-s/GiB-s/GPU-s; jobs always active rate; GPU meters exist (NC T4 v3 $0.000073/s, NC A100 v4 $0.000529/s, eastus). https://prices.azure.com/api/retail/prices?$filter=serviceName eq 'Azure Container Apps' and armRegionName eq 'eastus' and priceType eq 'Consumption' , https://learn.microsoft.com/en-us/azure/container-apps/billing
- `az containerapp exec` exists (UNVERIFIED, not read this pass). Not a sandbox primitive.

### 2.4 Azure Container Instances (ACI)

- Max 32 vCPU / 256 GB per standard group (big containers), x64 only (no ARM64), Windows and Linux, ACI runs on Azure VMs (F and D series), image max 15 GB, Spot preview (up to 70% off, 10 vCPU default quota, no GPU/VNet). https://learn.microsoft.com/en-us/azure/container-instances/container-instances-faq
- Meter starts when first image pull begins until group stopped (per second). Same page.
- Pricing (Retail Prices API, eastus, read 2026-11-26): Linux vCPU $0.0405/h, memory $0.00445/GB-h, Windows software $0.000012/s (~$0.0432/h per vCPU, unit per the meter), Spot vCPU $0.01215/h, Spot memory $0.001335/GB-h, confidential vCPU $0.04455/h; GPU meters K80/P100/V100 (e.g. V100 $0.0793 per 100 s). https://prices.azure.com/api/retail/prices?$filter=serviceName eq 'Container Instances' and armRegionName eq 'eastus' and priceType eq 'Consumption'
- Isolation: container group on shared Azure VM; hypervisor-level isolation claim: UNVERIFIED. Confidential containers exist. FAQ above.
- Exec, lifetime, cold start: not documented on page read. `az container exec`: UNVERIFIED.
- Egress: VNet delegation; domain allowlist needs Azure Firewall FQDN rules (UNVERIFIED, not read).
- Snapshot: none (image only).

### 2.5 Azure VMs (Windows)

- List sizes/SKUs: ARM Resource SKUs List (`Microsoft.Compute/skus`, needs subscription credentials; capability fields like vCPUs/MemoryGB; saved output truncated, field names UNVERIFIED). https://learn.microsoft.com/en-us/rest/api/compute/resource-skus/list
- Pricing (Retail Prices API, eastus, Standard_D2s_v5, read 2026-11-26): Linux $0.096/h; Windows $0.188/h; Spot Linux $0.020266/h, Spot Windows $0.039687/h. https://prices.azure.com/api/retail/prices?$filter=armSkuName eq 'Standard_D2s_v5' and armRegionName eq 'eastus' and priceType eq 'Consumption'
- macOS on Azure: no offering found; not documented.
- Exec/upload: Run Command / Bastion etc., UNVERIFIED.

### 2.6 Other Azure agent products (secondary sources, UNVERIFIED)

- Hosted agents in Foundry Agent Service: per-session dedicated VM-isolated sandbox with persistent FS; GA 2026-06-02 per an Azure Updates notice. https://devblogs.microsoft.com/foundry/hosted-agents-build26/ , https://mc.merill.net/message/AZ563596
- AKS Agent Sandbox cluster extension, public preview 2026-11-17. https://mc.merill.net/message/AZ580916

### 2.7 Azure Retail Prices API

- `https://prices.azure.com/api/retail/prices`, no authentication ("unauthenticated experience"), OData `$filter` over `armRegionName`, `armSkuName`, `serviceName`, `serviceFamily`, `productName`, `meterName`, `priceType` (Consumption/Reservation/DevTestConsumption), pagination max 1,000/page via `NextPageLink`, USD default, `currencyCode` param, savings plans only in `api-version=2023-01-01-preview`; filter values are case sensitive. https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
- Best machine-readable price source of the three clouds for a registry; note the sandbox product may lack its own meter (see 2.1).

### 2.8 Azure logo/brand

Azure architecture icons: https://learn.microsoft.com/en-us/azure/architecture/icons/ . Snippet: permitted in architectural diagrams, training materials, documentation; do not use Microsoft product icons to represent your own product. Full terms ship in the download (not read, UNVERIFIED).

---

## 3. GCP

### 3.1 Cloud Run sandboxes (Preview) and Cloud Run jobs

- Sandboxes: enabled per resource (service, job, worker pool, instance) with `--sandbox-launcher`; binary `/usr/local/gcp/bin/sandbox`; commands `sandbox do|run|exec|delete|tar`; flags `--detach`, `--write`, `--allow-egress`, `--mount`, `--env`, `--import-tar/--export-tar/--sync-tar`. Status Preview (Pre-GA). Isolation technology: not named ("isolate process execution"). Limits, lifetime, OS, pricing: not documented. Egress blocked by default; `--allow-egress` is all-or-nothing (finer control not described; docs advise VPC firewall rules). https://docs.cloud.google.com/run/docs/code-execution
- Public-preview announcement and "milliseconds" start claim (secondary): https://cloud.google.com/blog/topics/developers-practitioners/google-cloud-run-sandboxes-are-in-public-preview
- Cloud Run jobs: task timeout default 10 min, max 168 h (7 days), 12 h with GPU; retries 0-10; 2nd-gen execution environment. https://docs.cloud.google.com/run/docs/create-jobs
- GPU: one per instance; NVIDIA L4 (24 GB; min 4 CPU/16 GiB; us-central1, us-east4, europe-west1, europe-west4, asia-southeast1, asia-south1 invite-only) and RTX PRO 6000 Blackwell (96 GB; min 20 CPU/80 GiB; us-central1, europe-west4, asia-southeast1, asia-south2); default quota 3 GPUs/region. https://docs.cloud.google.com/run/docs/configuring/jobs/gpu
- Pricing: page says billing in vCPU-seconds and GiB-seconds at 100 ms granularity, two modes (request-based, instance-based), with a free tier; the rate tables did not render in my fetches, so no number is verified. https://cloud.google.com/run/pricing . Secondary recall of Tier 1 request-based rates (~$0.000024/vCPU-s, ~$0.0000025/GiB-s, free 180k vCPU-s/360k GiB-s/2M requests): UNVERIFIED, from model memory.
- Exec into a running Cloud Run instance, max CPU/memory, region list API: not documented on pages read.
- Egress allowlist by domain: Cloud NGFW FQDN objects in a firewall policy via direct VPC egress: UNVERIFIED (the page I tried returned 404). Cloud Run docs recommend VPC firewall rules for sandboxes (above).
- Snapshot: `sandbox tar` file snapshot of a named sandbox; no memory snapshot documented. Same code-execution page.

### 3.2 GKE Agent Sandbox

- Open source (Kubernetes SIG Apps), CRDs `Sandbox`, `SandboxTemplate`, `SandboxWarmPool`, `SandboxClaim`; gVisor primary, Kata supported. Introduced at KubeCon NA 2025-11-11. No extra charge, you pay GKE resources. https://cloud.google.com/blog/products/containers-kubernetes/agentic-ai-on-kubernetes-and-gke/ , https://docs.cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox
- Warm pools: pre-warmed pods "typically start in less than one second". Pod snapshots (suspend/resume): need GKE 1.35.3+, gVisor, not E2, no TPUs. Egress: SandboxTemplate pods get a default-deny NetworkPolicy; FQDN policies not covered. Exec/file API, pricing, lifetime, GA status: not documented. Python SDK `agentic-sandbox-client`. https://docs.cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox
- Requires a GKE cluster (cost of cluster/nodes, not per-sandbox pricing). Autopilot enables gVisor automatically. https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox

### 3.3 Compute Engine

- List: `GET /compute/v1/projects/{p}/zones/{z}/machineTypes` returns `guestCpus`, `memoryMb`, `accelerators[]` (`guestAcceleratorType`, `guestAcceleratorCount`), `architecture`; needs OAuth scope `compute.readonly` and IAM `compute.machineTypes.list`. Zones are per-project calls. `aggregatedList` not confirmed on page. https://docs.cloud.google.com/compute/docs/reference/rest/v1/machineTypes/list
- OS: Linux and Windows Server images, no macOS: UNVERIFIED (not read this pass; no macOS offer seen).
- Pricing: via Cloud Billing Catalog API, Compute service id `6F81-5844-456A`. https://docs.cloud.google.com/billing/docs/how-to/get-pricing-information-api . No example price read (UNVERIFIED).
- Isolation: KVM VM (UNVERIFIED). Exec: SSH / OS Login / IAP (UNVERIFIED). Snapshot: disk snapshots/machine images (UNVERIFIED). Egress domain allowlist: Cloud NGFW FQDN (UNVERIFIED).

### 3.4 Cloud Build

- Pricing page content did not render in fetch (topics only: per-minute default pool rates, e2-medium/standard-2/4/8, free minutes, private pools, Windows/macOS mentioned as topics). No numbers verified. https://cloud.google.com/build/pricing . Windows/macOS support: UNVERIFIED. Relevance to Turntable: a peer CI product, not a substrate.

### 3.5 Pricing API (GCP)

- Cloud Billing Catalog API (Pre-GA): `GET https://cloudbilling.googleapis.com/v2beta/services`, `GET /v2beta/skus?filter=service="services/ID"`, `GET /v1beta/skus/{SKU_ID}/prices`. Public price data needs an API key (the Cloud Billing API enabled in a project, no IAM role); account-specific prices need OAuth. So a project and key are required; not anonymous. Cloud Run service id is looked up from `/v2beta/services`. https://docs.cloud.google.com/billing/docs/how-to/get-pricing-information-api
- Also browsable SKU docs: https://docs.cloud.google.com/skus

### 3.6 GCP logo/brand

Google Cloud product icon library: https://cloud.google.com/icons . Icon guide PDF marked "Proprietary & Confidential": https://services.google.com/fh/files/misc/google-cloud-product-icons.pdf . General Google brand guidance says not to modify/recreate icons; icon-specific terms not found (UNVERIFIED). https://about.google/brand-resource-center/

---

## 4. Comparison table

| Service                           | List types via API?                        | Pricing API?                                                      | OS                                         | Isolation                                      | Domain-allowlist egress                                          | Exec/upload                                                          | Snapshot/image                              | Cold start                    | Example price (unit, region, date)                                                         |
| --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| AWS Lambda MicroVMs               | Not documented                             | Price List API (UNVERIFIED for this SKU); rates only third-party  | Linux assumed (not documented)             | Firecracker microVM                            | No native; internet or VPC connector, then Network Firewall      | HTTP/WS to in-VM port; `SHELL_INGRESS` token (dev only); no file API | Image = snapshot; suspend keeps memory+disk | "near-instant", no number     | $0.0997/vCPU-h, $0.0132/GB-h us-east-1 Graviton, Jun 2026 (UNVERIFIED, third-party)        |
| AWS AgentCore Code Interpreter    | Not documented                             | Web page only                                                     | Linux (not stated)                         | microVM per session                            | No (Sandbox/Public/VPC modes)                                    | Invoke API, inline upload 100 MB, S3 5 GB                            | None; fixed runtime                         | Not documented                | $0.0895/vCPU-h, $0.00945/GB-h, us-east-1, 2026-11-26                                       |
| AWS AgentCore Runtime v2          | Not documented                             | Web page only                                                     | Linux (not stated)                         | Firecracker microVM (per AWS blog, UNVERIFIED) | Not documented                                                   | Shell via `agentcore exec` (UNVERIFIED)                              | Not documented                              | Not documented                | $0.1276/vCPU-h consumption, 2026-11-26                                                     |
| AWS Fargate                       | Not documented (combos table)              | Price List API                                                    | Linux x86/ARM, Windows                     | microVM (UNVERIFIED)                           | Via VPC + Network Firewall                                       | ECS Exec (SSM), 20 min idle; no file API                             | Image (ECR) only                            | Not documented                | $0.0405/vCPU-h, $0.0044/GB-h Linux x86 us-east-1, 2026-11-26                               |
| AWS EC2                           | Yes, `DescribeInstanceTypes` (credentials) | Price List API                                                    | Linux, Windows, macOS (Dedicated Host)     | Nitro VM                                       | Via VPC + Network Firewall                                       | SSM; no file API                                                     | AMI/EBS (UNVERIFIED)                        | Not documented (Mac: minutes) | mac2.metal $0.65/h us-east-1 (UNVERIFIED); Mac 24 h min                                    |
| AWS CodeBuild                     | Docs table only                            | Web page                                                          | Linux, ARM, GPU, Windows, macOS (reserved) | Container/VM (not stated)                      | VPC                                                              | Not read                                                             | Image                                       | Not documented                | $0.005/min general1.small (example, region not stated)                                     |
| Azure ACA Sandboxes               | Tier table in docs; no API listing found   | Retail Prices API (consumption meters; sandbox meter unconfirmed) | Linux assumed (not stated)                 | microVM                                        | Yes, allow/deny by host via egress proxy (details page not read) | Exec, files, shell, ports, SDKs                                      | Disk images + snapshots (memory/disk)       | <1 s                          | $0.000024/vCPU-s, $0.000003/GiB-s consumption eastus 2026-11-26 (sandbox rate unconfirmed) |
| Azure dynamic sessions            | Region list in docs                        | Retail Prices API                                                 | Linux                                      | Hyper-V                                        | No (egress on/off)                                               | HTTP API into session                                                | Custom image; no snapshot                   | ms from pool                  | $0.03/session-h eastus 2026-11-26                                                          |
| Azure ACI                         | Region/limits docs                         | Retail Prices API                                                 | Linux, Windows (x64 only)                  | Container group on VM                          | Via Azure Firewall (UNVERIFIED)                                  | UNVERIFIED                                                           | Image only                                  | Not documented                | $0.0405/vCPU-h, $0.00445/GB-h eastus 2026-11-26                                            |
| Azure VMs                         | ARM Resource SKUs (credentials)            | Retail Prices API (no auth)                                       | Linux, Windows; no macOS found             | Hyper-V VM                                     | Via Azure Firewall (UNVERIFIED)                                  | UNVERIFIED                                                           | Image/disk snapshot (UNVERIFIED)            | Not documented                | D2s_v5 Linux $0.096/h, Windows $0.188/h eastus 2026-11-26                                  |
| GCP Cloud Run sandboxes (Preview) | Not documented                             | Billing Catalog API (key)                                         | Linux (inferred from examples)             | Not named                                      | Binary only (`--allow-egress`)                                   | `sandbox exec`, tar import/export                                    | Tar snapshot of file state                  | "milliseconds" (secondary)    | Not documented                                                                             |
| GCP Cloud Run jobs                | Docs limits                                | Billing Catalog API (key)                                         | Linux                                      | gen2                                           | Not documented / NGFW FQDN (UNVERIFIED)                          | Not documented                                                       | Image                                       | Not documented                | Rates did not render (UNVERIFIED)                                                          |
| GCP GKE Agent Sandbox             | k8s + GCE APIs                             | Billing Catalog API (key)                                         | Linux                                      | gVisor (Kata optional)                         | Default-deny NetworkPolicy; FQDN not covered                     | Not documented                                                       | Pod snapshots (gVisor, GKE 1.35.3+)         | <1 s warm pool                | Free feature; pay GKE nodes                                                                |
| GCP Compute Engine                | Yes, `machineTypes.list` (OAuth)           | Billing Catalog API, id `6F81-5844-456A`                          | Linux, Windows (UNVERIFIED); no macOS seen | KVM VM (UNVERIFIED)                            | NGFW FQDN (UNVERIFIED)                                           | UNVERIFIED                                                           | Disk snapshot (UNVERIFIED)                  | Not documented                | Not read                                                                                   |
| GCP Cloud Build                   | Not read                                   | Not read                                                          | Not verified                               | Not read                                       | Not read                                                         | Not read                                                             | Not read                                    | Not read                      | Not read                                                                                   |

---

## 5. Registry design implications

1. Pricing sources by ease: Azure Retail Prices (no auth, filterable, USD) > AWS Bulk price files (credentials for the index calls) > GCP Billing Catalog (API key + enabled project). Newest products (Lambda MicroVMs, AgentCore, ACA Sandboxes, Cloud Run sandboxes) are not yet reliably in these APIs: model them with hand-curated price entries carrying a `source_url`, `read_at` and a `verified: false` flag.
2. Instance-type lists by API exist for EC2 (`DescribeInstanceTypes`), GCE (`machineTypes.list`) and Azure VMs (Resource SKUs), all requiring credentials. Sandbox-style products expose fixed tiers (ACA XS-3XL; Lambda MicroVM baseline sizes; Fargate combo table) that must be hand-listed.
3. Schema fields to include beyond the brief: `egress_control: none | binary | cidr | domain | dns`, `suspend_resume`, `memory_snapshot`, `exec_api`, `file_api`, `max_lifetime_s`, `min_billing_s` (Fargate 60 s / Windows 300 s; EC2 60 s; Mac host 86,400 s; AgentCore 1 s), `status: preview | ga`.
4. Domain allowlist is native only on Azure ACA Sandboxes among these. On AWS and GCP it is a network-layer add-on (Network Firewall / NGFW FQDN) with separate cost.

---

## 6. Verdict

**Longshore agent runs (create, exec, upload, detached command, delete; minutes to hours; egress none/allowlist; snapshots):**

- **AWS: Lambda MicroVMs.** Firecracker VM, snapshot-based images, suspend/resume, up to 8 h, `SHELL_INGRESS`, `run-microvm`/`terminate-microvm` map to create/delete. Gaps: no native domain allowlist (needs VPC connector + Network Firewall), no documented file-upload or exec API (ship a small runner in the image and talk HTTP to it, like Longshore's runner today), sizes and OS unspecified, five regions. Fallback: ECS Fargate with ECS Exec (mature, Windows too, no snapshots, 20-min idle exec timeout). Skip AgentCore Code Interpreter for full coding agents (fixed runtime, no allowlist).
- **Azure: Container Apps Sandboxes.** The closest match to Longshore's contract: microVM, egress policy by host with secret injection, exec/files/shell SDK, snapshots, disk images, auto-suspend, size tiers up to 16 vCPU/32 GiB. Gaps: preview-vs-GA unclear, rates not published in the pricing pages read, max lifetime undocumented, Linux only presumably. Best overall hyperscaler fit.
- **GCP: Cloud Run jobs.** The sandbox launcher is Preview and thin (no documented limits, all-or-nothing egress), so use the job itself as the run sandbox (tasks up to 168 h, gen2), and GKE Agent Sandbox only if Longshore already operates a cluster. Egress is all-or-nothing on Cloud Run sandboxes; allowlist needs NGFW/VPC work. Rank behind Azure and AWS for this use.

**Turntable CI (Linux now; Windows and macOS later):**

- **AWS: EC2.** The only hyperscaler covering Linux x86/ARM, Windows and macOS (Apple silicon via Dedicated Hosts, 24 h minimum allocation, ~$0.65-1.23/h, UNVERIFIED) with one API and `DescribeInstanceTypes`. Use warm pools of Spot Linux plus Fargate for light Linux/Windows container jobs. Plan Mac capacity as long-lived hosts, not per-job.
- **Azure: VMs for Windows** (D2s_v5 Windows $0.188/h vs Linux $0.096/h, eastus, 2026-11-26); ACA Sandboxes for fast Linux jobs. No macOS.
- **GCP: Compute Engine** for Linux and Windows (UNVERIFIED), no macOS.

**Order to build adapters:** (1) Azure ACA Sandboxes (agent runs), (2) AWS Lambda MicroVMs (agent runs) plus AWS EC2 (Turntable Linux/Windows/macOS), (3) AWS Fargate and Azure VMs (fallbacks), (4) GCP Cloud Run jobs / GKE Agent Sandbox. Re-read rates and GA status before relying on any `UNVERIFIED` entry.
