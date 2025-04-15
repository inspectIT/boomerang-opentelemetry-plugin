import * as api from '@opentelemetry/api';
import {
  XMLHttpRequestInstrumentation,
  XMLHttpRequestInstrumentationConfig
} from '@opentelemetry/instrumentation-xml-http-request';
import { addUrlParams } from './urlParams';
import { GlobalInstrumentationConfig } from '../../types';

type ExposedXHRSuper = {
  _createSpan(xhr: XMLHttpRequest, url: string, method: string): api.Span | undefined;
}

/**
 * Injects code into the original XMLHttpRequestInstrumentation
 * https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/experimental/packages/opentelemetry-instrumentation-xml-http-request/src/xhr.ts
 */
export class CustomXMLHttpRequestInstrumentation extends XMLHttpRequestInstrumentation {

  constructor(config: XMLHttpRequestInstrumentationConfig = {}, globalInstrumentationConfig: GlobalInstrumentationConfig) {
    super(config);
    const { requestParameter} = globalInstrumentationConfig;

    //Store original function in variable
    const exposedSuper = this as any as ExposedXHRSuper;
    const _superCreateSpan: ExposedXHRSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    //Override function
    exposedSuper._createSpan = (xhr, url, method) => {
      const span = _superCreateSpan(xhr, url, method);

      if(span && requestParameter?.enabled)
        addUrlParams(span, url, requestParameter.excludeKeysFromBeacons);

      return span;
    }
  }
}




