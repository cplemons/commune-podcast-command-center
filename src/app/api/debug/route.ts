import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.MEGAPHONE_API_TOKEN;
  const networkId = process.env.MEGAPHONE_NETWORK_ID;
  
  if (!token || !networkId) {
    return NextResponse.json({ error: 'Missing credentials' });
  }

  const results: Record<string, any> = {};
  
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
  
  // Get top 5 episodes with all fields to see preCount/postCount values
  const epRes = await fetch(
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/episodes?per=5`,
    { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
  );
  const eps = await epRes.json();
  const epList = Array.isArray(eps) ? eps : (eps.episodes || []);
  
  // Show episode data including preCount/postCount
  results.episodeSample = epList.map((ep: any) => ({
    id: ep.id?.substring(0, 20),
    title: ep.title?.substring(0, 60),
    pubdate: ep.pubdate?.substring(0, 10),
    duration: ep.duration,
    preCount: ep.preCount,
    postCount: ep.postCount,
    size: ep.size,
    spotifyStatus: ep.spotifyStatus,
    status: ep.status,
  }));
  
  results.episodeFields = epList[0] ? Object.keys(epList[0]) : [];
  
  // Test analytics-style endpoints  
  const now = new Date();
  const start = new Date(now); start.setFullYear(start.getFullYear() - 1);
  const startStr = start.toISOString().split('T')[0];
  const endStr = now.toISOString().split('T')[0];
  const firstEpId = epList[0]?.id;
  
  const endpoints: string[] = [
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/episodes/analytics?start=${startStr}&end=${endStr}&per=3`,
    `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podId}/downloads?start=${startStr}&end=${endStr}`,
    `https://cms.megaphone.fm/api/networks/${networkId}/episodes/${firstEpId}/downloads?start=${startStr}&end=${endStr}`,
    `https://cms.megaphone.fm/api/networks/${networkId}/episodes/${firstEpId}/stats`,
    `https://cms.megaphone.fm/api/v2/networks/${networkId}/podcasts/${podId}/episodes/analytics?start=${startStr}&end=${endStr}`,
  ];
  
  const endpointResults: any[] = [];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store'
      });
      let body: any = null;
      try { body = await r.json(); } catch(_) {}
      endpointResults.push({
        status: r.status,
        path: url.split('/api/').pop()?.replace(networkId, 'NID').replace(podId, 'PID').replace(firstEpId || '', 'EID'),
        bodyPreview: body ? JSON.stringify(body).substring(0, 150) : 'empty',
        bodyKeys: Array.isArray(body) ? ['array:' + body.length, ...(body[0] ? Object.keys(body[0]).slice(0, 10) : [])] : (body && typeof body === 'object' ? Object.keys(body) : []),
      });
    } catch(e: any) {
      endpointResults.push({ error: e.message, path: url.split('/').slice(-3).join('/') });
    }
  }
  
  results.endpointTests = endpointResults;
  
  return NextResponse.json(results);
}
