import { NextResponse } from 'next/server';

// — YouTube —————————————————————————————————————————————
async function fetchYouTube() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { status: { connected: false, error: 'YOUTUBE_API_KEY not configured' } };
  try {
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=jeffkrasno&key=${apiKey}`,
      { cache: 'no-store' }
    );
    if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
    const channelData = await channelRes.json();
    if (!channelData.items?.length) throw new Error('Channel @jeffkrasno not found');
    const channel = channelData.items[0];
    const channelId = channel.id;
    const stats = channel.statistics;
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&maxResults=50&order=viewCount&type=video&key=${apiKey}`,
      { cache: 'no-store' }
    );
    const videosData = await videosRes.json();
    let topVideos: any[] = [];
    if (videosData.items?.length) {
      const videoIds = videosData.items.map((v: any) => v.id.videoId).filter(Boolean).join(',');
      const detailsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`,
        { cache: 'no-store' }
      );
      const detailsData = await detailsRes.json();
      topVideos = (detailsData.items || []).map((v: any) => ({
        id: v.id,
        title: v.snippet.title,
        thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url,
        views: parseInt(v.statistics.viewCount || '0'),
        likes: parseInt(v.statistics.likeCount || '0'),
        comments: parseInt(v.statistics.commentCount || '0'),
        duration: v.contentDetails.duration,
        publishedAt: v.snippet.publishedAt,
        engagementRate: parseInt(v.statistics.viewCount || '1') > 0
          ? ((parseInt(v.statistics.likeCount || '0') + parseInt(v.statistics.commentCount || '0')) / parseInt(v.statistics.viewCount || '1')) * 100
          : 0,
      })).sort((a: any, b: any) => b.views - a.views);
    }
    const avgEngagement = topVideos.length > 0
      ? topVideos.reduce((s: number, v: any) => s + v.engagementRate, 0) / topVideos.length : 0;
    return {
      channelStats: {
        subscribers: parseInt(stats.subscriberCount || '0'),
        totalViews: parseInt(stats.viewCount || '0'),
        videoCount: parseInt(stats.videoCount || '0'),
        avgEngagement,
      },
      topVideos,
      status: { connected: true },
    };
  } catch (err: any) { return { status: { connected: false, error: err.message } }; }
}

// — Megaphone ——————————————————————————————————————————————
async function fetchPodcast(megaphoneApiKey?: string) {
  const NETWORK_ID = '92d07666-568b-11f0-905f-27d2b3e735f9';
  const PODCAST_ID = '83bda43e-5846-11f0-9c25-6747adca5027';
  const apiToken = megaphoneApiKey || process.env.MEGAPHONE_API_TOKEN;

  if (apiToken) {
    try {
      // Correct path: networks/{netId}/podcasts/{podId}/episodes
      const epsRes = await fetch(
        `https://cms.megaphone.fm/api/networks/${NETWORK_ID}/podcasts/${PODCAST_ID}/episodes?per=100`,
        { headers: { 'Authorization': `Token token=${apiToken}` }, cache: 'no-store' }
      );
      if (epsRes.ok) {
        const epsData = await epsRes.json();
        const apiEpisodes = Array.isArray(epsData) ? epsData : epsData?.episodes || [];
        if (apiEpisodes.length > 0) {
          const episodes = apiEpisodes.map((ep: any) => {
            const durationSecs = parseFloat(ep.duration || ep.lengthInSeconds || '0');
            const downloads = ep.downloads || ep.totalDownloads || ep.download_count || ep.preCount || 0;
            const streams = ep.streams || ep.totalStreams || ep.stream_count || ep.postCount || 0;
            return {
              id: ep.id || ep.uid,
              title: ep.title,
              publishedAt: ep.pubdate || ep.publishedAt || ep.pubDate || '',
              duration: Math.floor(durationSecs / 60),
              audioUrl: ep.enclosureUrl || ep.audioUrl || '',
              thumbnail: ep.imageUrl || ep.image || ep.thumbnailUrl || '',
              downloads,
              streams,
              delivered: ep.delivered || ep.totalDelivered || (downloads + streams),
              performanceScore: downloads + streams,
            };
          });
          const hasAnalytics = episodes.some((e: any) => e.downloads > 0 || e.streams > 0);
          const topEpisodes = hasAnalytics
            ? [...episodes].sort((a: any, b: any) => b.performanceScore - a.performanceScore)
            : episodes;
          return {
            podcastName: 'Commune with Jeff Krasno',
            topEpisodes, episodes: topEpisodes,
            analyticsAvailable: hasAnalytics,
            apiKeyConfigured: true,
            totalDownloads: hasAnalytics ? episodes.reduce((s: number, e: any) => s + e.downloads, 0) : null,
            totalStreams: hasAnalytics ? episodes.reduce((s: number, e: any) => s + e.streams, 0) : null,
            status: { connected: true },
          };
        }
      }
    } catch (apiErr: any) { console.error('Megaphone API error:', apiErr.message); }
  }

  // Fallback: RSS
  const RSS_URLS = ['https://feeds.megaphone.fm/SWDG4803951965'];
  let rssText = '';
  for (const rssUrl of RSS_URLS) {
    try {
      const r = await fetch(rssUrl, { cache: 'no-store' });
      if (r.ok) { const t = await r.text(); if (t.includes('Commune') && t.includes('<item>')) { rssText = t; break; } }
    } catch (_) {}
  }
  if (!rssText) {
    const msg = apiToken ? 'Megaphone API returned no episodes - enable Analytics add-on at cms.megaphone.fm' : 'Enter your Megaphone API key to load episodes';
    return { status: { connected: false, error: msg } };
  }
  const items = rssText.match(/<item>[\s\S]*?<\/item>/g) || [];
  const parseTag = (xml: string, tag: string) => { const m = xml.match(new RegExp('<' + tag + '(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/' + tag + '>|<' + tag + '(?:[^>]*)>([^<]*)<\/' + tag + '>')); return m ? (m[1] || m[2] || '').trim() : ''; };
  const parseAttr = (xml: string, tag: string, attr: string) => { const m = xml.match(new RegExp('<' + tag + '[^>]*' + attr + '="([^"]*)"')); return m ? m[1] : ''; };
  const guidPattern = new RegExp('/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/');
  const rssEpisodes = items.slice(0, 100).map((item: string) => {
    const enclosureUrl = parseAttr(item, 'enclosure', 'url');
    const guid = parseTag(item, 'guid') || enclosureUrl;
    const megaphoneId = (guid.match(guidPattern) || [])[1] || '';
    const durationStr = parseTag(item, 'itunes:duration');
    let durationMins = 0;
    if (durationStr.includes(':')) { const parts = durationStr.split(':').map(Number); durationMins = parts.length === 3 ? parts[0] * 60 + parts[1] : parts[0]; }
    else { durationMins = Math.floor(parseInt(durationStr || '0') / 60); }
    return { id: megaphoneId || enclosureUrl, title: parseTag(item, 'title'), publishedAt: parseTag(item, 'pubDate'), duration: durationMins, audioUrl: enclosureUrl, thumbnail: parseTag(item, 'itunes:image') || parseAttr(item, 'itunes:image', 'href'), downloads: 0, streams: 0, delivered: 0, performanceScore: 0 };
  });
  return { podcastName: 'Commune with Jeff Krasno', topEpisodes: rssEpisodes, episodes: rssEpisodes, analyticsAvailable: false, apiKeyConfigured: false, totalDownloads: null, totalStreams: null, status: { connected: true } };
}

