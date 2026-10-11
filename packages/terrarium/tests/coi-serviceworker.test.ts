import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  new URL('../../../web/coi-serviceworker.js', import.meta.url),
  'utf8',
);

async function pageState(controlled = false, isolated = false) {
  let reloads = 0;
  let registrations = 0;
  const listeners = new Map<string, () => void>();
  const registrationListeners = new Map<string, () => void>();
  const controller = { postMessage: () => {} };
  const worker = {
    controller: controlled ? controller : null,
    addEventListener: (name: string, listener: () => void) =>
      listeners.set(name, listener),
    register: async () => {
      registrations++;
      return {
        active: null,
        scope: '/terrarium/',
        addEventListener: (name: string, listener: () => void) =>
          registrationListeners.set(name, listener),
      };
    },
  };
  const window = {
    crossOriginIsolated: isolated,
    isSecureContext: true,
    document: { currentScript: { src: '/terrarium/coi-serviceworker.js' } },
    coi: {
      quiet: true,
      doReload: () => {
        reloads++;
      },
    },
  };
  runInNewContext(source, { window, navigator: { serviceWorker: worker } });
  await Promise.resolve();
  return {
    worker,
    window,
    listeners,
    registrationListeners,
    controller,
    reloads: () => reloads,
    registrations: () => registrations,
  };
}

test('first installation waits for control instead of reloading on updatefound', async () => {
  const page = await pageState();
  page.registrationListeners.get('updatefound')?.();
  expect(page.reloads()).toBe(0);
  page.worker.controller = page.controller;
  page.listeners.get('controllerchange')!();
  expect(page.reloads()).toBe(1);
  page.listeners.get('controllerchange')!();
  expect(page.reloads()).toBe(1);
});

test('an existing non-isolated controller does not cause a reload loop', async () => {
  expect((await pageState(true)).reloads()).toBe(0);
});

test('a controllerchange without a controller cannot reload the page', async () => {
  const page = await pageState();
  page.listeners.get('controllerchange')!();
  expect(page.reloads()).toBe(0);
});

test('an already isolated page neither registers nor reloads', async () => {
  const page = await pageState(true, true);
  expect(page.registrations()).toBe(0);
  expect(page.reloads()).toBe(0);
});
