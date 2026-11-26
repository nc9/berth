import type { Provider } from "../catalog/types.ts";
import { aws } from "./aws.ts";
import { azure } from "./azure.ts";
import { daytona } from "./daytona.ts";
import { e2b } from "./e2b.ts";
import { gcp } from "./gcp.ts";
import { modal } from "./modal.ts";

export const providers: Provider[] = [aws, azure, gcp, daytona, modal, e2b];
