import { NextResponse } from 'next/server';

// ── YouTube ──────────────────────────────────────────────────────────────────
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

      // Fetch top 50 videos sorted by view count
      const videosRes = await fetch(
              `https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&maxResults=50&order=viewCount&type=video&key=${apiKey}`,
        { cache: 'no-store' }
            );
          const videosData = await videosRes.json();
          const videoIds = (videosData.items || []).map((v: any) => v.id.videoId).filter(Boolean);

      let topVideos: any[] = [];
          if (videoIds.length > 0) {
                  const statsRes = await fetch(
                            `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`,
                    { cache: 'no-store' }
                          );
                  const statsData = await statsRes.json();
                  topVideos = (statsData.items || []).map((v: any) => {
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
                  }).sort((a: any, b: any) => b.views - a.views); // sort by views descending
          }

      const totalViews = parseInt(stats.viewCount || '0');
          const subscribers = parseInt(stats.subscriberCount || '0');
          const videoCount = parseInt(stats.videoCount || '0');
          const avgEngagement = topVideos.length > 0
            ? topVideos.slice(0, 20).reduce((s: number, v: any) => s + v.engagementRate, 0) / Math.min(topVideos.length, 20)
                  : 0;

      return {
              channelStats: { subscribers, totalViews, videoCount, avgEngagement },
              topVideos,
              channelName: channel.snippet?.title || '@jeffkrasno',
              status: { connected: true, lastUpdated: new Date().toISOString() },
      };
    } catch (e: any) {
          return { status: { connected: false, error: e.message } };
    }
}

// ── Megaphone Podcast ─────────────────────────────────────────────────────────
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

      // Try analytics endpoint for downloads per episode
      let analyticsMap: Record<string, { downloads: number; streams: number; delivered: number }> = {};
        let hasAnalytics = false;

      const now = new Date();
        const startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 3);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = now.toISOString().split('T')[0];

      const analyticsPatterns = [
              `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/episodes/downloads?start=${startStr}&end=${endStr}`,
              `https://cms.megaphone.fm/api/networks/${networkId}/podcasts/${communePodcast.id}/analytics?start=${startStr}&end=${endStr}`,
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
                                    const items = Array.isArray(data) ? data : (data.episodes || data.downloads || []);
                                    if (items.length > 0 && (items[0].downloads !== undefined || items[0].total_downloads !== undefined)) {
                                                  hasAnalytics = true;
                                                  items.forEach((item: any) => {
                                                                  const id = item.episode_id || item.id;
                                                                  if (id) {
                                                                                    analyticsMap[id] = {
                                                                                                        downloads: item.downloads || item.total_downloads || 0,
                                                                                                        streams: item.streams || item.total_streams || 0,
                                                                                                        delivered: item.delivered || item.total_delivered || 0,
                                                                                      };
                                                                  }
                                                  });
                                                  break;
                                    }
                        }
              } catch { /* continue */ }
      }

      // Build episode list with any available analytics
      const episodes = episodeList.map((ep: any) => {
              const analytics = analyticsMap[ep.id] || {};
              const downloads = analytics.downloads || 0;
              const streams = analytics.streams || 0;
              const delivered = analytics.delivered || 0;
              // Use preCount/postCount as fallback engagement signals (ad slot counts)
                                             const adEngagement = (ep.preCount || 0) + (ep.postCount || 0);
              // Performance score: downloads + streams if available, else ad engagement as tiebreaker
                                             const performanceScore = hasAnalytics ? (downloads + streams) : adEngagement;

                                             return {
                                                       id: ep.id,
                                                       title: ep.title || 'Untitled',
                                                       publishedAt: ep.pubDate || ep.publishedAt || '',
                                                       duration: ep.duration ? Math.round(ep.duration / 60) : 0, // seconds to minutes
                                                       audioUrl: ep.audioFile || ep.enclosureUrl || '',
                                                       thumbnail: ep.imageUrl || communePodcast.imageUrl || '',
                                                       downloads,
                                                       streams,
                                                       delivered,
                                                       performanceScore,
                                             };
      });

      // Sort by performance (downloads+streams if available, else by date as last resort)
      const topEpisodes = hasAnalytics
          ? [...episodes].sort((a, b) => b.performanceScore - a.performanceScore)
              : [...episodes].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      // Aggregate totals
      const totalDownloads = episodes.reduce((s: number, e: any) => s + e.downloads, 0);
        const totalStreams = episodes.reduce((s: number, e: any) => s + e.streams, 0);
        const totalDelivered = episodes.reduce((s: number, e: any) => s + e.delivered, 0);

      return {
              podcastName: communePodcast.title || 'Commune Podcast',
              topEpisodes,
              podcastStats: {
                        totalEpisodes: episodeList.length,
                        totalDownloads,
                        totalStreams,
                        totalDelivered,
                        avgConsumptionTime: 0,
                        hasAnalytics,
              },
              status: { connected: true, lastUpdated: new Date().toISOString() },
      };
  } catch (e: any) {
        return { status: { connected: false, error: e.message } };
  }
}

