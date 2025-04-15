/**
 * The original OpenTelemetry Collector span exporter used the `Array.from` method which is overridden by Prototype.
 * The Prototype's function does not provide all functionality of the original function, thus, the exporter will fail
 * exporting spans in case Prototype is used.
 * See: https://github.com/prototypejs/prototype/issues/338
 * <>
 * The original exporter is using the `JSON.stringify` method. This method is calling `toJSON` functions on the object to serialize.
 * Unfortunately, prototype is adding a `toJSON` method to the Array class in versions prior 1.7. This leads to the problem, that nested
 * arrays are stringified separately, thus, they are considered not as an array anymore but as a string resulting in an invalid JSON string.
 * See: https://stackoverflow.com/questions/29637962/json-stringify-turned-the-value-array-into-a-string/29638420#29638420
 */
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer'
import { createExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/src/trace/internal'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * Patches the `serializeRequest` function of the JsonTraceSerializer,
 * which is used by the trace exporter in order to handle the span serialization
 * correctly, when using Prototype < 1.7
 */
export function patchTraceSerializer() {
  const arrayPrototype: any = Array.prototype;
  if (
    typeof Prototype !== 'undefined' &&
    parseFloat(Prototype.Version.substring(0, 3)) < 1.7 &&
    typeof arrayPrototype.toJSON !== 'undefined'
  ) {
    JsonTraceSerializer.serializeRequest = patchSerializeRequest;
  }
}

/**
 * This function is basically a copy of the `serializeRequest` function of the following file:
 * https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/experimental/packages/otlp-transformer/src/trace/json/trace.ts
 *
 * Here, a "fix" has been added in order to support Prototype prior 1.7.
 */
function patchSerializeRequest(arg: ReadableSpan[]) {
  const request = createExportTraceServiceRequest(arg, {
    useHex: true,
    useLongBits: false,
  });
  const encoder = new TextEncoder();

  // START fix
  // in order to fix the problem, we temporarily remove the `toJSON`
  // function (1), serializing the spans (2) and reading the function (3)
  // in order to preserve the initial state of the class

  // (1)
  const arrayPrototype: any = Array.prototype;
  const arrayToJson = arrayPrototype.toJSON;
  delete arrayPrototype.toJSON;
  // (2)
  const body = JSON.stringify(request);
  // (3)
  arrayPrototype.toJSON = arrayToJson;
  // END fix

  return encoder.encode(body);
}

// declares the global Prototype variable
declare const Prototype: any;
