import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'usage',
  description: 'Query DeepSeek monthly token usage by model (auto from browser session)',
  access: 'read',
  example: 'opencli deepseek-platform usage -f table',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'month', type: 'int', default: 0, help: 'Month (1-12, default: current)' },
    { name: 'year', type: 'int', default: 0, help: 'Year (default: current)' },
  ],
  columns: ['Model', 'Requests', 'CacheHit', 'CacheMiss', 'OutputTokens', 'CostCNY'],

  func: async (page, kwargs) => {
    await page.goto('https://platform.deepseek.com/usage');
    await page.wait({ selector: 'main', timeout: 15 });

    const now = new Date();
    const month = kwargs.month || (now.getMonth() + 1);
    const year = kwargs.year || now.getFullYear();

    const result = await page.evaluate(async ({ month, year }) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) {
        throw new Error('Not logged in. Please log into platform.deepseek.com first.');
      }
      const token = JSON.parse(raw).value;

      const headers = {
        Authorization: `Bearer ${token}`,
        Referer: 'https://platform.deepseek.com/usage',
        accept: '*/*',
      };

      const [amountRes, costRes] = await Promise.all([
        fetch(`/api/v0/usage/amount?month=${month}&year=${year}`, { headers }),
        fetch(`/api/v0/usage/cost?month=${month}&year=${year}`, { headers }),
      ]);

      if (!amountRes.ok) throw new Error(`Amount API error ${amountRes.status}`);
      if (!costRes.ok) throw new Error(`Cost API error ${costRes.status}`);

      const amountData = await amountRes.json();
      const costData = await costRes.json();

      if (amountData.code !== 0) {
        throw new Error(`Platform API error: ${amountData.msg || 'unknown'}`);
      }

      const amountBiz = amountData.data?.biz_data;
      const costBiz = costData.data?.biz_data;
      const totals = amountBiz?.total || [];

      const costMap = {};
      if (Array.isArray(costBiz)) {
        for (const entry of costBiz) {
          for (const m of entry.total || []) {
            costMap[m.model] = Object.fromEntries((m.usage || []).map((u) => [u.type, u.amount]));
          }
        }
      }

      return totals.map((m) => {
        const usageMap = Object.fromEntries((m.usage || []).map((u) => [u.type, u.amount]));
        const costEntry = costMap[m.model] || {};
        return {
          Model: m.model,
          Requests: usageMap['REQUEST'] || '0',
          CacheHit: usageMap['PROMPT_CACHE_HIT_TOKEN'] || '0',
          CacheMiss: usageMap['PROMPT_CACHE_MISS_TOKEN'] || '0',
          OutputTokens: usageMap['RESPONSE_TOKEN'] || '0',
          CostCNY: costEntry['RESPONSE_TOKEN']
            ? (parseFloat(costEntry['PROMPT_CACHE_HIT_TOKEN'] || 0) +
               parseFloat(costEntry['PROMPT_CACHE_MISS_TOKEN'] || 0) +
               parseFloat(costEntry['RESPONSE_TOKEN'] || 0)).toFixed(4)
            : '-',
        };
      });
    }, { month, year });

    return result;
  },
});
