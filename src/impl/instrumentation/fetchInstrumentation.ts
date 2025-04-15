import * as api from '@opentelemetry/api';
import { addUrlParams } from './urlParams';
import { FetchInstrumentation, FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';
import { GlobalInstrumentationConfig } from '../../types';

type ExposedFetchSuper = {
  _createSpan(url: string, options: Partial<Request | RequestInit>): api.Span | undefined;
}

/**
 * Injects code into the original FetchInstrumentation
 * https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/experimental/packages/opentelemetry-instrumentation-fetch/src/fetch.ts
 */
export class CustomFetchInstrumentation extends FetchInstrumentation {

  constructor(config: FetchInstrumentationConfig = {}, globalInstrumentationConfig: GlobalInstrumentationConfig) {
    super(config);
    const { requestParameter} = globalInstrumentationConfig;

    //Store original function in variable
    const exposedSuper = this as any as ExposedFetchSuper;
    const _superCreateSpan: ExposedFetchSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    //Override function
    exposedSuper._createSpan = (url, options = {}) => {
      const span = _superCreateSpan(url, options);

      if(span && requestParameter?.enabled)
        addUrlParams(span, url, requestParameter.excludeKeysFromBeacons);

      return span;
    }
  }
}




