/** Instrument only media edges. All SDP, WebRTC and provider transport remain real. */
export function liveVoiceMediaInstall() {
    const recorders: {
        name: string;
        recorder: MediaRecorder;
        chunks: Blob[];
        stopped: Promise<void>;
    }[] = [];
    const peers: RTCPeerConnection[] = [];
    let microphone:
        | {
              context: AudioContext;
              destination: MediaStreamAudioDestinationNode;
              clock: ConstantSourceNode;
          }
        | undefined;
    const record = (name: string, stream: MediaStream) => {
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        const chunks: Blob[] = [];
        const stopped = new Promise<void>((resolve) =>
            recorder.addEventListener("stop", () => resolve(), { once: true }),
        );
        recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) chunks.push(event.data);
        });
        recorder.start(500);
        recorders.push({ name, recorder, chunks, stopped });
    };
    const originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        // Chromium's fake device exercises the ordinary permission boundary;
        // the controllable virtual microphone supplies actual speech PCM.
        const permitted = await originalMedia(constraints);
        for (const track of permitted.getTracks()) track.stop();
        const context = new AudioContext({ sampleRate: 48_000 });
        const destination = context.createMediaStreamDestination();
        // A real microphone keeps supplying PCM after speech ends. GPT-Live's
        // duplex audio clock must continue through the assistant's response.
        const clock = context.createConstantSource();
        clock.offset.value = 0;
        clock.connect(destination);
        clock.start();
        await context.resume();
        microphone = { context, destination, clock };
        return destination.stream;
    };
    const NativePeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
        constructor(configuration?: RTCConfiguration) {
            super(configuration);
            peers.push(this);
            this.addEventListener("track", (event) =>
                record("output", new MediaStream([event.track])),
            );
        }
        override addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
            if (track.kind === "audio") record("input", new MediaStream([track]));
            return super.addTrack(track, ...streams);
        }
    };
    const api = {
        async microphonePlay(base64: string) {
            if (!microphone) throw new Error("The call has not opened its microphone.");
            const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
            const buffer = await microphone.context.decodeAudioData(bytes.buffer);
            const source = microphone.context.createBufferSource();
            source.buffer = buffer;
            source.connect(microphone.destination);
            await microphone.context.resume();
            source.start();
            return {
                durationSeconds: buffer.duration,
                sampleRate: buffer.sampleRate,
                channels: buffer.numberOfChannels,
            };
        },
        async stats() {
            const reports: {
                type: string;
                bytes: number;
                packets: number;
                energy: number | null;
                samplesDuration: number | null;
            }[] = [];
            for (const peer of peers) {
                const stats = await peer.getStats();
                stats.forEach((entry) => {
                    if (
                        (entry.type === "inbound-rtp" ||
                            entry.type === "outbound-rtp" ||
                            entry.type === "media-source") &&
                        entry.kind === "audio"
                    )
                        reports.push({
                            type: entry.type,
                            bytes: entry.bytesReceived ?? entry.bytesSent ?? 0,
                            packets: entry.packetsReceived ?? entry.packetsSent ?? 0,
                            energy: entry.totalAudioEnergy ?? null,
                            samplesDuration: entry.totalSamplesDuration ?? null,
                        });
                });
            }
            return { states: peers.map((peer) => peer.connectionState), reports };
        },
        async recordingsFinish() {
            for (const entry of recorders)
                if (entry.recorder.state !== "inactive") entry.recorder.stop();
            await Promise.all(recorders.map((entry) => entry.stopped));
            const recordings: { name: string; base64: string; bytes: number }[] = [];
            for (const entry of recorders) {
                const bytes = new Uint8Array(await new Blob(entry.chunks).arrayBuffer());
                let binary = "";
                for (const byte of bytes) binary += String.fromCharCode(byte);
                recordings.push({ name: entry.name, base64: btoa(binary), bytes: bytes.length });
            }
            return recordings;
        },
        async microphoneRelease() {
            microphone?.clock.stop();
            await microphone?.context.close();
        },
    };
    (window as Window & { voiceGym?: typeof api }).voiceGym = api;
}

export type LiveVoiceMedia = {
    microphonePlay(
        base64: string,
    ): Promise<{ durationSeconds: number; sampleRate: number; channels: number }>;
    stats(): Promise<{
        states: string[];
        reports: {
            type: string;
            bytes: number;
            packets: number;
            energy: number | null;
            samplesDuration: number | null;
        }[];
    }>;
    recordingsFinish(): Promise<{ name: string; base64: string; bytes: number }[]>;
    microphoneRelease(): Promise<void>;
};
