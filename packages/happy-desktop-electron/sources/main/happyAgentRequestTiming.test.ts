import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { happyAgentRequestTimingCreate } from "./happyAgentRequestTiming";

describe("Happy Agent request timing diagnostics", () => {
    it("stays silent on normal requests and emits only stage timings on slow ones", () => {
        let time = 0;
        const debug = vi.fn();
        const response = new EventEmitter() as ServerResponse;
        Object.defineProperties(response, {
            statusCode: { value: 200 },
            writableFinished: { value: true },
        });
        const mark = happyAgentRequestTimingCreate(response, debug, () => time);
        time = 20;
        mark?.("daemon-headers");
        time = 25;
        mark?.("daemon-first-byte");
        time = 100;
        response.emit("finish");
        expect(debug).not.toHaveBeenCalled();

        const slow = new EventEmitter() as ServerResponse;
        Object.defineProperties(slow, {
            statusCode: { value: 200 },
            writableFinished: { value: false },
        });
        const slowMark = happyAgentRequestTimingCreate(slow, debug, () => time);
        time = 125;
        slowMark?.("daemon-headers");
        time = 130;
        slowMark?.("daemon-first-byte");
        time = 350;
        slow.emit("close");
        slow.emit("finish");
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]![0]).toContain(
            "total=250ms daemonHeaders=25ms firstByte=30ms body=225ms status=200 completed=false",
        );
    });
});
