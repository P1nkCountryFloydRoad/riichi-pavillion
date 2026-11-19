/*
 * 牌谱存储：每场对局完整的 mjai 事件流（包含四家配牌和每一次摸打），按战绩记录的 id 保存。
 * 牌谱体积比战绩大得多（半庄约 50–80 KB），所以存在浏览器的 IndexedDB 里，而不是 localStorage；
 * IndexedDB 不可用时（Node 测试、隐私模式）退回内存。所有接口都返回 Promise。
 * 以后做桌面版时可以用 MJ.Paifu.use({ get, put, del, clear, keys }) 换成文件存储。
 */
(function (root) {
  'use strict';
  const MJ = (root.MJ = root.MJ || {});
  const DB = 'queting';
  const STORE = 'paifu';

  function memoryBackend() {
    const m = new Map();
    return {
      get: async (k) => (m.has(k) ? m.get(k) : null),
      put: async (k, v) => void m.set(k, v),
      del: async (k) => void m.delete(k),
      clear: async () => m.clear(),
      keys: async () => Array.from(m.keys()),
    };
  }

  function idbBackend() {
    if (typeof indexedDB === 'undefined' || typeof document === 'undefined') return null;
    let dbp = null;
    const open = () => {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          const req = indexedDB.open(DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbp;
    };
    const run = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
    return {
      get: (k) => run('readonly', (s) => s.get(k)).then((v) => (v === undefined ? null : v)),
      put: (k, v) => run('readwrite', (s) => s.put(v, k)).then(() => undefined),
      del: (k) => run('readwrite', (s) => s.delete(k)).then(() => undefined),
      clear: () => run('readwrite', (s) => s.clear()).then(() => undefined),
      keys: () => run('readonly', (s) => s.getAllKeys()).then((v) => v || []),
    };
  }

  let backend = idbBackend() || memoryBackend();
  const mem = memoryBackend();
  // IndexedDB 出错时（例如被浏览器禁用）退回内存，不影响对局
  const safe = (name) => (...args) => backend[name](...args).catch(() => mem[name](...args));

  MJ.Paifu = {
    get: safe('get'),
    put: safe('put'),
    del: safe('del'),
    clear: safe('clear'),
    keys: safe('keys'),
    use(b) { backend = b; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
