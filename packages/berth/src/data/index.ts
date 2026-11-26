import type { Provider } from "../catalog/types.ts";
import { daytona } from "./daytona.ts";
import { e2b } from "./e2b.ts";
import { modal } from "./modal.ts";

export const providers: Provider[] = [daytona, modal, e2b];
