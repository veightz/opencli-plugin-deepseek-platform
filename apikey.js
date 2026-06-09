import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'apikey',
  description: 'List DeepSeek API keys (auto from browser session)',
  access: 'read',
  example: 'opencli deepseek-platform apikey -f table',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  columns: ['Name', 'Key', 'CreatedAt', 'LastUsed'],

  func: async (page, kwargs) => {
    await page.goto('https://platform.deepseek.com/api_keys');
    await page.wait({ selector: 'main', timeout: 15 });
    await new Promise((r) => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      const raw = localStorage.getItem('userToken');
      if (!raw) throw new Error('Not logged in.');
      const token = JSON.parse(raw).value;

      return fetch('/api/v0/users/get_api_keys', {
        headers: {
          Authorization: `Bearer ${token}`,
          accept: '*/*',
          referer: 'https://platform.deepseek.com/api_keys',
          'x-app-version': '1.0.0',
        },
      })
        .then(r => r.json())
        .then(data => {
          const keys = data.data?.biz_data?.api_keys || data.data?.api_keys || data.api_keys || [];
          return keys.map(k => ({
            Name: k.name || '',
            Key: k.sensitive_id
              ? k.sensitive_id.slice(0, 10) + '****' + k.sensitive_id.slice(-4)
              : k.redacted_key || '',
            CreatedAt: k.created_at
              ? new Date(k.created_at * 1000).toISOString().slice(0, 10)
              : '',
            LastUsed: k.last_use
              ? new Date(k.last_use * 1000).toISOString().slice(0, 10)
              : '-',
          }));
        });
    });

    return result;
  },
});
