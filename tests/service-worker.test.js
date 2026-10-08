import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const workerPath = fileURLToPath(new URL('../public/sw.js', import.meta.url));
const workerSource = readFileSync(workerPath, 'utf8');
const origin = 'https://usf-sharia.web.app';

function createResponse(body, status = 200) {
  return {
    body,
    status,
    ok: status >= 200 && status < 300,
    clone() {
      return createResponse(body, status);
    },
    async text() {
      return body;
    }
  };
}

function requestUrl(request) {
  return new URL(typeof request === 'string' ? request : request.url, origin);
}

function createServiceWorker({ oldCaches = [], currentAppJs = 'fresh app bundle' } = {}) {
  const listeners = new Map();
  const cacheData = new Map(oldCaches.map(name => [name, new Map()]));
  const networkRequests = [];
  const deletedCaches = [];
  let skippedWaiting = false;
  let clientsClaimed = false;

  class MockRequest {
    constructor(input, options = {}) {
      this.url = requestUrl(input).href;
      this.cache = options.cache ?? 'default';
      this.method = options.method ?? 'GET';
      this.mode = options.mode ?? 'cors';
    }
  }

  const fetchNetwork = async request => {
    const url = requestUrl(request);
    networkRequests.push({ path: url.pathname, cache: request.cache ?? 'default' });
    return createResponse(url.pathname === '/app.js' ? currentAppJs : `network:${url.pathname}`);
  };

  const caches = {
    async open(name) {
      if (!cacheData.has(name)) cacheData.set(name, new Map());
      const entries = cacheData.get(name);
      const keyFor = request => requestUrl(request).href;
      return {
        async addAll(requests) {
          for (const request of requests) {
            const response = await fetchNetwork(request);
            if (!response.ok) throw new Error(`Failed to cache ${keyFor(request)}`);
            entries.set(keyFor(request), response.clone());
          }
        },
        async match(request) {
          return entries.get(keyFor(request));
        },
        async put(request, response) {
          entries.set(keyFor(request), response.clone());
        }
      };
    },
    async keys() {
      return [...cacheData.keys()];
    },
    async delete(name) {
      deletedCaches.push(name);
      return cacheData.delete(name);
    }
  };

  const self = {
    location: { origin },
    clients: {
      async claim() {
        clientsClaimed = true;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      skippedWaiting = true;
    }
  };

  vm.runInNewContext(workerSource, {
    self,
    caches,
    URL,
    Request: MockRequest,
    fetch: fetchNetwork,
    Response: class MockResponse {
      constructor(body, options = {}) {
        return createResponse(body, options.status ?? 200);
      }
    }
  }, { filename: workerPath });

  return {
    listeners,
    cacheData,
    networkRequests,
    deletedCaches,
    get skippedWaiting() { return skippedWaiting; },
    get clientsClaimed() { return clientsClaimed; }
  };
}

function lifecycleEvent() {
  return {
    waitUntil(promise) {
      this.promise = promise;
    }
  };
}

test('التثبيت يحمّل app.js من الشبكة إلى كاش v2 ويحذف كاش v1 عند التفعيل', async () => {
  const worker = createServiceWorker({
    oldCaches: ['usf-sharia-shell-v1'],
    currentAppJs: 'fresh app.js containing the fixed Firebase key'
  });
  const install = lifecycleEvent();
  worker.listeners.get('install')(install);
  await install.promise;

  assert.ok(worker.cacheData.has('usf-sharia-shell-v2'));
  const appRequest = worker.networkRequests.find(request => request.path === '/app.js');
  assert.deepEqual(appRequest, { path: '/app.js', cache: 'reload' });
  assert.equal(worker.skippedWaiting, true);

  const activate = lifecycleEvent();
  worker.listeners.get('activate')(activate);
  await activate.promise;

  assert.deepEqual(worker.deletedCaches, ['usf-sharia-shell-v1']);
  assert.deepEqual([...worker.cacheData.keys()], ['usf-sharia-shell-v2']);
  assert.equal(worker.clientsClaimed, true);

  let responsePromise;
  worker.listeners.get('fetch')({
    request: { method: 'GET', mode: 'cors', url: `${origin}/app.js` },
    respondWith(promise) {
      responsePromise = promise;
    }
  });
  const response = await responsePromise;
  assert.equal(await response.text(), 'fresh app.js containing the fixed Firebase key');
});
