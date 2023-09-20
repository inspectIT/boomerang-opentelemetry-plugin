import * as api from '@opentelemetry/api';
import { addUrlParams } from './urlParams';
import { FetchInstrumentation, FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';

export interface CustomFetchInstrumentationConfig extends FetchInstrumentationConfig {
  excludeParameterKeys?: string[];
}

type ExposedFetchSuper = {
  _createSpan(url: string, options: Partial<Request | RequestInit>): api.Span | undefined;
}

export class CustomFetchInstrumentation extends FetchInstrumentation {

  private readonly excludeKeys: string[] = [];

  constructor(config: CustomFetchInstrumentationConfig = {}) {
    super(config);
    this.excludeKeys = config.excludeParameterKeys;

    const exposedSuper = this as any as ExposedFetchSuper;
    const _superStartSpan: ExposedFetchSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    exposedSuper._createSpan = (url, options = {}) => {
      const span = _superStartSpan(url, options);

      addUrlParams(span, url, this.excludeKeys);

      return span;
    }
  }
}




