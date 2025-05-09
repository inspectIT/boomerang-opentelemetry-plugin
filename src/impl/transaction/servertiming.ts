// Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/servertiming.ts
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { TransactionSpanManager } from './transactionSpanManager';

export function captureTraceParentFromPerformanceEntries(entries: PerformanceEntries): void {
  if (!(entries as any).serverTiming) {
    return;
  }
  for(const st of (entries as any).serverTiming) {
    if (st.name === 'traceparent' && st.description) {
      const match = st.description.match(ValueRegex);
      setTransactionIds(match);
    }
  }
}

function setTransactionIds(match: RegExpMatchArray): void {
  if (match && match[1] && match[2]) {
    const traceId = match[1];
    const spanId = match[2];
    TransactionSpanManager.setTransactionTraceId(traceId);
    TransactionSpanManager.setTransactionSpanId(spanId);
  }
}

const ValueRegex = new RegExp('00-([0-9a-f]{32})-([0-9a-f]{16})-01');