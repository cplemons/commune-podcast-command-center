import { NextResponse } from 'next/server';

// YouTube Data API v3
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
    const videoIds = (videosData.items || []).map((v: any) => v.id.videoId).filter(Boolean);

    let videos: any[] = [];
    if (videoIds.length > 0) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`,
        { cache: 'no-store' }
      );
      const statsData = await statsRes.json();
      videos = (statsData.items || []).map((v: any) => {
        const views = parseInt(v.statistics.viewCount || '0');
        const likes = parseInt(v.statistics.likeCount || '0');
        const comments = parseInt(v.statistics.commentCount || '0');
        const engagementRate = views > 0 ? ((likes + comments) / views * 100) : 0;
        return {
          id: v.id,
          title: v.snippet.title,
          thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
          views, likes, comments,
          duration: v.contentDetails?.duration || '',
          publishedAt: v.snippet.publishedAt,
          engagementRate,
        };
      }).sort((a: any, b: any) => b.views - a.views);
    }

    const totalViews = parseInt(stats.viewCount || '0');
    const subscribers = parseInt(stats.subscriberCount || '0');
    const videoCount = parseInt(stats.videoCount || '0');
    const avgEngagement = videos.length > 0
      ? videos.slice(0, 20).reduce((s: number, v: any) => s + v.engagementRate, 0) / Math.min(videos.length, 20)
      : 0;

    return {
      channelStats: { subscribers, totalViews, videoCount, avgEngagement },
      videos,
      channelName: channel.snippet?.title || '@jeffkrasno',
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Megaphone Podcast API - try multiple analytics endpoint patterns
async function fetchPodcast() {
  const token = process.env.MEGAPHONE_API_TOKEN;
  const networkId = process.env.MEGAPHONE_NETWORK_ID;
  if (!token || !networkId) return { status: { connected: false, error: 'Megaphone credentials not configured' } };

  try {
    const podcastRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts`,
      { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
    );
    if (!podcastRes.ok) throw new Error(`Megaphone API error: ${podcastRes.status}`);
    const podcasts = await podcastRes.json();
    if (!podcasts.length) throw new Error('No podcasts found');

    const communePodcast = podcasts.find((p: any) =>
      p.title && p.title.toLowerCase().includes('commune') && !p.title.toLowerCase().includes('courses')
    ) || podcasts.find((p: any) => p.title?.toLowerCase().includes('podcast')) || podcasts[0];

    // Get all episodes
    const episodesRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes?per=100`,
      { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
    );
    if (!episodesRes.ok) throw new Error(`Megaphone episodes error: ${episodesRes.status}`);
    const episodesData = await episodesRes.json();
    const episodeList = Array.isArray(episodesData) ? episodesData : (episodesData.episodes || []);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - 2);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = now.toISOString().split('T')[0];

    // Try Megaphone's podcast-level downloads endpoint
    let episodeAnalytics: Record<string, any> = {};

    // Pattern 1: Network-level episode downloads (Megaphone v2 API)
    const analyticsPatterns = [
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes/downloads?start=${startStr}&end=${endStr}`,
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes/analytics?start=${startStr}&end=${endStr}&per=100`,
      `https://cms.megaphone.fm/api/networks/${networkId}/episodes/downloads?podcast_id=${communePodcast.id}&start=${startStr}&end=${endStr}`,
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/downloads?start=${startStr}&end=${endStr}`,
    ];

    for (const url of analyticsPatterns) {
      try {
        const r = await fetch(url, {
          headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store'
        });
        if (r.ok) {
          const data = await r.json();
          const items = Array.isArray(data) ? data
            : (data.episodes || data.items || data.data || data.results || data.downloads || []);
          if (items.length > 0) {
            items.forEach((item: any) => {
              const id = item.id || item.episodeId || item.episode_id;
              if (id) {
                const dl = parseInt(String(item.totalDownloads || item.downloads || item.total_downloads || item.downloadCount || item.count || 0));
                const st = parseInt(String(item.totalStreams || item.streams || item.total_streams || item.streamCount || 0));
                const dlv = parseInt(String(item.totalDelivered || item.delivered || item.total_delivered || (dl + st) || 0));
                const ct = parseFloat(String(item.avgConsumptionTime || item.average_consumption_time || item.consumptionTime || item.avg_consumption || 0));
                episodeAnalytics[id] = { totalDownloads: dl, totalStreams: st, totalDelivered: dlv, avgConsumptionTime: ct };
              }
            });
            if (Object.keys(episodeAnalytics).length > 0) break;
          }
        }
      } catch (_) {}
    }

    // Pattern 2: Try per-episode downloads endpoint for top 10 episodes
    if (Object.keys(episodeAnalytics).length === 0) {
      await Promise.allSettled(episodeList.slice(0, 10).map(async (ep: any) => {
        for (const urlPattern of [
          `https://cms.megaphone.fm/api/networks/${networkId}/episodes/${ep.id}/downloads?start=${startStr}&end=${endStr}`,
          `https://cms.megaphone.fm/api/networks/${networkId}/episodes/${ep.id}/analytics?start=${startStr}&end=${endStr}`,
          `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes/${ep.id}/downloads`,
        ]) {
          try {
            const r = await fetch(urlPattern, { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' });
            if (r.ok) {
              const d = await r.json();
              const dl = parseInt(String(d.totalDownloads || d.downloads || d.total_downloads || d.count || 0));
              const st = parseInt(String(d.totalStreams || d.streams || d.total_streams || 0));
              if (dl > 0 || st > 0) {
                episodeAnalytics[ep.id] = {
                  totalDownloads: dl, totalStreams: st,
                  totalDelivered: parseInt(String(d.totalDelivered || d.delivered || (dl + st))),
                  avgConsumptionTime: parseFloat(String(d.avgConsumptionTime || d.average_consumption_time || 0)),
                };
                break;
              }
            }
          } catch (_) {}
        }
      }));
    }

    const episodes = episodeList.map((ep: any) => {
      const analytics = episodeAnalytics[ep.id] || {};
      return {
        id: ep.id,
        title: ep.title || 'Untitled Episode',
        publishedAt: ep.pubDate || ep.publishedAt || ep.published_at || '',
        duration: ep.duration ? Math.round(ep.duration / 60) : 0,
        audioUrl: ep.audioUrl || ep.audio_url || ep.enclosureUrl || '',
        imageUrl: ep.imageUrl || ep.image_url || communePodcast.imageUrl || '',
        totalDownloads: analytics.totalDownloads || 0,
        totalStreams: analytics.totalStreams || 0,
        totalDelivered: analytics.totalDelivered || 0,
        avgConsumptionTime: analytics.avgConsumptionTime || 0,
        performanceScore: (analytics.totalDownloads || 0) + (analytics.totalStreams || 0),
      };
    });

    const hasAnalytics = episodes.some((e: any) => e.performanceScore > 0);
    const sortedEpisodes = [...episodes].sort((a: any, b: any) => {
      if (hasAnalytics) return b.performanceScore - a.performanceScore;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    const totalDownloads = episodes.reduce((s: number, e: any) => s + e.totalDownloads, 0);
    const totalStreams = episodes.reduce((s: number, e: any) => s + e.totalStreams, 0);
    const totalDelivered = episodes.reduce((s: number, e: any) => s + e.totalDelivered, 0);
    const avgConsumptionTime = hasAnalytics
      ? episodes.filter((e: any) => e.avgConsumptionTime > 0)
          .reduce((s: number, e: any) => s + e.avgConsumptionTime, 0) /
        Math.max(1, episodes.filter((e: any) => e.avgConsumptionTime > 0).length)
      : 0;

    return {
      podcastName: communePodcast.title,
      podcastStats: { totalEpisodes: episodeList.length, totalDownloads, totalStreams, totalDelivered, avgConsumptionTime, hasAnalytics },
      episodes: sortedEpisodes,
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Instagram via Apify - try multiple free actors
async function fetchInstagram() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };
  
  // List of actors to try (in order of preference, free tier)
  const actorConfigs = [
    {
      actor: 'apify~instagram-scraper',
      body: { directUrls: ['https://www.instagram.com/jeffkrasno/'], resultsLimit: 12, resultsType: 'posts' },
    },
    {
      actor: 'apify~instagram-profile-scraper',
      body: { usernames: ['jeffkrasno'], resultsLimit: 12 },
    },
    {
      actor: 'zuzka~instagram-profile-follower-scraper',
      body: { usernames: ['jeffkrasno'] },
    },
  ];
  
  let lastError = '';
  for (const config of actorConfigs) {
    try {
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${config.actor}/run-sync-get-dataset-items?token=${apifyToken}&timeout=55`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config.body),
          cache: 'no-store',
        }
      );
      if (!runRes.ok) {
        lastError = `Apify ${config.actor} error: ${runRes.status}`;
        continue; // Try next actor
      }
      const data = await runRes.json();
      if (!data?.length) {
        lastError = `No data from ${config.actor}`;
        continue;
      }
      
      // Process based on response format
      const profile = data[0];
      const followers = typeof profile.followersCount === 'number'
        ? profile.followersCount
        : parseInt(String(profile.followersCount || '0').replace(/[^0-9]/g, '')) || 0;
      const posts = profile.postsCount || profile.mediaCount || 0;
      
      // Posts can be in different locations depending on the actor
      const rawPosts = profile.latestPosts || profile.posts || profile.topPosts
        || (Array.isArray(data) && data.length > 1 ? data : []);
      const recentPosts = rawPosts.slice(0, 12);
      
      const totalViews = recentPosts.reduce((s: number, p: any) =>
        s + (p.videoPlayCount || p.videoViewCount || p.likesCount || 0), 0);
      const avgEngagement = recentPosts.length > 0 && followers > 0
        ? recentPosts.reduce((s: number, p: any) => {
            const likes = p.likesCount || p.likes || 0;
            const comments = p.commentsCount || p.comments || 0;
            return s + ((likes + comments) / followers * 100);
          }, 0) / recentPosts.length
        : 0;

      const topPosts = recentPosts.map((p: any) => ({
        id: p.id || p.shortCode,
        url: p.url || p.link || `https://instagram.com/p/${p.shortCode}`,
        thumbnail: p.displayUrl || p.imageUrl || p.thumbnailUrl || p.previewUrl || p.image || '',
        caption: (p.caption || p.text || p.description || '').substring(0, 120),
        likes: p.likesCount || p.likes || 0,
        comments: p.commentsCount || p.comments || 0,
        views: p.videoPlayCount || p.videoViewCount || p.likesCount || 0,
        type: p.type || p.productType || 'image',
      }));

      return {
        profileStats: { followers, totalViews, avgEngagement, posts },
        topPosts,
        status: { connected: true, lastUpdated: new Date().toISOString() },
      };
    } catch (e: any) {
      lastError = e.message;
    }
  }
  
  return { status: { connected: false, error: lastError || 'All Instagram actors failed' } };
}

