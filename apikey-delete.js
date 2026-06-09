import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'apikey-delete',
  description: 'Delete a DeepSeek API key by name',
  access: 'write',
  example: 'opencli deepseek-platform apikey-delete --name my-key',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'name', help: 'Name of the API key to delete' },
  ],
  columns: ['Name', 'Status', 'Message'],

  func: async (page, kwargs) => {
    const keyName = kwargs.name;
    if (!keyName) throw new Error('--name is required');

    await page.goto('https://platform.deepseek.com/api_keys');
    await page.wait({ selector: 'main', timeout: 15 });
    await new Promise((r) => setTimeout(r, 2000));

    const result = await page.evaluate(async (name) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) return { error: 'not logged in' };
      const token = JSON.parse(raw).value;
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        referer: 'https://platform.deepseek.com/api_keys',
        'x-app-version': '1.0.0',
      };

      // Get redacted_key from page text
      const body = document.body?.innerText || '';
      const lines = body.split('\n').filter(l => l.includes('sk-'));
      let redacted_key = '';
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 3 && parts[0].trim() === name) {
          redacted_key = parts[1].trim();
          break;
        }
      }
      if (!redacted_key) return { error: 'key not found on page' };

      // Check for stored created_at from a previous apikey-create
      const meta = JSON.parse(localStorage.getItem('__apikey_meta') || '{}');
      const stored = meta[name];

      const tryDelete = async (created_at) => {
        const res = await fetch('/api/v0/users/edit_api_keys', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'delete', name: null, redacted_key, created_at }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.code === 0;
      };

      if (stored && stored.created_at) {
        const ok = await tryDelete(stored.created_at);
        if (ok) return { success: true, method: 'stored', created_at: stored.created_at };
      }

      // Try intercepting fetch by overriding it immediately and waiting for calls
      const origFetch = window.fetch.bind(window);
      let capturedList = null;

      window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const method = (args[1]?.method || 'GET').toUpperCase();
        const res = await origFetch(...args);
        // Capture GET endpoints that might contain api_keys
        if (method === 'GET' && (url.includes('api_key') || url.includes('apikey') || url.includes('key'))) {
          try {
            const data = await res.clone().json();
            capturedList = data;
          } catch {}
        }
        return res;
      };

      // Wait briefly for any async data fetches
      await new Promise(r => setTimeout(r, 1000));

      if (capturedList) {
        const list = capturedList.data?.biz_data?.api_keys || capturedList.data?.api_keys || capturedList.api_keys || [];
        const target = list.find(k => k.name === name);
        if (target && target.created_at) {
          const ok = await tryDelete(target.created_at);
          if (ok) return { success: true, method: 'intercepted', created_at: target.created_at };
        }
      }

      return { error: 'could not get created_at', hint: 'delete from web UI' };

      return { error: 'delete failed - key may need manual deletion', redacted_key };
    }, keyName);

    if (result.success) {
      return [{ Name: keyName, Status: 'Deleted', Message: `via ${result.method}` }];
    }

    return [{ Name: keyName, Status: 'Limited', Message: result.error }];
  },
});
