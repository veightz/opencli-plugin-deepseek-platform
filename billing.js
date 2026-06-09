import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'billing',
  description: 'Query DeepSeek account balance (requires DEEPSEEK_API_KEY)',
  access: 'read',
  example: 'opencli deepseek-platform billing -f yaml',
  domain: 'api.deepseek.com',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'api-key', help: 'DeepSeek API key (or set DEEPSEEK_API_KEY env var)' },
  ],
  columns: ['Currency', 'TotalBalance', 'GrantedBalance', 'ToppedUpBalance', 'Available'],

  func: async (kwargs) => {
    const apiKey = kwargs['api-key'] || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('API key required: pass --api-key or set DEEPSEEK_API_KEY env var');
    }

    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }

    const data = await res.json();

    return (data.balance_infos || []).map((info) => ({
      Currency: info.currency || 'CNY',
      TotalBalance: info.total_balance || '0',
      GrantedBalance: info.granted_balance || '0',
      ToppedUpBalance: info.topped_up_balance || '0',
      Available: data.is_available !== false ? 'Yes' : 'No',
    }));
  },
});
