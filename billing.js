import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'billing',
  description: 'Query DeepSeek account balance (auto from browser session)',
  access: 'read',
  example: 'opencli deepseek-platform billing -f yaml',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  columns: ['Currency', 'TotalBalance', 'GrantedBalance', 'ToppedUpBalance', 'Available'],

  func: async (page, kwargs) => {
    // Patch fetch before navigation to capture API responses
    await page.evaluate(() => {
      const orig = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const res = await orig(...args);
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (url.includes('/api/')) {
          res.clone().json().then((data) => {
            window.__capturedApi = window.__capturedApi || [];
            window.__capturedApi.push(data);
          }).catch(() => {});
        }
        return res;
      };
    });

    await page.goto('https://platform.deepseek.com');
    await page.wait({ selector: 'main', timeout: 15 });
    await new Promise((r) => setTimeout(r, 2000));

    const captured = await page.evaluate(() => window.__capturedApi || []);

    for (const data of captured) {
      const biz = data.data || data;
      const infos = biz.balance_infos || data.balance_infos || [];
      if (infos.length > 0) {
        return infos.map((info) => ({
          Currency: info.currency || 'CNY',
          TotalBalance: info.total_balance || '0',
          GrantedBalance: info.granted_balance || '0',
          ToppedUpBalance: info.topped_up_balance || '0',
          Available: data.is_available !== false ? 'Yes' : 'No',
        }));
      }
    }

    throw new Error('Could not find balance data. Please verify you are logged into platform.deepseek.com.');
  },
});
