type TelemetryProps = Record<string, unknown>;

const QUEUE: Array<{ event: string; props: TelemetryProps }> = [];

const flush = () => {
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    while (QUEUE.length > 0) {
      const payload = QUEUE.shift();
      if (!payload) continue;
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry', blob);
    }
  } else {
    QUEUE.length = 0;
  }
};

export function track(event: string, props: TelemetryProps = {}) {
  const payload = { event, props: { ...props, timestamp: Date.now() } };

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon('/api/telemetry', blob);
    return;
  }

  if (typeof window !== 'undefined') {
    QUEUE.push(payload);
    setTimeout(flush, 1000);
  }
}
