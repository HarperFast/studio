import type { StudioExtensionManifest } from '@/features/instance/extensions/manifest';

/**
 * PROTOTYPE ONLY: three components as they would declare themselves in their `config.yaml`, covering
 * each placement, each access style and both content kinds.
 */

const redirects: StudioExtensionManifest = {
	component: 'harper-redirects',
	pages: [{
		id: 'redirects',
		name: 'Redirects',
		icon: 'signpost',
		placement: 'tab',
		description: 'HTTP redirects served by every node before your application runs.',
		// Visible to anyone who can read the rules; add/edit/delete appear only for roles that can write.
		access: { tables: [{ database: 'redirects', table: 'Rule', actions: ['read'] }] },
		content: {
			kind: 'sections',
			sections: [
				{
					type: 'stats',
					items: [
						{ label: 'Rules', icon: 'list', value: { kind: 'count', database: 'redirects', table: 'Rule' } },
						{
							label: 'Active',
							icon: 'circle-check',
							value: { kind: 'count', database: 'redirects', table: 'Rule', where: { enabled: true } },
						},
						{ label: 'Median lookup', icon: 'timer', value: { kind: 'static', value: '0.02 ms' } },
					],
				},
				{
					type: 'table',
					title: 'Rules',
					description: 'Matched against the request path, exact first, then the longest wildcard prefix.',
					database: 'redirects',
					table: 'Rule',
					itemName: 'redirect',
					columns: [
						{ attribute: 'source', label: 'From', format: 'code' },
						{ attribute: 'target', label: 'To', format: 'code' },
						{ attribute: 'statusCode', label: 'Status', format: 'badge' },
						{ attribute: 'enabled', label: 'Enabled', format: 'boolean' },
						{ attribute: 'hits', label: 'Hits (7d)', format: 'number' },
					],
					fields: [
						{ attribute: 'source', label: 'From path', input: 'text', required: true, placeholder: '/old-path/*' },
						{
							attribute: 'target',
							label: 'To URL',
							input: 'url',
							required: true,
							placeholder: 'https://example.com/new-path',
						},
						{
							attribute: 'statusCode',
							label: 'Status code',
							input: 'select',
							defaultValue: 301,
							options: [
								{ value: 301, label: '301 Moved Permanently' },
								{ value: 302, label: '302 Found' },
								{ value: 307, label: '307 Temporary Redirect' },
								{ value: 308, label: '308 Permanent Redirect' },
							],
						},
						{ attribute: 'enabled', label: 'Enabled', input: 'switch', defaultValue: true },
						{ attribute: 'note', label: 'Note', input: 'textarea', placeholder: 'Why this redirect exists' },
					],
				},
			],
		},
	}],
};

const prerender: StudioExtensionManifest = {
	component: 'harper-prerender',
	pages: [{
		id: 'prerendering',
		name: 'Pre-rendering',
		icon: 'layers',
		placement: 'config',
		description: 'Serve crawlers fully rendered HTML, refreshed on a schedule.',
		// Settings and cache purges are cluster-wide, so the component asks for super users only.
		access: { role: 'super_user', endpoints: ['/Prerender/'] },
		content: {
			kind: 'sections',
			sections: [
				{
					type: 'form',
					title: 'Settings',
					database: 'prerender',
					table: 'Settings',
					recordId: 'default',
					fields: [
						{ attribute: 'enabled', label: 'Pre-render for crawlers', input: 'switch' },
						{
							attribute: 'origin',
							label: 'Origin',
							input: 'url',
							required: true,
							description: 'Where pages are fetched from to be rendered.',
						},
						{
							attribute: 'refreshMinutes',
							label: 'Refresh every (minutes)',
							input: 'number',
							required: true,
						},
						{
							attribute: 'userAgents',
							label: 'Crawler user agents',
							input: 'text',
							description: 'A regular expression matched against the User-Agent header.',
						},
					],
				},
				{
					type: 'actions',
					title: 'Cache',
					actions: [
						{
							label: 'Re-render all pages',
							icon: 'refresh-cw',
							request: { rest: { method: 'POST', path: '/Prerender/refresh' } },
							successMessage: 'Queued every page for rendering',
						},
						{
							label: 'Purge rendered pages',
							icon: 'trash-2',
							variant: 'destructive',
							confirm: 'Crawlers get un-rendered pages until each one is rendered again.',
							request: { rest: { method: 'POST', path: '/Prerender/purge' } },
							successMessage: 'Purged the rendered pages',
						},
					],
				},
				{
					type: 'table',
					title: 'Rendered pages',
					database: 'prerender',
					table: 'Page',
					columns: [
						{ attribute: 'path', label: 'Path', format: 'code' },
						{ attribute: 'status', label: 'Status', format: 'badge' },
						{ attribute: 'renderedAt', label: 'Rendered', format: 'datetime' },
						{ attribute: 'sizeKb', label: 'Size (KB)', format: 'number' },
					],
				},
			],
		},
	}],
};

const cacheInsights: StudioExtensionManifest = {
	component: 'cache-insights',
	pages: [{
		id: 'insights',
		name: 'Cache Insights',
		icon: 'chart-line',
		placement: 'tab',
		description: 'A page the component draws itself, framed and sandboxed by Studio.',
		access: {
			tables: [{ database: 'cache', table: 'Stat', actions: ['read'] }],
			endpoints: ['/CacheFlush/'],
		},
		content: { kind: 'frame', minHeight: 520, srcdoc: cacheInsightsSrcdoc() },
	}],
};

