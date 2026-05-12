import { NextResponse } from 'next/server';

let cachedData: any = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchYouTube() {
          const apiKey = process.env.YOUTUBE_API_KEY;
          if (!apiKey) return { status: { connected: false, error: 'YOUTUBE_API_KEY not configured' } };
          try {
                      const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=jeffkrasno&key=${apiKey}`, { cache: 'no-store' });
                      if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
                      const channelData = await channelRes.json();
                      if (!channelData.items?.length) throw new Error('Channel not found');
                      const channel = channelData.items[0];
                      const channelId = channel.id;
                      const stats = channel.statistics;
                      const videosRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id,snippet&channelId=${channelId}&maxResults=50&order=viewCount&type=video&key=${apiKey}`, { cache: 'no-store' });
                      const videosData = await videosRes.json();
                      let topVideos: any[] = [];
                      if (videosData.items?.length) {
                                    const videoIds = videosData.items.map((v: any) => v.id.videoId).filter(Boolean).join(',');
                                    const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`, { cache: 'no-store' });
                                    const detailsData = await detailsRes.json();
                                    topVideos = (detailsData.items || []).map((v: any) => ({
                                                    id: v.id, title: v.snippet.title,
                                                    thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url,
                                                    views: parseInt(v.statistics.viewCount || '0'),
                                                    likes: parseInt(v.statistics.likeCount || '0'),
                                                    comments: parseInt(v.statistics.commentCount || '0'),
                                                    duration: v.contentDetails.duration, publishedAt: v.snippet.publishedAt,
                                                    engagementRate: parseInt(v.statistics.viewCount || '1') > 0 ? ((parseInt(v.statistics.likeCount || '0') + parseInt(v.statistics.commentCount || '0')) / parseInt(v.statistics.viewCount || '1')) * 100 : 0,
                                    })).sort((a: any, b: any) => b.views - a.views);
                      }
                      const avgEngagement = topVideos.length > 0 ? topVideos.reduce((s: number, v: any) => s + v.engagementRate, 0) / topVideos.length : 0;
                      return { channelStats: { subscribers: parseInt(stats.subscriberCount || '0'), totalViews: parseInt(stats.viewCount || '0'), videoCount: parseInt(stats.videoCount || '0'), avgEngagement }, topVideos, status: { connected: true } };
          } catch (err: any) { return { status: { connected: false, error: err.message } }; }
}

async function fetchPodcast(megaphoneApiKey?: string) {
  const NETWORK_ID = '92d07666-568b-11f0-905f-27d2b3e735f9';
  const PODCAST_ID = '83bda43e-5846-11f0-9c25-6747adca5027';
  const apiToken = megaphoneApiKey || process.env.MEGAPHONE_API_TOKEN;
  if (!apiToken) return { podcastName: 'Commune with Jeff Krasno', topEpisodes: [], episodes: [], analyticsAvailable: false, apiKeyConfigured: false, totalDownloads: null, totalStreams: null, status: { connected: false, error: 'No API key available' } };

  try {
    // Fetch all episodes (up to 500) so we can rank by performance not recency
    const epsRes = await fetch(
      `https://cms.megaphone.fm/api/networks/${NETWORK_ID}/podcasts/${PODCAST_ID}/episodes?per=500`,
      { headers: { 'Authorization': `Token token=${apiToken}` }, cache: 'no-store' }
    );
    if (!epsRes.ok) throw new Error(`Megaphone episodes error: ${epsRes.status}`);
    const epsData = await epsRes.json();
    const apiEpisodes = Array.isArray(epsData) ? epsData : epsData?.episodes || [];
    if (apiEpisodes.length === 0) throw new Error('No episodes returned');

    // First check if download counts are available inline on the episodes
    // (some Megaphone plans expose cleanDownloads / downloads directly on each episode)
    const firstEp = apiEpisodes[0];
    const hasInlineDownloads =
      firstEp?.cleanDownloads != null ||
      firstEp?.downloads != null ||
      firstEp?.total_downloads != null;

    let episodes: any[];

    if (hasInlineDownloads) {
      // Fast path: data already on episode objects
      episodes = apiEpisodes.map((ep: any) => {
        const durationSecs = parseFloat(ep.duration || ep.lengthInSeconds || '0');
        const downloads = Number(ep.cleanDownloads || ep.downloads || ep.total_downloads || 0);
        const streams = Number(ep.streams || ep.total_streams || 0);
        return {
          id: ep.id || ep.uid,
          title: ep.title,
          publishedAt: ep.pubdate || ep.publishedAt || ep.pubDate || '',
          duration: Math.floor(durationSecs / 60),
          audioUrl: ep.enclosureUrl || ep.audioUrl || '',
          thumbnail: ep.imageUrl || ep.image || ep.thumbnailUrl || '',
          downloads,
          streams,
          delivered: downloads + streams,
          performanceScore: downloads + streams,
        };
      });
    } else {
      // Slow path: fetch per-episode analytics (batch concurrently, limit to avoid rate limits)
      // Fetch analytics for all episodes in batches of 10
      const BATCH = 10;
      episodes = [];
      for (let i = 0; i < apiEpisodes.length; i += BATCH) {
        const batch = apiEpisodes.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(async (ep: any) => {
          const durationSecs = parseFloat(ep.duration || ep.lengthInSeconds || '0');
          let downloads = 0;
          let streams = 0;
          try {
            // Try per-episode analytics endpoint
            const analyticsRes = await fetch(
              `https://cms.megaphone.fm/api/networks/${NETWORK_ID}/podcasts/${PODCAST_ID}/episodes/${ep.id}/analytics`,
              { headers: { 'Authorization': `Token token=${apiToken}` }, cache: 'no-store' }
            );
            if (analyticsRes.ok) {
              const ad = await analyticsRes.json();
              // Handle both object and array responses
              if (Array.isArray(ad)) {
                // Array of daily/monthly rollups -- sum them
                downloads = ad.reduce((s: number, row: any) => s + Number(row?.downloads || row?.cleanDownloads || row?.total_downloads || 0), 0);
                streams = ad.reduce((s: number, row: any) => s + Number(row?.streams || row?.total_streams || 0), 0);
              } else {
                downloads = Number(ad?.downloads || ad?.total_downloads || ad?.cleanDownloads || ad?.clean_downloads || 0);
                streams = Number(ad?.streams || ad?.total_streams || 0);
              }
            }
          } catch {}
          return {
            id: ep.id || ep.uid,
            title: ep.title,
            publishedAt: ep.pubdate || ep.publishedAt || ep.pubDate || '',
            duration: Math.floor(durationSecs / 60),
            audioUrl: ep.enclosureUrl || ep.audioUrl || '',
            thumbnail: ep.imageUrl || ep.image || ep.thumbnailUrl || '',
            downloads,
            streams,
            delivered: downloads + streams,
            performanceScore: downloads + streams,
          };
        }));
        episodes.push(...batchResults);
      }
    }

    // Sort by total downloads+streams descending (performance ranking, not recency)
    const sorted = [...episodes].sort((a: any, b: any) => b.performanceScore - a.performanceScore);
    const totalDownloads = episodes.reduce((s: number, e: any) => s + e.downloads, 0);
    const totalStreams = episodes.reduce((s: number, e: any) => s + e.streams, 0);
    const hasAnalytics = totalDownloads > 0 || totalStreams > 0;

    return {
      podcastName: 'Commune with Jeff Krasno',
      topEpisodes: sorted,
      episodes: sorted,
      analyticsAvailable: hasAnalytics,
      apiKeyConfigured: true,
      totalDownloads: hasAnalytics ? totalDownloads : null,
      totalStreams: hasAnalytics ? totalStreams : null,
      status: { connected: true },
    };
  } catch (apiErr: any) {
    return { podcastName: 'Commune with Jeff Krasno', topEpisodes: [], episodes: [], analyticsAvailable: false, apiKeyConfigured: !!apiToken, totalDownloads: null, totalStreams: null, status: { connected: false, error: apiErr.message } };
  }
}