// TikTok via Apify - use free actor
async function fetchTikTok() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };
  try {
    // Use clockworks/free-tiktok-scraper which is free tier
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=55`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profiles: ['https://www.tiktok.com/@jeffkrasno'],
          resultsPerPage: 12,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
        }),
        cache: 'no-store',
      }
    );
    if (!runRes.ok) {
      // Fallback: try another free actor
      const run2 = await fetch(
        `https://api.apify.com/v2/acts/nUHE7UpFNmQd57mKD/run-sync-get-dataset-items?token=${apifyToken}&timeout=55`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startUrls: [{ url: 'https://www.tiktok.com/@jeffkrasno' }], maxItems: 12 }),
          cache: 'no-store',
        }
      );
      if (!run2.ok) throw new Error(`Apify TikTok error: ${runRes.status}`);
      const data2 = await run2.json();
      if (!data2?.length) throw new Error('No TikTok data returned');
      return processTikTokData(data2);
    }
    const data = await runRes.json();
    if (!data?.length) throw new Error('No TikTok data returned');
    return processTikTokData(data);
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

function processTikTokData(data: any[]) {
  const profileItem = data.find((d: any) => d.authorMeta?.fans !== undefined || d.userInfo !== undefined) || data[0];
  const videos = data.filter((d: any) => d.id && (d.playCount !== undefined || d.stats !== undefined || d.videoMeta !== undefined));

  const followers = profileItem?.authorMeta?.fans
    || profileItem?.userInfo?.stats?.followerCount
    || profileItem?.authorStats?.followerCount
    || profileItem?.followers
    || 0;

  const totalViews = videos.reduce((s: number, v: any) =>
    s + (v.playCount || v.stats?.playCount || 0), 0);
  const avgEngagement = videos.length > 0
    ? videos.reduce((s: number, v: any) => {
        const plays = v.playCount || v.stats?.playCount || 1;
        const likes = v.diggCount || v.stats?.diggCount || v.likesCount || 0;
        const comments = v.commentCount || v.stats?.commentCount || v.commentsCount || 0;
        return s + ((likes + comments) / plays * 100);
      }, 0) / videos.length
    : 0;

  const topVideos = videos.slice(0, 12).map((v: any) => ({
    id: v.id,
    url: v.webVideoUrl || `https://tiktok.com/@jeffkrasno/video/${v.id}`,
    thumbnail: v.videoMeta?.coverUrl || v.covers?.[0] || v.cover || v.thumbnail || '',
    caption: (v.text || v.description || v.title || '').substring(0, 120),
    likes: v.diggCount || v.stats?.diggCount || v.likesCount || 0,
    comments: v.commentCount || v.stats?.commentCount || v.commentsCount || 0,
    views: v.playCount || v.stats?.playCount || 0,
  }));

  return {
    profileStats: { followers, totalViews, avgEngagement, avgCTR: 0, videoCount: videos.length },
    topVideos,
    status: { connected: true, lastUpdated: new Date().toISOString() },
  };
}