export const DEMO_EXTENSIONS: StudioExtensionManifest[] = [redirects, prerender, cacheInsights];

export const DEMO_COMPONENT_LABELS: Record<string, string> = {
	'harper-redirects': 'Redirects (tab · Studio-drawn · readers see it, writers edit)',
	'harper-prerender': 'Pre-rendering (Config · Studio-drawn · super users only)',
	'cache-insights': 'Cache Insights (tab · component-drawn iframe · readers)',
};

/**
 * The framed page, standing in for HTML the component would serve. It only knows what the
 * `studio:init` message tells it, and reaches data only through `studio:request`.
 */
function cacheInsightsSrcdoc(): string {
	return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 16px; font: 14px/1.5 system-ui, sans-serif; background: var(--card); color: var(--foreground); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .tile { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
  .tile b { display: block; font-size: 22px; }
  .muted { color: var(--muted-foreground); font-size: 12px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; align-items: center; }
  button { font: inherit; padding: 6px 12px; border-radius: var(--radius); border: 1px solid var(--border); background: transparent; color: var(--foreground); cursor: pointer; }
  button.primary { background: var(--primary); color: var(--primary-foreground); border-color: transparent; }
  pre { background: var(--muted); padding: 8px; border-radius: var(--radius); white-space: pre-wrap; font-size: 12px; }
  svg { width: 100%; height: 220px; }
</style></head>
<body>
  <div class="grid">
    <div class="tile"><span class="muted">Hit ratio (24h)</span><b id="ratio">…</b></div>
    <div class="tile"><span class="muted">Hits</span><b id="hits">…</b></div>
    <div class="tile"><span class="muted">Misses</span><b id="misses">…</b></div>
    <div class="tile"><span class="muted">Your access</span><b id="who" style="font-size:16px">…</b></div>
  </div>
  <div class="tile">
    <span class="muted">Hit ratio by hour</span>
    <svg id="chart" viewBox="0 0 480 200" preserveAspectRatio="none"></svg>
  </div>
  <div class="row">
    <button class="primary" id="flush">Flush stale entries</button>
    <button id="undeclared">Try an undeclared request (drop_table)</button>
    <span class="muted" id="status"></span>
  </div>
  <pre id="log" hidden></pre>
<script>
  let seq = 0;
  const pending = new Map();
  function request(req) {
    const id = ++seq;
    parent.postMessage({ type: 'studio:request', id, request: req }, '*');
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  function toast(message, variant) { parent.postMessage({ type: 'studio:toast', message, variant }, '*'); }
  function resize() { parent.postMessage({ type: 'studio:resize', height: document.documentElement.scrollHeight }, '*'); }

  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'studio:init') {
      for (const [name, value] of Object.entries(msg.theme.tokens)) document.documentElement.style.setProperty(name, value);
      const stat = msg.access['cache.Stat'] || {};
      document.getElementById('who').textContent = msg.user.superUser ? 'Super user' : Object.keys(stat).filter((k) => stat[k]).join(', ') || 'none';
      load();
    } else if (msg.type === 'studio:theme') {
      for (const [name, value] of Object.entries(msg.tokens)) document.documentElement.style.setProperty(name, value);
    } else if (msg.type === 'studio:response') {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      msg.ok ? entry.resolve(msg.data) : entry.reject(new Error(msg.error));
    }
  });

  async function load() {
    const rows = await request({ operation: 'search_by_value', database: 'cache', table: 'Stat', search_attribute: 'hour', search_value: '*', get_attributes: ['*'] });
    rows.sort((a, b) => a.hour - b.hour);
    const hits = rows.reduce((n, r) => n + r.hits, 0), misses = rows.reduce((n, r) => n + r.misses, 0);
    document.getElementById('hits').textContent = hits.toLocaleString();
    document.getElementById('misses').textContent = misses.toLocaleString();
    document.getElementById('ratio').textContent = (100 * hits / (hits + misses)).toFixed(1) + '%';
    const w = 480 / rows.length;
    document.getElementById('chart').innerHTML = rows.map((r, i) => {
      const ratio = r.hits / (r.hits + r.misses), h = 180 * ratio;
      return '<rect x="' + (i * w + 2) + '" y="' + (190 - h) + '" width="' + (w - 4) + '" height="' + h + '" rx="3" fill="var(--primary)" opacity="' + (0.45 + ratio / 2) + '"><title>' + r.hour + ':00 — ' + (100 * ratio).toFixed(1) + '%</title></rect>';
    }).join('');
    resize();
  }

  document.getElementById('flush').onclick = async () => {
    try {
      const result = await request({ rest: { method: 'POST', path: '/CacheFlush/' } });
      toast('Flushed ' + result.flushed + ' stale entries', 'success');
    } catch (error) { toast(error.message, 'error'); }
  };
  document.getElementById('undeclared').onclick = async () => {
    const log = document.getElementById('log');
    log.hidden = false;
    try {
      await request({ operation: 'drop_table', database: 'cache', table: 'Stat' });
      log.textContent = 'Studio sent it (it should not have).';
    } catch (error) { log.textContent = 'Studio refused: ' + error.message; }
    resize();
  };
</script>
</body></html>`;
}
