import { expect, it } from "vitest";
import {
    happyAgentServiceTierFromWire,
    happyAgentServiceTierToWire,
} from "./happyAgentServiceTier.js";

it("preserves opaque tier IDs through the wire boundary and clears the default with null", () => {
    expect(happyAgentServiceTierToWire(happyAgentServiceTierFromWire("ultrafast"))).toBe(
        "ultrafast",
    );
    expect(happyAgentServiceTierToWire(happyAgentServiceTierFromWire("priority"))).toBe("priority");
    expect(happyAgentServiceTierFromWire("priority")).toBe("priority");
    expect(happyAgentServiceTierFromWire(null)).toBeUndefined();
    expect(happyAgentServiceTierToWire(undefined)).toBeNull();
    expect(happyAgentServiceTierFromWire("future-tier")).toBe("future-tier");
});