// — Instagram ———————————————————————————————————————————————
async function fetchInstagram() {
  const apiKey = process.env.APIFY_API_TOKEN;
  if (!apiKey) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apiKey}&timeout=55&memory=256`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directUrls: ['https://www.instagram.com/jeffkrasno/'], resultsType: 'details', resultsLimit: 20, addParentData: true }), cache: 'no-store' }
    );
    if (!runRes.ok) throw new Error(`Instagram scraper error: ${runRes.status}`);
    const items = await runRes.json();
    if (!Array.isArray(items) || items.length === 0) throw new Error('No Instagram data returned');
    const profile = items[0];
    const rawPosts = profile.latestPosts || profile.posts || items.filter((i: any) => i.shortCode);
    const topPosts = rawPosts.filter((p: any) => p.shortCode || p.id).map((p: any) => ({
      id: p.id || p.shortCode,
      caption: (p.caption || p.text || '').substring(0, 100),
      thumbnail: p.displayUrl || p.thumbnailUrl || p.imageUrl || '',
      likes: p.likesCount || p.likes || 0,
      comments: p.commentsCount || p.comments || 0,
      views: p.videoViewCount || p.videoPlayCount || p.viewsCount || 0,
      publishedAt: p.timestamp || p.takenAtTimestamp,
      url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
    })).sort((a: any, b: any) => b.views - a.views || b.likes - a.likes);
    const totalViews = topPosts.reduce((s: number, p: any) => s + p.views, 0);
    const totalEng = topPosts.reduce((s: number, p: any) => s + p.likes + p.comments, 0);
    return { profileStats: { followers: profile.followersCount || 0, totalViews, avgEngagement: totalViews > 0 ? (totalEng / totalViews) * 100 : 0, postsCount: profile.postsCount || rawPosts.length || 0 }, topPosts, status: { connected: true } };
  } catch (err: any) { return { status: { connected: false, error: err.message } }; }
}

// — TikTok ————————————————————————————————————————————————
async function fetchTikTok() {
  const apiKey = process.env.APIFY_API_TOKEN;
  if (!apiKey) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${apiKey}&timeout=55&memory=256`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profiles: ['jeffkrasno'], resultsPerPage: 20, shouldDownloadVideos: false, shouldDownloadCovers: false }), cache: 'no-store' }
    );
    if (!runRes.ok) throw new Error(`TikTok scraper error: ${runRes.status}`);
    const items = await runRes.json();
    if (!Array.isArray(items) || items.length === 0) throw new Error('No TikTok data returned');
    const f = items[0];
    const topPosts = items.filter((p: any) => p.id || p.videoId).map((p: any) => ({
      id: p.id || p.videoId,
      caption: (p.text || p.desc || '').substring(0, 100),
      thumbnail: p.covers?.default || p.cover || p.thumbnail || p.videoMeta?.coverUrl || '',
      likes: p.diggCount || p.likeCount || 0,
      comments: p.commentCount || 0,
      views: p.playCount || p.viewCount || 0,
      shares: p.shareCount || 0,
      publishedAt: p.createTimeISO || (p.createTime ? new Date(p.createTime * 1000).toISOString() : ''),
      url: p.webVideoUrl || (p.id ? `https://www.tiktok.com/@jeffkrasno/video/${p.id}` : ''),
      ctr: p.playCount > 0 ? (p.diggCount || 0) / p.playCount * 100 : 0,
    })).sort((a: any, b: any) => b.views - a.views);
    const totalViews = topPosts.reduce((s: number, p: any) => s + p.views, 0);
    const totalLikes = topPosts.reduce((s: number, p: any) => s + p.likes, 0);
    const avgCtr = topPosts.length > 0 ? topPosts.reduce((s: number, p: any) => s + p.ctr, 0) / topPosts.length : 0;
    return { profileStats: { followers: f?.authorMeta?.fans || 0, following: f?.authorMeta?.following || 0, totalViews, avgEngagement: totalViews > 0 ? (totalLikes / totalViews) * 100 : 0, avgCtr }, topPosts, status: { connected: true } };
  } catch (err: any) { return { status: { connected: false, error: err.message } }; }
}

