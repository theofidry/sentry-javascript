import { EventProcessor, Hub, Integration, Severity } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { fill, normalize } from '@sentry/utils/object';
import { safeJoin } from '@sentry/utils/string';

const global = getGlobalObject<Window | NodeJS.Global>();

/** Send Console API calls as Sentry Events */
export class CaptureConsole implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = CaptureConsole.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'CaptureConsole';

  /**
   * @inheritDoc
   */
  private readonly _levels: string[] = ['log', 'info', 'warn', 'error', 'debug', 'assert'];

  /**
   * @inheritDoc
   */
  public constructor(options: { levels?: string[] } = {}) {
    if (options.levels) {
      this._levels = options.levels;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!('console' in global)) {
      return;
    }

    this._levels.forEach(function(level: string): void {
      if (!(level in global.console)) {
        return;
      }

      fill(global.console, level, function(originalConsoleLevel: () => any): any {
        // tslint:disable-next-line:only-arrow-functions
        return function(...args: any[]): any {
          const hub = getCurrentHub();

          if (hub.getIntegration(CaptureConsole)) {
            hub.withScope(scope => {
              scope.setLevel(Severity.fromString(level));
              scope.setExtra('arguments', normalize(args, 3));
              scope.addEventProcessor(event => {
                event.logger = 'console';
                if (event.sdk) {
                  event.sdk = {
                    ...event.sdk,
                    integrations: [...(event.sdk.integrations || []), 'console'],
                  };
                }
                return event;
              });

              let message = safeJoin(args, ' ');
              if (level === 'assert') {
                if (args[0] === false) {
                  message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
                  scope.setExtra('arguments', normalize(args.slice(1), 3));
                  hub.captureMessage(message);
                }
              } else {
                hub.captureMessage(message);
              }
            });
          }

          // this fails for some browsers. :(
          if (originalConsoleLevel) {
            Function.prototype.apply.call(originalConsoleLevel, global.console, args);
          }
        };
      });
    });
  }
}
