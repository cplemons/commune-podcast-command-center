import { NextResponse } from 'next/server';

// YouTube Data API v3
async function fetchYouTube() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { status: { connected: false, error: 'YOUTUBE_API_KEY not configured' } };
  }
  try {
    // Get channel ID for @jeffkrasno
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=jeffkrasno&key=${apiKey}`,
      { next: { revalidate: 1800 } }
    );
    if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
    const channelData = await channelRes.json();

    if (!channelData.items?.length) throw new Error('Channel @jeffkrasno not found');
    const channel = channelData.items[0];
    const channelId = channel.id;
    const stats = channel.statistics;

    // Get recent videos (most popular)
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&maxResults=50&order=viewCount&type=video&key=${apiKey}`,
      { next: { revalidate: 1800 } }
    );
    const videosData = await videosRes.json();
    const videoIds = (videosData.items || []).map((v: any) => v.id.videoId).filter(Boolean);

    let videos: any[] = [];
    if (videoIds.length > 0) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`,
        { next: { revalidate: 1800 } }
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
          views,
          likes,
          comments,
          duration: v.contentDetails?.duration || '',
          publishedAt: v.snippet.publishedAt,
          engagementRate,
        };
      }).sort((a: any, b: any) => b.views - a.views);
    }

    return {
      channelStats: {
        subscribers: parseInt(stats.subscriberCount || '0'),
        totalViews: parseInt(stats.viewCount || '0'),
        videoCount: parseInt(stats.videoCount || '0'),
      },
      videos,
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Megaphone Podcast API
async function fetchPodcast() {
  const token = process.env.MEGAPHONE_API_TOKEN;
  const networkId = process.env.MEGAPHONE_NETWORK_ID;

  if (!token || !networkId) {
    return { status: { connected: false, error: 'MEGAPHONE_API_TOKEN or MEGAPHONE_NETWORK_ID not configured' } };
  }

  try {
    // Get all podcasts in the network
    const podcastRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts`,
      {
        headers: { 'Authorization': `Token token=${token}` },
        next: { revalidate: 3600 }
      }
    );
    if (!podcastRes.ok) throw new Error(`Megaphone API error: ${podcastRes.status}`);
    const podcasts = await podcastRes.json();

    if (!podcasts.length) throw new Error('No podcasts found in network');
    const podcast = podcasts[0]; // Use first podcast (Commune)

    // Get episodes
    const episodesRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${podcast.id}/episodes?per=50`,
      {
        headers: { 'Authorization': `Token token=${token}` },
        next: { revalidate: 3600 }
      }
    );
    const episodesData = await episodesRes.json();
    const episodes = (Array.isArray(episodesData) ? episodesData : episodesData.episodes || []).map((ep: any) => ({
      id: ep.id,
      title: ep.title,
      description: ep.summary || ep.subtitle || '',
      audioUrl: ep.audioUrl || ep.original_url,
      duration: ep.duration,
      publishedAt: ep.pubdate || ep.publishedAt,
      thumbnail: ep.imageUrl || podcast.imageUrl,
    }));

    return {
      episodes,
      channelTitle: podcast.title || 'Commune Podcast',
      totalEpisodes: podcast.episodeCount || episodes.length,
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Apify social scraping
async function fetchApifySocial(actorId: string, platform: string, handle: string) {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return {
      platform,
      handle,
      status: { connected: false, error: 'APIFY_API_TOKEN not configured. Upload CSV to connect.' }
    };
  }
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&maxItems=20`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: handle,
          resultsLimit: 20,
        }),
      }
    );
    if (!runRes.ok) throw new Error(`Apify error: ${runRes.status}`);
    const items = await runRes.json();
    const profileData = items[0] || {};
    return {
      platform,
      handle,
      followers: profileData.followersCount || profileData.followers,
      posts: items,
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return {
      platform,
      handle,
      status: { connected: false, error: e.message }
    };
  }
}

export async function GET() {
  const [youtube, podcast, instagram, facebook, tiktok] = await Promise.allSettled([
    fetchYouTube(),
    fetchPodcast(),
    fetchApifySocial('apify~instagram-scraper', 'Instagram', 'jeffkrasno'),
    fetchApifySocial('apify~facebook-posts-scraper', 'Facebook', 'jeffkrasno'),
    fetchApifySocial('clockworks~tiktok-scraper', 'TikTok', 'jeffkrasno'),
  ]);

  return NextResponse.json({
    youtube: youtube.status === 'fulfilled' ? youtube.value : { status: { connected: false, error: 'Failed to fetch' } },
    podcast: podcast.status === 'fulfilled' ? podcast.value : { status: { connected: false, error: 'Failed to fetch' } },
    instagram: instagram.status === 'fulfilled' ? instagram.value : { status: { connected: false, error: 'Failed to fetch' } },
    facebook: facebook.status === 'fulfilled' ? facebook.value : { status: { connected: false, error: 'Failed to fetch' } },
    tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { status: { connected: false, error: 'Failed to fetch' } },
    lastRefresh: new Date().toISOString(),
  });
}