// Instagram - fetch profile stats + top posts sorted by view count
async function fetchInstagram() {
          const rapidApiKey = process.env.RAPIDAPI_KEY;
          if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };
          try {
                      const host = 'instagram-scraper-stable-api.p.rapidapi.com';
                      const headers: Record<string, string> = {
                                    'x-rapidapi-host': host,
                                    'x-rapidapi-key': rapidApiKey,
                      };

            // Step 1: fetch profile to get follower count and userId
            const profileRes = await fetch(
              `https://${host}/v1/info?username_or_id_or_url=jeffkrasno`,
              { headers, cache: 'no-store' }
            );
            if (!profileRes.ok) throw new Error(`Instagram profile API error: ${profileRes.status}`);
            const profileData = await profileRes.json();

            // Handle both direct and nested response shapes
            const userData =
              profileData?.data ||
              profileData?.user_data ||
              profileData?.graphql?.user ||
              profileData;

            const followers = Number(
              userData?.follower_count ||
              userData?.edge_followed_by?.count ||
              userData?.followers_count ||
              0
            );
            const postsCount = Number(
              userData?.media_count ||
              userData?.edge_owner_to_timeline_media?.count ||
              userData?.post_count ||
              0
            );
            const userId =
              userData?.id ||
              userData?.pk ||
              userData?.user_id ||
              '';

            if (!userId) throw new Error('Could not resolve Instagram user ID');

            // Step 2: fetch posts feed using user ID
            const postsRes = await fetch(
              `https://${host}/v1/posts?user_id=${userId}`,
              { headers, cache: 'no-store' }
            );
            if (!postsRes.ok) throw new Error(`Instagram posts API error: ${postsRes.status}`);
            const postsData = await postsRes.json();

            // Posts may be in data.items, data.edges, items, or a top-level array
            const postsContainer = postsData?.data || postsData;
            const rawItems: any[] =
              postsContainer?.items ||
              postsContainer?.edge_owner_to_timeline_media?.edges ||
              postsContainer?.posts ||
              (Array.isArray(postsContainer) ? postsContainer : []);

            const topPosts = rawItems.map((p: any) => {
              // Unwrap edge node wrapper if present
              const node = p?.node || p;
              const views = Number(
                node?.video_view_count ||
                node?.view_count ||
                node?.play_count ||
                node?.ig_play_count ||
                0
              );
              const likes = Number(
                node?.like_count ||
                node?.edge_media_preview_like?.count ||
                node?.edge_liked_by?.count ||
                node?.likes_count ||
                0
              );
              const comments = Number(
                node?.comment_count ||
                node?.edge_media_to_comment?.count ||
                node?.comments_count ||
                0
              );
              const engagementRate = followers > 0 ? ((likes + comments) / followers) * 100 : 0;
              // Thumbnail: try various image fields
              const imgCandidates = node?.image_versions2?.candidates || node?.display_resources || [];
              const thumbnail =
                imgCandidates[0]?.url ||
                node?.display_url ||
                node?.thumbnail_url ||
                node?.thumbnail_src ||
                node?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
                '';
              const caption =
                node?.caption?.text ||
                (typeof node?.caption === 'string' ? node.caption : '') ||
                node?.edge_media_to_caption?.edges?.[0]?.node?.text ||
                node?.accessibility_caption ||
                '';
              const takenAt = node?.taken_at || node?.taken_at_timestamp || node?.timestamp;
              const publishedAt = takenAt ? new Date(Number(takenAt) * 1000).toISOString() : '';
              const shortcode = node?.shortcode || node?.code || node?.pk || '';
              return {
                id: String(node?.id || node?.pk || shortcode),
                caption,
                thumbnail: thumbnail ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '',
                views,
                likes,
                comments,
                engagementRate,
                publishedAt,
                url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : '',
              };
            })
            // Sort by views descending; fall back to likes if views are all zero
            .sort((a: any, b: any) => {
              const aScore = a.views > 0 ? a.views : a.likes;
              const bScore = b.views > 0 ? b.views : b.likes;
              return bScore - aScore;
            });

            const totalViews = topPosts.reduce((s: number, p: any) => s + (p.views || 0), 0);
            const avgEngagement = topPosts.length > 0
              ? topPosts.reduce((s: number, p: any) => s + p.engagementRate, 0) / topPosts.length
              : 0;
            return {
              profileStats: { followers, postsCount, totalViews, avgEngagement },
              topPosts,
              status: { connected: true },
            };
          } catch (err: any) { return { status: { connected: false, error: `Instagram scraper error: ${err.message}` } }; }
}

