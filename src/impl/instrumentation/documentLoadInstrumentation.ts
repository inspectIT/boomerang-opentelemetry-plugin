import {
  DocumentLoadInstrumentation,
  DocumentLoadInstrumentationConfig
} from '@opentelemetry/instrumentation-document-load';
import * as api from '@opentelemetry/api';
import { captureTraceParentFromPerformanceEntries } from '../transaction/servertiming';
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { Span } from '@opentelemetry/sdk-trace-base';
import { TransactionSpanManager } from '../transaction/transactionSpanManager';
import { addUrlParams } from './urlParams';
import { GlobalInstrumentationConfig } from '../../types';

export interface CustomDocumentLoadInstrumentationConfig extends DocumentLoadInstrumentationConfig {
  recordTransaction?: boolean;
  exporterDelay?: number;
}

type PerformanceEntriesWithServerTiming = PerformanceEntries & {serverTiming?: ReadonlyArray<({name: string, duration: number, description: string})>}
type ExposedDocumentLoadSuper = {
  _startSpan(spanName: string, performanceName: string, entries: PerformanceEntries, parentSpan?: Span): api.Span | undefined;
  _endSpan(span: api.Span | undefined, performanceName: string, entries: PerformanceEntries): void;
}

/**
 * Injects code into the original DocumentLoadInstrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/blob/instrumentation-document-load-v0.45.0/plugins/web/opentelemetry-instrumentation-document-load/src/instrumentation.ts
 * Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/SplunkDocumentLoadInstrumentation.ts
 */
export class CustomDocumentLoadInstrumentation extends DocumentLoadInstrumentation {
  readonly component: string = 'document-load-server-timing';
  moduleName = this.component;

  // Per default transaction should not be recorded
  private recordTransaction = false;

  constructor(config: CustomDocumentLoadInstrumentationConfig = {}, globalInstrumentationConfig: GlobalInstrumentationConfig) {
    super(config);
    const { requestParameter} = globalInstrumentationConfig;

    if(config.recordTransaction)
      this.recordTransaction = config.recordTransaction;

    //Store original functions in variables
    const exposedSuper = this as any as ExposedDocumentLoadSuper;
    const _superStartSpan: ExposedDocumentLoadSuper['_startSpan'] = exposedSuper._startSpan.bind(this);
    const _superEndSpan: ExposedDocumentLoadSuper['_endSpan'] = exposedSuper._endSpan.bind(this);

    if(this.recordTransaction) {
      //Override function
      exposedSuper._startSpan = (spanName, performanceName, entries, parentSpan) => {
        if (!(entries as PerformanceEntriesWithServerTiming).serverTiming && performance.getEntriesByType) {
          const navEntries = performance.getEntriesByType('navigation');
          // @ts-ignore
          if (navEntries[0]?.serverTiming) {
            // @ts-ignore
            (entries as PerformanceEntriesWithServerTiming).serverTiming = navEntries[0].serverTiming;
          }
        }
        captureTraceParentFromPerformanceEntries(entries);

        const span = _superStartSpan(spanName, performanceName, entries, parentSpan);
        const exposedSpan = span as any as Span;
        if(exposedSpan.name == "documentLoad") TransactionSpanManager.setTransactionSpan(span);

        if(span && exposedSpan.name == "documentLoad" && requestParameter?.enabled)
          addUrlParams(span, location.href, requestParameter.excludeKeysFromBeacons);

        return span;
      }

      //Override function
      exposedSuper._endSpan = (span, performanceName, entries) => {
        const transactionSpan = TransactionSpanManager.getTransactionSpan();
        // Don't close transactionSpan
        // transactionSpan will be closed through "beforeunload"-event
        if(transactionSpan && transactionSpan == span) return;

        return _superEndSpan(span, performanceName, entries);
      };
    }
    else {
      //Override function
      exposedSuper._startSpan = (spanName, performanceName, entries, parentSpan) => {
        const span = _superStartSpan(spanName, performanceName, entries, parentSpan);
        const exposedSpan = span as any as Span;

        if(span && exposedSpan.name == "documentLoad" && requestParameter?.enabled)
          addUrlParams(span, location.href, requestParameter.excludeKeysFromBeacons);

        return span;
      }
    }
  }
}
