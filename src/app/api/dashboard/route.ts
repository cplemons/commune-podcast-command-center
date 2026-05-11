import { NextResponse } from 'next/server';

// YouTube Data API v3
async function fetchYouTube() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { status: { connected: false, error: 'YOUTUBE_API_KEY not configured' } };
  }
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
      channelName: channel.snippet?.title || '@jeffkrasno',
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
    const podcastRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts`,
      {
        headers: { 'Authorization': `Token token=${token}` },
        cache: 'no-store'
      }
    );
    if (!podcastRes.ok) throw new Error(`Megaphone API error: ${podcastRes.status}`);
    const podcasts = await podcastRes.json();

    if (!podcasts.length) throw new Error('No podcasts found in network');

    // Find the Commune Podcast (not Commune Courses) - look for main podcast
    const communePodcast = podcasts.find((p: any) =>
      p.title && p.title.toLowerCase().includes('commune') && !p.title.toLowerCase().includes('courses')
    ) || podcasts.find((p: any) =>
      p.title && p.title.toLowerCase().includes('podcast')
    ) || podcasts[0];

    // Get episodes for the main podcast
    const episodesRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes?per=50`,
      {
        headers: { 'Authorization': `Token token=${token}` },
        cache: 'no-store'
      }
    );
    if (!episodesRes.ok) throw new Error(`Megaphone episodes error: ${episodesRes.status}`);
    const episodesData = await episodesRes.json();
    const episodeList = Array.isArray(episodesData) ? episodesData : (episodesData.episodes || []);
    const episodes = episodeList.map((ep: any) => ({
      id: ep.id,
      title: ep.title,
      description: ep.summary || ep.subtitle || '',
      audioUrl: ep.audioUrl || ep.original_url,
      duration: ep.duration,
      publishedAt: ep.pubdate || ep.publishedAt,
      thumbnail: ep.imageUrl || communePodcast.imageUrl,
    }));

    // Get all shows for reference
    const allShows = podcasts.map((p: any) => ({
      id: p.id,
      title: p.title,
      episodeCount: p.episodeCount,
    }));

    return {
      episodes,
      channelTitle: communePodcast.title || 'Commune Podcast',
      totalEpisodes: communePodcast.episodeCount || episodes.length,
      allShows,
      status: { connected: true, lastUpdated: new Date().toISOString() },
    };
  } catch (e: any) {
    return { status: { connected: false, error: e.message } };
  }
}

// Social Media via Apify
async function fetchSocial(platform: string, username: string) {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken || apifyToken === 'REPLACE_WITH_YOUR_APIFY_TOKEN') {
    return { status: { connected: false, error: `Add APIFY_API_TOKEN to connect ${platform}` } };
  }

  const actorMap: Record<string, string> = {
    instagram: 'apify/instagram-profile-scraper',
    tiktok: 'clockworks/tiktok-profile-scraper',
    facebook: 'apify/facebook-pages-scraper',
  };

  const actor = actorMap[platform];
  if (!actor) return { status: { connected: false, error: `Unknown platform: ${platform}` } };

  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernames: [username],
          resultsLimit: 20,
        }),
        signal: AbortSignal.timeout(25000),
      }
    );
    if (!runRes.ok) throw new Error(`Apify ${platform} error: ${runRes.status}`);
    const data = await runRes.json();
    return {
      data: Array.isArray(data) ? data[0] : data,
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
      fetchSocial('instagram', 'jeffkrasno'),
      fetchSocial('tiktok', 'jeffkrasno'),
      fetchSocial('facebook', 'jeffkrasno'),
    ]);

    return NextResponse.json({
      youtube: youtube.status === 'fulfilled' ? youtube.value : { status: { connected: false, error: 'Fetch failed' } },
      podcast: podcast.status === 'fulfilled' ? podcast.value : { status: { connected: false, error: 'Fetch failed' } },
      instagram: instagram.status === 'fulfilled' ? instagram.value : { status: { connected: false, error: 'Fetch failed' } },
      tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { status: { connected: false, error: 'Fetch failed' } },
      facebook: facebook.status === 'fulfilled' ? facebook.value : { status: { connected: false, error: 'Fetch failed' } },
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