async function fetchTikTok() {
          const rapidApiKey = process.env.RAPIDAPI_KEY;
          if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };
          try {
                      const userRes = await fetch('https://tiktok-scraper7.p.rapidapi.com/user/info?unique_id=jeffkrasno', { headers: { 'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com', 'x-rapidapi-key': rapidApiKey, 'Content-Type': 'application/json' }, cache: 'no-store' });
                      if (!userRes.ok) throw new Error(`TikTok API error: ${userRes.status}`);
                      const userData = await userRes.json();
                      const userInfo = userData?.data?.user || userData?.user || userData?.data || userData;
                      const userStats = userData?.data?.stats || userData?.stats || {};
                      const userId = userInfo?.id || userInfo?.user_id || '';
                      const followers = userStats?.followerCount || userInfo?.followerCount || 0;
                      const following = userStats?.followingCount || userInfo?.followingCount || 0;
                      const totalLikes = userStats?.heartCount || userStats?.heart || userInfo?.heartCount || 0;
                      const videoCount = userStats?.videoCount || userInfo?.videoCount || 0;
                      let topPosts: any[] = [];
                      if (userId) {
                                    const postsRes = await fetch(`https://tiktok-scraper7.p.rapidapi.com/user/posts?user_id=${userId}&count=30&cursor=0&sort_type=0`, { headers: { 'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com', 'x-rapidapi-key': rapidApiKey, 'Content-Type': 'application/json' }, cache: 'no-store' });
                                    if (postsRes.ok) {
                                                    const postsData = await postsRes.json();
                                                    const videos = postsData?.data?.videos || postsData?.videos || postsData?.data || [];
                                                    topPosts = (Array.isArray(videos) ? videos : []).map((v: any) => {
                                                                      const plays = v?.stats?.playCount || v?.playCount || v?.play_count || 0;
                                                                      const likes = v?.stats?.diggCount || v?.diggCount || v?.like_count || 0;
                                                                      const comments = v?.stats?.commentCount || v?.commentCount || v?.comment_count || 0;
                                                                      const shares = v?.stats?.shareCount || v?.shareCount || v?.share_count || 0;
                                                                      const engagementRate = plays > 0 ? ((likes + comments + shares) / plays) * 100 : 0;
                                                                      const thumbnail = v?.video?.cover || v?.cover || v?.thumbnail || v?.originCover || '';
                                                                      return { id: v?.id || v?.aweme_id || '', caption: v?.desc || v?.description || v?.title || '', thumbnail: thumbnail ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '', views: plays, likes, comments, shares, engagementRate, publishedAt: v?.createTime ? new Date(v.createTime * 1000).toISOString() : '', url: v?.id ? `https://www.tiktok.com/@jeffkrasno/video/${v.id}` : '' };
                                                    }).sort((a: any, b: any) => b.views - a.views);
                                    }
                      }
                      const totalViews = topPosts.reduce((s: number, p: any) => s + p.views, 0);
                      const avgEngagement = topPosts.length > 0 ? topPosts.reduce((s: number, p: any) => s + p.engagementRate, 0) / topPosts.length : 0;
                      return { profileStats: { followers, following, totalViews, avgEngagement, avgCtr: 0, videoCount, totalLikes }, topPosts, status: { connected: true } };
          } catch (err: any) { return { status: { connected: false, error: `TikTok scraper error: ${err.message}` } }; }
}

