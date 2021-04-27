import api, { context, setSpan, Span } from '@opentelemetry/api';
import { AlwaysOnSampler, AlwaysOffSampler, TraceIdRatioBasedSampler } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter, CollectorExporterNodeConfigBase } from '@opentelemetry/exporter-collector';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { PluginProperties, ContextFunction } from '../types';

/**
 * TODOs:
 * - other provider config options via props
 * - allow propagator definition via props
 */
export default class OpenTelemetryTracingImpl {

  private props: PluginProperties = {
    samplingRate: 1,
    corsUrls: [],
    collectorConfiguration: undefined,
    consoleOnly: false,
    plugins: {
      instrument_fetch: true,
      instrument_xhr: true
    }
  };

  private initialized: boolean = false;

  /** Boomerangs configured beacon_url. */
  private beaconUrl: string;

  private traceProvider: WebTracerProvider;

  public register = () => {
    // return if already initialized
    if (this.initialized) {
      return;
    }

    // create provider
    const providerWithZone = new WebTracerProvider({
      sampler: this.resolveSampler()
    });

    providerWithZone.register({
      // changing default contextManager to use ZoneContextManager - supports asynchronous operations
      contextManager: new ZoneContextManager(),
      // using B3 context propagation format
      propagator: new B3Propagator(),
    });

    // registering instrumentations / plugins
    registerInstrumentations({
      instrumentations: this.getInstrumentationPlugins(),
      // @ts-ignore - has to be clearified why typescript doesn't like this line
      tracerProvider: providerWithZone,
    });

    // use OT collector if logging to console is not enabled
    if (!this.props.consoleOnly) {
      // register opentelemetry collector exporter
      const collectorOptions: CollectorExporterNodeConfigBase = {
        url: this.collectorUrlFromBeaconUrl(),
        headers: {}, // an optional object containing custom headers to be sent with each request
        concurrencyLimit: 10, // an optional limit on pending requests
        ...this.props.collectorConfiguration,
      };

      const exporter = new CollectorTraceExporter(collectorOptions);
      providerWithZone.addSpanProcessor(new SimpleSpanProcessor(exporter));
    } else {
      // register console exporter for logging all recorded traces to the console
      providerWithZone.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter())
      );
    }

    // store the webtracer
    this.traceProvider = providerWithZone;

    // mark plugin initalized
    this.initialized = true;
  };

  public isInitalized = () => this.initialized;

  public getProps = () => this.props;

  public getOpenTelemetryApi = () => {
    return api;
  };

  public setBeaconUrl = (url: string) => {
    this.beaconUrl = url;
  };

  /**
   * Returns a tracer instance from the used OpenTelemetry SDK.
   */
  public getTracer = (name: string, version?: string) => {
    return this.traceProvider.getTracer(name, version);
  };

  /**
   * Convenient function for executing a functions in the context of
   * a specified span.
   */
  public withSpan = (span: Span, fn: ContextFunction) => {
    context.with(setSpan(context.active(), span), fn);
  };

  private getInstrumentationPlugins = () => {
    const { plugins: { instrument_fetch, instrument_xhr }, corsUrls } = this.props;
    const plugins: any = [];

    // XMLHttpRequest Instrumentation for web plugin
    if (instrument_xhr) {
      plugins.push(new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: this.props.corsUrls,
      }));
    }

    // Instrumentation for the fetch API
    if (instrument_fetch) {
      plugins.push(new FetchInstrumentation());
    }

    return plugins;
  };

  /**
   * Derives the collector Url based on the beacon one.
   */
  private collectorUrlFromBeaconUrl = () => {
    if (this.beaconUrl) {
      const indexOf = this.beaconUrl.lastIndexOf('/beacon');
      if (indexOf !== -1) {
        return `${this.beaconUrl.substring(0, indexOf)}/spans`;
      }
    }
    return undefined;
  };

  /**
   * Resolves a sampler implementation based on the specified sample rate.
   */
  private resolveSampler = () => {
    const { samplingRate } = this.props;

    if (samplingRate < 0) {
      return new AlwaysOffSampler();
    } else if (samplingRate > 1) {
      return new AlwaysOnSampler();
    } else {
      return new TraceIdRatioBasedSampler(samplingRate);
    }
  };
}