// ── Apify helper ──────────────────────────────────────────────────────────────
async function runApifyActor(actorId: string, input: any, token: string): Promise<any[]> {
    const runRes = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=60&memory=256`,
      {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(input),
              cache: 'no-store',
      }
        );
    if (!runRes.ok) throw new Error(`Apify ${actorId} error: ${runRes.status}`);
    return runRes.json();
}

// ── Instagram ────────────────────────────────────────────────────────────────
async function fetchInstagram() {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };

  const username = 'jeffkrasno';
    try {
          // apify~instagram-scraper with resultsType=details returns {followersCount, postsCount, latestPosts:[...]}
      const items = await runApifyActor('apify~instagram-scraper', {
              directUrls: [`https://www.instagram.com/${username}/`],
              resultsType: 'details',
              resultsLimit: 12,
      }, token);

      if (!items?.length) throw new Error('No Instagram data returned');

      const profile = items[0];
          const followers = profile.followersCount || 0;
          const postsCount = profile.postsCount || profile.followsCount || 0;

      // latestPosts array contains the individual posts
      const rawPosts = profile.latestPosts || [];

      // Sort posts by video view count or like count descending (top performers first)
      const sortedPosts = [...rawPosts].sort((a: any, b: any) => {
              const aScore = (a.videoViewCount || a.likesCount || a.likesCount || 0);
              const bScore = (b.videoViewCount || b.likesCount || b.likesCount || 0);
              return bScore - aScore;
      });

      const topPosts = sortedPosts.slice(0, 12).map((p: any) => ({
              id: p.id || p.shortCode,
              url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
              thumbnail: p.displayUrl || p.thumbnailUrl || '',
              caption: (p.caption || '').substring(0, 100),
              likes: p.likesCount || 0,
              comments: p.commentsCount || 0,
              views: p.videoViewCount || p.videoPlayCount || 0,
              publishedAt: p.timestamp || '',
      }));

      // Calculate avg engagement across top posts
      const avgEngagement = topPosts.length > 0 && followers > 0
            ? topPosts.reduce((s: number, p: any) => s + (p.likes + p.comments), 0) / topPosts.length / followers * 100
              : 0;

      const totalLikes = topPosts.reduce((s: number, p: any) => s + p.likes, 0);
          const totalViews = topPosts.reduce((s: number, p: any) => s + p.views, 0);

      return {
              profileStats: { followers, postsCount, avgEngagement, totalReach: totalLikes },
              topPosts,
              status: { connected: true, lastUpdated: new Date().toISOString() },
      };
    } catch (e: any) {
          return { status: { connected: false, error: `Apify Instagram error: ${e.message}` } };
    }
}

// ── TikTok ───────────────────────────────────────────────────────────────────
async function fetchTikTok() {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };

  const username = 'jeffkrasno';
    try {
          // Try clockworks~free-tiktok-scraper first, fallback to other free actors
      let items: any[] = [];
          let lastError = '';

      const actors = [
        { id: 'clockworks~free-tiktok-scraper', input: { profiles: [username], resultsPerPage: 20 } },
        { id: 'novi~fast-tiktok-api', input: { username, maxItems: 20 } },
        { id: 'clockworks~tiktok-scraper', input: { profiles: [`https://www.tiktok.com/@${username}`], resultsPerPage: 20 } },
            ];

      for (const actor of actors) {
              try {
                        items = await runApifyActor(actor.id, actor.input, token);
                        if (items?.length) break;
              } catch (err: any) {
                        lastError = err.message;
                        if (err.message.includes('402')) continue; // try next actor
                break;
              }
      }

      if (!items?.length) throw new Error(lastError || 'No TikTok data returned');

      // Find the profile-level item (has followerCount) vs post items
      const profileItem = items.find((i: any) => i.followerCount !== undefined || i.stats?.followerCount !== undefined);
          const followers = profileItem?.followerCount || profileItem?.stats?.followerCount || items[0]?.authorMeta?.fans || items[0]?.author?.followerCount || 0;
          const following = profileItem?.followingCount || profileItem?.stats?.followingCount || items[0]?.authorMeta?.following || 0;

      // Filter to post items (have playCount / videoMeta)
      const postItems = items.filter((i: any) =>
              i.playCount !== undefined || i.stats?.playCount !== undefined || i.videoMeta || i.diggCount !== undefined
                                         );

      // Sort by play count descending (top performers first)
      const sortedPosts = [...postItems].sort((a: any, b: any) => {
              const aViews = a.playCount || a.stats?.playCount || 0;
              const bViews = b.playCount || b.stats?.playCount || 0;
              return bViews - aViews;
      });

      const topPosts = sortedPosts.slice(0, 12).map((p: any) => ({
              id: p.id,
              url: p.webVideoUrl || p.url || '',
              thumbnail: p.videoMeta?.coverUrl || p.covers?.[0] || '',
              caption: (p.text || p.desc || '').substring(0, 100),
              views: p.playCount || p.stats?.playCount || 0,
              likes: p.diggCount || p.stats?.diggCount || 0,
              comments: p.commentCount || p.stats?.commentCount || 0,
              shares: p.shareCount || p.stats?.shareCount || 0,
              publishedAt: p.createTime ? new Date(p.createTime * 1000).toISOString() : '',
      }));

      const totalViews = topPosts.reduce((s: number, p: any) => s + p.views, 0);
          const avgEngagement = topPosts.length > 0 && followers > 0
            ? topPosts.reduce((s: number, p: any) => s + p.likes + p.comments, 0) / topPosts.length / followers * 100
                  : 0;

      return {
              profileStats: { followers, following, avgEngagement, totalReach: totalViews },
              topPosts,
              status: { connected: true, lastUpdated: new Date().toISOString() },
      };
    } catch (e: any) {
          return { status: { connected: false, error: `Apify TikTok error: ${e.message}` } };
    }
}

