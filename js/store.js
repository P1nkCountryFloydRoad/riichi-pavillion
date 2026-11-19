/*
 * 统一的本地存储层：规则设置、战绩等都只通过 MJ.Store 读写 JSON。
 * 浏览器里默认用 localStorage；不可用（隐私模式、Node 测试）时退回内存。
 * 以后打包成桌面应用时，只要调用 MJ.Store.use({ getItem, setItem, removeItem })
 * 换成写文件的实现即可，其余代码不用改。
 */
(function (root) {
  'use strict';
  const MJ = (root.MJ = root.MJ || {});

  function memoryBackend() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => void m.set(k, String(v)),
      removeItem: (k) => void m.delete(k),
    };
  }

  function browserBackend() {
    try {
      if (typeof document === 'undefined' || !root.localStorage) return null;
      const t = '__mj_probe__';
      root.localStorage.setItem(t, '1');
      root.localStorage.removeItem(t);
      return root.localStorage;
    } catch (e) {
      return null;
    }
  }

  let backend = browserBackend() || memoryBackend();
  const fallback = memoryBackend();

  const Store = {
    /** 读取 JSON；不存在或损坏时返回 def */
    get(key, def) {
      try {
        const raw = backend.getItem(key);
        if (raw == null) {
          const m = fallback.getItem(key);
          return m == null ? def : JSON.parse(m);
        }
        return JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },
    /** 写入 JSON；存储满或不可用时暂存在内存里并返回 false */
    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        backend.setItem(key, raw);
        fallback.removeItem(key);
        return true;
      } catch (e) {
        fallback.setItem(key, raw);
        return false;
      }
    },
    remove(key) {
      try { backend.removeItem(key); } catch (e) { /* ignore */ }
      fallback.removeItem(key);
    },
    /** 换一个存储后端（例如桌面版的文件存储） */
    use(b) { backend = b; },
  };

  MJ.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