// Facebook via Apify - CORRECTED page URL
async function fetchFacebook() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=80`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: 'https://www.facebook.com/jeffpatrickkrasno' }],
          maxPosts: 12,
          maxPostComments: 0,
          maxReviews: 0,
        }),
        cache: 'no-store',
      }
    );
    if (!runRes.ok) throw new Error(`Apify Facebook error: ${runRes.status}`);
    const data = await runRes.json();
    if (!data?.length) throw new Error('No Facebook data returned');

    const firstItem = data[0];
    const pageLikes = firstItem?.pageLikes || firstItem?.likes || 0;
    const followers = firstItem?.followers || firstItem?.pageFollowers || pageLikes;

    const posts = data.filter((d: any) => d.postId || d.id || d.text);
    const totalReach = posts.reduce((s: number, p: any) =>
      s + (p.likes || 0) + (p.shares || 0) + (p.comments || 0), 0);
    const avgEngagement = posts.length > 0
      ? posts.reduce((s: number, p: any) => s + (p.likes || 0) + (p.comments || 0), 0) / posts.length
      : 0;

    const topPosts = posts.slice(0, 12).map((p: any) => ({
      id: p.postId || p.id || String(Math.random()),
      url: p.url || p.link || 'https://facebook.com/jeffpatrickkrasno',
      thumbnail: p.media?.[0]?.thumbnail || p.media?.[0]?.url || p.topImage || p.image || '',
      caption: (p.text || p.message || p.description || '').substring(0, 120),
      likes: p.likes || p.likesCount || 0,
      comments: p.comments || p.commentsCount || 0,
      views: p.videoViews || p.views || 0,
      shares: p.shares || 0,
    }));

    return {
      profileStats: { pageLikes, followers, totalReach, avgEngagement },
      topPosts,
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

export async function GET() {
  const [youtube, podcast, instagram, tiktok, facebook] = await Promise.allSettled([
    fetchYouTube(),
    fetchPodcast(),
    fetchInstagram(),
    fetchTikTok(),
    fetchFacebook(),
  ]);

  const resolve = (r: PromiseSettledResult<any>, name: string) => {
    if (r.status === 'fulfilled') return r.value;
    return { status: { connected: false, error: `${name} fetch failed: ${r.reason?.message || r.reason}` } };
  };

  return NextResponse.json({
    youtube: resolve(youtube, 'YouTube'),
    podcast: resolve(podcast, 'Podcast'),
    instagram: resolve(instagram, 'Instagram'),
    tiktok: resolve(tiktok, 'TikTok'),
    facebook: resolve(facebook, 'Facebook'),
    lastUpdated: new Date().toISOString(),
  });
}