async function fetchFacebook() {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };

  try {
    const res = await fetch(
      'https://facebook-scraper-api4.p.rapidapi.com/get_facebook_pages_posts?profile_id=100032044192242&count=20',
      {
        headers: {
          'x-rapidapi-host': 'facebook-scraper-api4.p.rapidapi.com',
          'x-rapidapi-key': rapidApiKey,
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) return { status: { connected: false, error: `API error: ${res.status}` } };

    const json = await res.json();

    // Handle multiple possible response shapes from facebook-scraper-api4
    // Shape A: { data: { posts: [...] } }
    // Shape B: { data: [...] }  (array directly in data)
    // Shape C: { results: [...] }
    // Shape D: top-level array
    // Shape E: { posts: [...] }
    let rawPosts: any[] = [];
    if (Array.isArray(json?.data?.posts)) rawPosts = json.data.posts;
    else if (Array.isArray(json?.data)) rawPosts = json.data;
    else if (Array.isArray(json?.results)) rawPosts = json.results;
    else if (Array.isArray(json?.posts)) rawPosts = json.posts;
    else if (Array.isArray(json)) rawPosts = json;

    if (rawPosts.length === 0) {
      return { status: { connected: false, error: `No posts in response. Keys: ${Object.keys(json || {}).join(', ')}` } };
    }

    const topPosts = rawPosts.map((p: any) => {
      // Normalize across different field naming conventions
      const id = p?.post_id || p?.details?.post_id || p?.id || '';
      const url = p?.post_link || p?.details?.post_link || p?.permalink_url || p?.url || '';
      const caption = p?.post_text || p?.details?.post_text || p?.message || p?.story || p?.text || '';
      const likes = Number(
        p?.reactions?.total_count || p?.reactions_count || p?.reaction_count ||
        p?.likes?.count || p?.likes_count || p?.likes || p?.like_count || 0
      );
      const comments = Number(
        p?.comments?.total_count || p?.comments_count || p?.comment_count ||
        p?.comments?.count || p?.num_comments || 0
      );
      const shares = Number(
        p?.shares?.count || p?.shares_count || p?.share_count ||
        p?.shares || p?.num_shares || 0
      );
      const thumbnail =
        p?.attachment?.media?.image?.src ||
        p?.full_picture || p?.picture || p?.image || p?.thumbnail || '';
      const timestamp =
        p?.creation_time || p?.details?.creation_time ||
        p?.created_time || p?.timestamp || p?.date || '';
      const engagementRate = 0;
      return { id, url, caption, likes, comments, shares, thumbnail, timestamp, engagementRate };
    }).sort((a: any, b: any) => (b.likes + b.comments) - (a.likes + a.comments));

    const totalLikes = topPosts.reduce((s: number, p: any) => s + p.likes, 0);
    const avgEngagement = topPosts.length > 0 ? totalLikes / topPosts.length : 0;

    return {
      status: { connected: true },
      profileStats: { followers: 0, pageLikes: 0, totalReach: 0, avgEngagement },
      topPosts,
    };
  } catch (err: any) {
    return { status: { connected: false, error: `Facebook error: ${err.message}` } };
  }
}

export async function GET(request: Request) {
          const { searchParams } = new URL(request.url);
          const forceRefresh = searchParams.get('refresh') === 'true';
          const megaphoneKey = searchParams.get('megaphoneKey') || undefined;
          if (!forceRefresh && cachedData && (Date.now() - cacheTime) < CACHE_TTL) {
                      return NextResponse.json(cachedData);
          }
          const [youtube, podcast, instagram, tiktok, facebook] = await Promise.all([
                      fetchYouTube(), fetchPodcast(megaphoneKey), fetchInstagram(), fetchTikTok(), fetchFacebook(),
                    ]);
          const result = { youtube, podcast, instagram, tiktok, facebook, generatedAt: new Date().toISOString() };
          cachedData = result;
          cacheTime = Date.now();
          return NextResponse.json(result);
}
