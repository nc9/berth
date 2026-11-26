import type { Provider } from "../catalog/types.ts";
import { aws } from "./aws.ts";
import { azure } from "./azure.ts";
import { gcp } from "./gcp.ts";

export const providers: Provider[] = [aws, azure, gcp];