// — Facebook ——————————————————————————————————————————————
async function fetchFacebook() {
  const apiKey = process.env.APIFY_API_TOKEN;
  if (!apiKey) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${apiKey}&timeout=55&memory=512`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startUrls: [{ url: 'https://www.facebook.com/jeffpatrickkrasno' }], resultsLimit: 20, onlyPostsNewerThan: '30 days' }), cache: 'no-store' }
    );
    if (!runRes.ok) throw new Error(`Facebook scraper error: ${runRes.status}`);
    const items = await runRes.json();
    if (!Array.isArray(items) || items.length === 0) throw new Error('No Facebook data returned');
    const topPosts = items.map((p: any) => {
      let thumbnail = '';
      if (p.media?.length > 0) thumbnail = p.media[0]?.photo?.imageUrl || p.media[0]?.video?.thumbnailUrl || p.media[0]?.imageUrl || p.media[0]?.url || '';
      if (!thumbnail && p.attachments?.length > 0) thumbnail = p.attachments[0]?.media?.image?.src || p.attachments[0]?.imageUrl || p.attachments[0]?.url || '';
      if (!thumbnail) thumbnail = p.imageUrl || p.thumbnailUrl || p.previewImage?.url || '';
      if (thumbnail && (thumbnail.includes('facebook.com/reel') || thumbnail.includes('facebook.com/jeff') || thumbnail.includes('facebook.com/videos') || thumbnail.includes('facebook.com/photo'))) thumbnail = '';
      const likes = p.likes || p.reactions?.like || 0;
      const comments = p.comments || p.commentsCount || 0;
      const shares = p.shares || p.sharesCount || 0;
      return { id: p.postId || p.id, url: p.url || p.postUrl || '', thumbnail, caption: (p.text || p.message || p.caption || '').substring(0, 150), likes, comments, shares, views: p.videoViewCount || p.views || p.reach || 0, engagement: likes + comments + shares, publishedAt: p.date || p.time || p.publishedAt || '' };
    }).sort((a: any, b: any) => b.engagement - a.engagement);
    const totalEng = topPosts.reduce((s: number, p: any) => s + p.engagement, 0);
    return { profileStats: { followers: 0, pageLikes: 0, totalReach: topPosts.reduce((s: number, p: any) => s + (p.views || p.engagement), 0), avgEngagement: topPosts.length > 0 ? totalEng / topPosts.length : 0 }, topPosts, status: { connected: true, note: 'Page follower count requires Facebook Graph API token.' } };
  } catch (err: any) { return { status: { connected: false, error: err.message } }; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const megaphoneKey = searchParams.get('megaphoneKey') || undefined;
  const [youtube, podcast, instagram, tiktok, facebook] = await Promise.allSettled([fetchYouTube(), fetchPodcast(megaphoneKey), fetchInstagram(), fetchTikTok(), fetchFacebook()]);
  return NextResponse.json({
    youtube: youtube.status === 'fulfilled' ? youtube.value : { status: { connected: false, error: String((youtube as any).reason) } },
    podcast: podcast.status === 'fulfilled' ? podcast.value : { status: { connected: false, error: String((podcast as any).reason) } },
    instagram: instagram.status === 'fulfilled' ? instagram.value : { status: { connected: false, error: String((instagram as any).reason) } },
    tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { status: { connected: false, error: String((tiktok as any).reason) } },
    facebook: facebook.status === 'fulfilled' ? facebook.value : { status: { connected: false, error: String((facebook as any).reason) } },
    generatedAt: new Date().toISOString(),
  });
  }
