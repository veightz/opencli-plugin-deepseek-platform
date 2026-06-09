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

      if (stored && stored.created_at) {
        const res = await fetch('/api/v0/users/edit_api_keys', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'delete', name: null, redacted_key, created_at: stored.created_at }),
        });
        if (res.ok) return { success: true, method: 'stored' };
      }

      // Try brute force: scan recent timestamps
      const now = Math.floor(Date.now() / 1000);
      const start = now - 86400;
      for (let ts = start; ts <= now; ts++) {
        try {
          const res = await fetch('/api/v0/users/edit_api_keys', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'delete', name: null, redacted_key, created_at: ts }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.code === 0) {
            const check = document.body?.innerText || '';
            if (!check.includes(redacted_key.slice(0, 10))) {
              return { success: true, method: `brute_ts=${ts}` };
            }
          }
        } catch {}
      }

      return { error: 'timestamp not found in last 24h', hint: 'Try deleting from platform.deepseek.com/api_keys' };
    }, keyName);

    if (result.success) {
      return [{ Name: keyName, Status: 'Deleted', Message: result.method }];
    }

    return [{ Name: keyName, Status: 'Failed', Message: result.error || JSON.stringify(result) }];
  },
});