// ── Facebook ─────────────────────────────────────────────────────────────────
async function fetchFacebook() {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) return { status: { connected: false, error: 'APIFY_API_TOKEN not configured' } };

  const pageUrl = 'https://www.facebook.com/jeffpatrickkrasno';
    try {
          // Use facebook-posts-scraper to get posts with engagement data
      const items = await runApifyActor('apify~facebook-posts-scraper', {
              startUrls: [{ url: pageUrl }],
              maxPosts: 20,
              maxPostComments: 0,
              scrapeAbout: false,
              scrapeReviews: false,
      }, token);

      if (!items?.length) throw new Error('No Facebook data returned');

      // Filter to actual post items (not page info items)
      const posts = items.filter((i: any) => i.postUrl || i.url || i.text);

      // Sort by reactions + comments (engagement) descending — top performers first
      const sortedPosts = [...posts].sort((a: any, b: any) => {
              const aScore = (a.likes || a.reactions || 0) + (a.comments || 0) + (a.shares || 0);
              const bScore = (b.likes || b.reactions || 0) + (b.comments || 0) + (b.shares || 0);
              return bScore - aScore;
      });

      const topPosts = sortedPosts.slice(0, 12).map((p: any) => ({
              id: p.postId || p.id || '',
              url: p.postUrl || p.url || '',
              thumbnail: p.media?.[0]?.url || p.image || p.imageUrl || '',
              caption: (p.text || p.message || '').substring(0, 100),
              likes: p.likes || p.reactions || 0,
              comments: p.comments || 0,
              views: p.videoViews || p.views || 0,
              shares: p.shares || 0,
              publishedAt: p.time || p.date || '',
      }));

      // Try to get page-level info from page info item
      const pageInfo = items.find((i: any) => i.likes !== undefined && !i.postUrl) || {};
          const pageLikes = pageInfo.likes || 0;
          const followers = pageInfo.followers || pageInfo.followersCount || pageLikes;

      const totalEngagement = topPosts.reduce((s, p) => s + p.likes + p.comments, 0);
          const avgEngagement = topPosts.length > 0
            ? (totalEngagement / topPosts.length)
                  : 0;

      return {
              profileStats: { followers, pageLikes, avgEngagement, totalReach: totalEngagement },
              topPosts,
              status: { connected: true, lastUpdated: new Date().toISOString() },
      };
    } catch (e: any) {
          return { status: { connected: false, error: `Apify Facebook error: ${e.message}` } };
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET() {
    const [youtube, podcast, instagram, tiktok, facebook] = await Promise.allSettled([
          fetchYouTube(),
          fetchPodcast(),
          fetchInstagram(),
          fetchTikTok(),
          fetchFacebook(),
        ]);

  const result = {
        youtube: youtube.status === 'fulfilled' ? youtube.value : { status: { connected: false, error: String(youtube.reason) } },
        podcast: podcast.status === 'fulfilled' ? podcast.value : { status: { connected: false, error: String(podcast.reason) } },
        instagram: instagram.status === 'fulfilled' ? instagram.value : { status: { connected: false, error: String(instagram.reason) } },
        tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { status: { connected: false, error: String(tiktok.reason) } },
        facebook: facebook.status === 'fulfilled' ? facebook.value : { status: { connected: false, error: String(facebook.reason) } },
        lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
