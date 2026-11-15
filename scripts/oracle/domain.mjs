// Read-only discovery. Never print Cloudflare tokens or complete tunnel configs.
const account = '4f022b9e5bca1c40f58a59f0cb1f1e5e';
const project = 'danmarkplejecenters-migration';
const domain = 'plejefinder.online';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Cloudflare credential missing');
async function api(path) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`Cloudflare read-only preflight failed: HTTP ${response.status}; codes=${(body.errors || []).map(e => e.code).join(',')}`);
  }
  return body.result;
}
const checks = await Promise.allSettled([
  api(`/accounts/${account}/cfd_tunnel?is_deleted=false`),
  api(`/zones?name=${domain}`),
  api(`/accounts/${account}/pages/projects/${project}`),
]);
let blocked = false;
for (let i = 0; i < checks.length; i++) {
  const result = checks[i];
  if (result.status === 'rejected') {
    blocked = true;
    console.log(['Tunnel permission', 'DNS permission', 'Pages permission'][i] + ': ' + result.reason.message);
    continue;
  }
  const data = result.value;
  if (i === 0) {
    console.log('Visible tunnel names:', JSON.stringify(data.map(t => ({id:t.id,name:t.name}))));
    let matched = false;
    for (const tunnel of data) {
      try {
        const config = await api(`/accounts/${account}/cfd_tunnel/${tunnel.id}/configurations`);
        const routes = config.config?.ingress || [];
        if (routes.some(r => r.hostname === 'oracle.plejefinder.online')) {
          matched = true;
          console.log('Oracle tunnel:', JSON.stringify({id:tunnel.id,name:tunnel.name,status:tunnel.status,
            routes:routes.map(r => ({hostname:r.hostname,service:r.service}))}));
        }
      } catch (error) {
        console.log('Tunnel config unavailable:', error.message);
      }
    }
    if (!matched) console.log('No visible tunnel configuration matches the tested Oracle hostname.');
  } else if (i === 1) {
    if (data.length !== 1) throw new Error('Expected exactly one zone');
    let records;
    try { records = await api(`/zones/${data[0].id}/dns_records?name=${domain}`); }
    catch (error) { blocked = true; console.log('DNS records permission: ' + error.message); continue; }
    console.log('Apex DNS:', JSON.stringify({ zone: data[0].id, records: records.map(r => ({id:r.id,type:r.type,name:r.name,content:r.content,proxied:r.proxied})) }));
  } else {
    console.log('Pages domain binding:', JSON.stringify({ name:data.name, domains:data.domains, productionBranch:data.production_branch }));
  }
}
if (blocked) console.log('Manual dashboard changes are needed for permissions not available to this token.');
