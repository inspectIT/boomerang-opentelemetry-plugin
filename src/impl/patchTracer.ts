import * as api from '@opentelemetry/api';
import { SpanImpl } from '@opentelemetry/sdk-trace-base/build/src/Span'
import { isTracingSuppressed } from '@opentelemetry/core/build/src/trace/suppress-tracing'
import { sanitizeAttributes } from '@opentelemetry/core/build/src/common/attributes';
import { TransactionSpanManager } from './transaction/transactionSpanManager';
import { Context, SpanOptions } from '@opentelemetry/api';

/**
 * Create a patched version of the startSpan function of the Tracer class
 * to use the transaction span as root span. To enable transaction recording,
 * we need to inject additional logic to determine the parentContext.
 * Original: https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/packages/opentelemetry-sdk-trace-base/src/Tracer.ts
 *
 * @return patched startSpan() function
 */
export function patchedStartSpan(name: string, options?: SpanOptions, context?: Context): api.Span {
    // remove span from context in case a root span is requested via options
    if (options.root) {
      context = api.trace.deleteSpan(context);
    }
    const parentSpan = api.trace.getSpan(context);

    if (isTracingSuppressed(context)) {
      api.diag.debug('Instrumentation suppressed, returning Noop Span');
      const nonRecordingSpan = api.trace.wrapSpanContext(
        api.INVALID_SPAN_CONTEXT
      );
      return nonRecordingSpan;
    }

    // Overwrite logic to set parentSpanContext & spanId
    /*
      #######################################
              OVERWRITTEN LOGIC START
      #######################################
     */

    let parentSpanContext = parentSpan?.spanContext();

    if(!parentSpanContext) {
      const transactionSpan = TransactionSpanManager.getTransactionSpan();
      if(transactionSpan)
        parentSpanContext = transactionSpan.spanContext();
    }

    // Use transaction span-ID for documentLoadSpan, if existing
    let spanId = this._idGenerator.generateSpanId();
    if(name == "documentLoad") {
      const transactionSpanId = TransactionSpanManager.getTransactionSpanId();
      if(transactionSpanId) spanId = transactionSpanId;
    }

    /*
      #######################################
              OVERWRITTEN LOGIC END
      #######################################
     */

    let validParentSpanContext;
    let traceId;
    let traceState;
    if (
      !parentSpanContext ||
      !api.trace.isSpanContextValid(parentSpanContext)
    ) {
      // New root span.
      traceId = this._idGenerator.generateTraceId();
    } else {
      // New child span.
      traceId = parentSpanContext.traceId;
      traceState = parentSpanContext.traceState;
      validParentSpanContext = parentSpanContext;
    }

    const spanKind = options.kind ?? api.SpanKind.INTERNAL;
    const links = (options.links ?? []).map(link => {
      return {
        context: link.context,
        attributes: sanitizeAttributes(link.attributes),
      };
    });
    const attributes = sanitizeAttributes(options.attributes);
    // make sampling decision
    const samplingResult = this._sampler.shouldSample(
      context,
      traceId,
      name,
      spanKind,
      attributes,
      links
    );

    traceState = samplingResult.traceState ?? traceState;

    const traceFlags =
      samplingResult.decision === api.SamplingDecision.RECORD_AND_SAMPLED
        ? api.TraceFlags.SAMPLED
        : api.TraceFlags.NONE;
    const spanContext = { traceId, spanId, traceFlags, traceState };
    if (samplingResult.decision === api.SamplingDecision.NOT_RECORD) {
      api.diag.debug(
        'Recording is off, propagating context in a non-recording span'
      );
      const nonRecordingSpan = api.trace.wrapSpanContext(spanContext);
      return nonRecordingSpan;
    }

    // Set initial span attributes. The attributes object may have been mutated
    // by the sampler, so we sanitize the merged attributes before setting them.
    const initAttributes = sanitizeAttributes(
      Object.assign(attributes, samplingResult.attributes)
    );

    const span = new SpanImpl({
      resource: this._resource,
      scope: this.instrumentationScope,
      context,
      spanContext,
      name,
      kind: spanKind,
      links,
      parentSpanContext: validParentSpanContext,
      attributes: initAttributes,
      startTime: options.startTime,
      spanProcessor: this._spanProcessor,
      spanLimits: this._spanLimits,
    });
    return span;
}