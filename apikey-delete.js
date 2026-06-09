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

    // Verify login and get redacted key
    const prelim = await page.evaluate((name) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) return { error: 'not logged in' };
      let token;
      try { token = JSON.parse(raw).value; } catch { return { error: 'invalid token format' }; }

      // Check for stored created_at from previous apikey-create
      const meta = JSON.parse(localStorage.getItem('__apikey_meta') || '{}');
      const stored = meta[name] || null;

      const body = document.body?.innerText || '';
      const lines = body.split('\n').filter(l => l.includes('sk-'));
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 3 && parts[0].trim() === name) {
          return { ok: true, redacted_key: parts[1].trim(), token, stored };
        }
      }
      return { error: `key "${name}" not found on page` };
    }, keyName);

    if (prelim.error) {
      return [{ Name: keyName, Status: 'Error', Message: prelim.error }];
    }

    // Now scan timestamps with verification (or use stored timestamp)
    const result = await page.evaluate(async ({ redacted_key, token, stored }) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        referer: 'https://platform.deepseek.com/api_keys',
        'x-app-version': '1.0.0',
      };

      // If we have a stored timestamp from apikey-create, use it directly
      if (stored && stored.created_at) {
        const res = await fetch('/api/v0/users/edit_api_keys', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'delete', name: null, redacted_key, created_at: stored.created_at }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code === 0) {
            return { success: true, method: 'stored', created_at: stored.created_at };
          }
        }
      }

      // Scan recent timestamps
      const now = Math.floor(Date.now() / 1000);
      const start = now - 43200;

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
              return { success: true, created_at: ts };
            }
          }
        } catch {}
      }

      return { error: 'timestamp not found after scanning 12h range', range: [start, now] };
    }, { redacted_key: prelim.redacted_key, token: prelim.token, stored: prelim.stored });

    if (result.success) {
      return [{ Name: keyName, Status: 'Deleted', Message: `ok (ts=${result.created_at})` }];
    }

    return [{
      Name: keyName,
      Status: 'Limited',
      Message: 'Delete API requires exact created_at timestamp which is not visible on the page. '
        + 'For keys created with apikey-create, deletion works automatically. '
        + 'For other keys, delete manually at platform.deepseek.com/api_keys.',
    }];
  },
});
