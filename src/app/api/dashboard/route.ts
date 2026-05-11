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

// Megaphone Podcast API with analytics
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

    // Get episodes
    const episodesRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes?per=100`,
      { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
    );
    if (!episodesRes.ok) throw new Error(`Megaphone episodes error: ${episodesRes.status}`);
    const episodesData = await episodesRes.json();
    const episodeList = Array.isArray(episodesData) ? episodesData : (episodesData.episodes || []);

    // Try to get analytics for each episode (Megaphone analytics endpoint)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = now.toISOString().split('T')[0];

    // Fetch analytics for top episodes
    let episodeAnalytics: Record<string, any> = {};
    try {
      const analyticsRes = await fetch(
        `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes/analytics?start=${startStr}&end=${endStr}&per=100`,
        { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
      );
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        const items = Array.isArray(analyticsData) ? analyticsData : (analyticsData.episodes || analyticsData.items || []);
        items.forEach((item: any) => {
          if (item.id || item.episodeId) {
            const id = item.id || item.episodeId;
            episodeAnalytics[id] = {
              totalDownloads: item.totalDownloads || item.downloads || item.total_downloads || 0,
              totalStreams: item.totalStreams || item.streams || item.total_streams || 0,
              totalDelivered: item.totalDelivered || item.delivered || item.total_delivered || (item.totalDownloads || 0) + (item.totalStreams || 0),
              avgConsumptionTime: item.avgConsumptionTime || item.average_consumption_time || item.consumptionTime || 0,
              consumptionRate: item.consumptionRate || item.consumption_rate || 0,
            };
          }
        });
      }
    } catch (_) {}

    const episodes = episodeList.map((ep: any) => {
      const analytics = episodeAnalytics[ep.id] || {};
      return {
        id: ep.id,
        title: ep.title,
        description: ep.summary || ep.subtitle || '',
        audioUrl: ep.audioUrl || ep.original_url,
        duration: ep.duration,
        publishedAt: ep.pubdate || ep.publishedAt,
        thumbnail: ep.imageUrl || communePodcast.imageUrl,
        totalDownloads: analytics.totalDownloads || 0,
        totalStreams: analytics.totalStreams || 0,
        totalDelivered: analytics.totalDelivered || 0,
        avgConsumptionTime: analytics.avgConsumptionTime || 0,
        consumptionRate: analytics.consumptionRate || 0,
      };
    });

    // Sort episodes by downloads+streams (best analytics first)
    const topEpisodes = [...episodes]
      .sort((a, b) => (b.totalDownloads + b.totalStreams) - (a.totalDownloads + a.totalStreams));

    // Network-level analytics
    let networkStats = { totalDownloads: 0, totalStreams: 0, totalDelivered: 0, avgConsumptionTime: 0 };
    try {
      const netRes = await fetch(
        `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/analytics?start=${startStr}&end=${endStr}`,
        { headers: { 'Authorization': `Token token=${token}` }, cache: 'no-store' }
      );
      if (netRes.ok) {
        const netData = await netRes.json();
        networkStats = {
          totalDownloads: netData.totalDownloads || netData.downloads || netData.total_downloads || 0,
          totalStreams: netData.totalStreams || netData.streams || netData.total_streams || 0,
          totalDelivered: netData.totalDelivered || netData.delivered || netData.total_delivered || 0,
          avgConsumptionTime: netData.avgConsumptionTime || netData.average_consumption_time || 0,
        };
      }
    } catch (_) {}

    return {
      episodes: episodes.slice(0, 50),
      topEpisodes: topEpisodes.slice(0, 8),
      channelTitle: communePodcast.title || 'Commune Podcast',
      totalEpisodes: communePodcast.episodeCount || episodes.length,
      networkStats,
      allShows: podcasts.map((p: any) => ({ id: p.id, title: p.title, episodeCount: p.episodeCount })),
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Instagram via Apify (apify/instagram-profile-scraper)
async function fetchInstagram() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken || apifyToken.startsWith('REPLACE')) {
    return { status: { connected: false, error: 'Add APIFY_API_TOKEN to connect Instagram' } };
  }
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: ['jeffkrasno'], resultsLimit: 12 }),
        signal: AbortSignal.timeout(55000),
      }
    );
    if (!runRes.ok) throw new Error(`Apify Instagram error: ${runRes.status}`);
    const data = await runRes.json();
    const profile = Array.isArray(data) ? data[0] : data;
    if (!profile) throw new Error('No Instagram data returned');

    const followers = profile.followersCount || profile.followers_count || 0;
    const following = profile.followsCount || profile.following_count || 0;
    const posts = profile.postsCount || profile.edge_owner_to_timeline_media?.count || 0;
    const recentPosts = profile.latestPosts || profile.posts || profile.edge_owner_to_timeline_media?.edges?.map((e: any) => e.node) || [];

    const postStats = recentPosts.slice(0, 12).map((p: any) => {
      const likes = p.likesCount || p.edge_media_preview_like?.count || p.likes || 0;
      const comments = p.commentsCount || p.edge_media_to_comment?.count || p.comments || 0;
      const views = p.videoViewCount || p.videoPlayCount || p.views || 0;
      const reach = views || likes;
      const engagement = reach > 0 ? ((likes + comments) / reach * 100) : (followers > 0 ? ((likes + comments) / followers * 100) : 0);
      return {
        id: p.id || p.shortCode,
        url: p.url || `https://instagram.com/p/${p.shortCode}`,
        thumbnail: p.displayUrl || p.thumbnail || p.previewUrl || '',
        caption: (p.caption || p.text || '').slice(0, 100),
        likes, comments, views,
        engagement,
        type: p.type || (p.videoUrl ? 'video' : 'photo'),
        publishedAt: p.timestamp || p.taken_at_timestamp || '',
      };
    });

    const totalLikes = postStats.reduce((s: number, p: any) => s + p.likes, 0);
    const totalComments = postStats.reduce((s: number, p: any) => s + p.comments, 0);
    const totalViews = postStats.reduce((s: number, p: any) => s + p.views, 0);
    const avgEngagement = postStats.length > 0
      ? postStats.reduce((s: number, p: any) => s + p.engagement, 0) / postStats.length
      : 0;

    return {
      profileStats: { followers, following, posts, totalLikes, totalComments, totalViews, avgEngagement },
      topPosts: [...postStats].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, 8),
      recentPosts: postStats,
      username: profile.username || 'jeffkrasno',
      bio: profile.biography || '',
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// TikTok via Apify (clockworks/tiktok-profile-scraper)
async function fetchTikTok() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken || apifyToken.startsWith('REPLACE')) {
    return { status: { connected: false, error: 'Add APIFY_API_TOKEN to connect TikTok' } };
  }
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: ['jeffkrasno'], resultsPerPage: 12 }),
        signal: AbortSignal.timeout(55000),
      }
    );
    if (!runRes.ok) throw new Error(`Apify TikTok error: ${runRes.status}`);
    const data = await runRes.json();
    const items = Array.isArray(data) ? data : [data];
    const profileItem = items.find((i: any) => i.authorMeta || i.userInfo) || items[0];
    if (!profileItem) throw new Error('No TikTok data returned');

    const meta = profileItem.authorMeta || profileItem.userInfo?.stats || profileItem;
    const followers = meta.fans || meta.followerCount || meta.followers || 0;
    const following = meta.following || meta.followingCount || 0;
    const heart = meta.heart || meta.heartCount || meta.totalLikes || 0;
    const videoCount = meta.video || meta.videoCount || 0;

    const videos = items.filter((i: any) => i.id && !i.authorMeta?.fans).map((v: any) => {
      const views = v.playCount || v.stats?.playCount || 0;
      const likes = v.diggCount || v.stats?.diggCount || 0;
      const comments = v.commentCount || v.stats?.commentCount || 0;
      const shares = v.shareCount || v.stats?.shareCount || 0;
      const engagement = views > 0 ? ((likes + comments + shares) / views * 100) : 0;
      const ctr = views > 0 ? (likes / views * 100) : 0;
      return {
        id: v.id,
        url: v.webVideoUrl || `https://tiktok.com/@jeffkrasno/video/${v.id}`,
        thumbnail: v.covers?.[0] || v.cover || v.thumbnail || '',
        caption: (v.text || v.desc || '').slice(0, 100),
        views, likes, comments, shares, engagement, ctr,
        publishedAt: v.createTimeISO || v.createTime || '',
        duration: v.videoMeta?.duration || v.duration || 0,
      };
    });

    const avgEngagement = videos.length > 0
      ? videos.reduce((s: number, v: any) => s + v.engagement, 0) / videos.length : 0;
    const totalViews = videos.reduce((s: number, v: any) => s + v.views, 0);
    const avgCTR = videos.length > 0
      ? videos.reduce((s: number, v: any) => s + v.ctr, 0) / videos.length : 0;

    return {
      profileStats: { followers, following, videoCount, heart, totalViews, avgEngagement, avgCTR },
      topVideos: [...videos].sort((a, b) => b.views - a.views).slice(0, 8),
      recentVideos: videos.slice(0, 12),
      username: meta.name || meta.uniqueId || 'jeffkrasno',
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Facebook via Apify (apify/facebook-pages-scraper)
async function fetchFacebook() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken || apifyToken.startsWith('REPLACE')) {
    return { status: { connected: false, error: 'Add APIFY_API_TOKEN to connect Facebook' } };
  }
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrls: [{ url: 'https://www.facebook.com/jeffkrasno' }], maxPosts: 12 }),
        signal: AbortSignal.timeout(55000),
      }
    );
    if (!runRes.ok) throw new Error(`Apify Facebook error: ${runRes.status}`);
    const data = await runRes.json();
    const items = Array.isArray(data) ? data : [data];
    const pageItem = items.find((i: any) => i.likes !== undefined || i.followers !== undefined) || items[0];
    if (!pageItem) throw new Error('No Facebook data returned');

    const followers = pageItem.followers || pageItem.followersCount || pageItem.likes || 0;
    const pageLikes = pageItem.likes || pageItem.pageLikes || followers;

    const posts = items.filter((i: any) => i.postId || i.text).map((p: any) => {
      const likes = p.likes || p.reactions || 0;
      const comments = p.comments || 0;
      const shares = p.shares || 0;
      const views = p.videoViewCount || p.views || 0;
      const reach = views || (likes + comments + shares);
      const engagement = followers > 0 ? ((likes + comments + shares) / followers * 100) : 0;
      return {
        id: p.postId || p.id,
        url: p.url || p.postUrl || '',
        thumbnail: p.media?.[0]?.thumbnail || p.thumbnail || '',
        text: (p.text || p.message || '').slice(0, 150),
        likes, comments, shares, views, engagement,
        publishedAt: p.time || p.date || '',
        type: p.type || (p.videoUrl ? 'video' : 'post'),
      };
    });

    const avgEngagement = posts.length > 0
      ? posts.reduce((s: number, p: any) => s + p.engagement, 0) / posts.length : 0;
    const totalReach = posts.reduce((s: number, p: any) => s + (p.views || p.likes || 0), 0);

    return {
      profileStats: { followers, pageLikes, totalPosts: posts.length, avgEngagement, totalReach },
      topPosts: [...posts].sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)).slice(0, 8),
      recentPosts: posts.slice(0, 12),
      pageName: pageItem.title || pageItem.name || 'Jeff Krasno',
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

export async function GET() {
  try {
    const [youtube, podcast, instagram, tiktok, facebook] = await Promise.allSettled([
      fetchYouTube(),
      fetchPodcast(),
      fetchInstagram(),
      fetchTikTok(),
      fetchFacebook(),
    ]);

    return NextResponse.json({
      youtube: youtube.status === 'fulfilled' ? youtube.value : { status: { connected: false, error: 'YouTube fetch failed' } },
      podcast: podcast.status === 'fulfilled' ? podcast.value : { status: { connected: false, error: 'Podcast fetch failed' } },
      instagram: instagram.status === 'fulfilled' ? instagram.value : { status: { connected: false, error: 'Instagram fetch failed' } },
      tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { status: { connected: false, error: 'TikTok fetch failed' } },
      facebook: facebook.status === 'fulfilled' ? facebook.value : { status: { connected: false, error: 'Facebook fetch failed' } },
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
