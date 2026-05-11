import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.MEGAPHONE_API_TOKEN;
  const networkId = process.env.MEGAPHONE_NETWORK_ID;
  
  if (!token || !networkId) {
    return NextResponse.json({ error: 'Missing credentials' });
  }

  const results: Record<string, any> = {};
  
  // Get podcasts first
  const podRes = await fetch(
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts`,
    { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
  );
  const podcasts = await podRes.json();
  results.podcasts = podcasts.map((p: any) => ({ id: p.id, title: p.title }));
  
  const pod = podcasts.find((p: any) =>
    p.title?.toLowerCase().includes('commune') && !p.title?.toLowerCase().includes('courses')
  ) || podcasts[0];
  
  results.selectedPodcast = { id: pod?.id, title: pod?.title };
  
  if (!pod) return NextResponse.json(results);
  
  const podId = pod.id;
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 1);
  const startStr = start.toISOString().split('T')[0];
  const endStr = now.toISOString().split('T')[0];
  
  // Get one episode to test per-episode analytics
  const epRes = await fetch(
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/episodes?per=3`,
    { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
  );
  const eps = await epRes.json();
  const epList = Array.isArray(eps) ? eps : (eps.episodes || []);
  const firstEpId = epList[0]?.id;
  
  results.firstEpisode = { id: firstEpId, title: epList[0]?.title };
  results.episodeFields = epList[0] ? Object.keys(epList[0]) : [];
  
  // Test various analytics endpoints
  const endpoints = [
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/episodes/analytics?start=${startStr}&end=${endStr}&per=3`,
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/downloads?start=${startStr}&end=${endStr}`,
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/analytics?start=${startStr}&end=${endStr}`,
    `https://cms.megaphone.fm/api/networks/${networkId}/episodes/${firstEpId}/downloads?start=${startStr}&end=${endStr}`,
    `https://cms.megaphone.fm/api/networks/${networkId}/episodes/${firstEpId}/analytics`,
    `https://cms.megaphone.fm/api/networks/${networkId}/downloads?start=${startStr}&end=${endStr}`,
    `https://cms.megaphone.fm/api/networks/${networkId}/analytics?start=${startStr}&end=${endStr}`,
  ];
  
  const endpointResults: any[] = [];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store'
      });
      let body: any = null;
      try { body = await r.json(); } catch(_) { body = await r.text().catch(() => 'unreadable'); }
      endpointResults.push({
        status: r.status,
        url: url.replace(networkId, 'NETWORK_ID').replace(podId, 'POD_ID').replace(firstEpId || 'EP', 'EP_ID'),
        bodyPreview: typeof body === 'string' ? body.substring(0, 200) : JSON.stringify(body).substring(0, 200),
        bodyKeys: Array.isArray(body) ? ['array:' + body.length, ...(body[0] ? Object.keys(body[0]) : [])] : (typeof body === 'object' && body ? Object.keys(body) : ['string']),
      });
    } catch(e: any) {
      endpointResults.push({ error: e.message, url });
    }
  }
  
  results.endpointTests = endpointResults;
  
  return NextResponse.json(results);
}
