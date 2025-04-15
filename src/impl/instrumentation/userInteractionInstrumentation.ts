import * as api from '@opentelemetry/api';
import { addUrlParams } from './urlParams';
import { GlobalInstrumentationConfig } from '../../types';
import {
  EventName,
  UserInteractionInstrumentation,
  UserInteractionInstrumentationConfig
} from '@opentelemetry/instrumentation-user-interaction';

type ExposedUserInteractionSuper = {
  _createSpan(element: EventTarget | null | undefined, eventName: EventName, parentSpan?: api.Span | undefined): api.Span | undefined;
}

/**
 * Injects code into the original UserInteractionInstrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/blob/instrumentation-user-interaction-v0.45.0/plugins/web/opentelemetry-instrumentation-user-interaction/src/instrumentation.ts
 */
export class CustomUserInteractionInstrumentation extends UserInteractionInstrumentation {

  constructor(config: UserInteractionInstrumentationConfig = {}, globalInstrumentationConfig: GlobalInstrumentationConfig) {
    super(config);
    const { requestParameter} = globalInstrumentationConfig;

    //Store original function in variable
    const exposedSuper = this as any as ExposedUserInteractionSuper;
    const _superCreateSpan: ExposedUserInteractionSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    //Override function
    exposedSuper._createSpan = (element, eventName, parentSpan) => {
      const span = _superCreateSpan(element, eventName, parentSpan);

      if(span && requestParameter?.enabled)
        addUrlParams(span, location.href, requestParameter.excludeKeysFromBeacons);

      return span;
    }
  }
}




