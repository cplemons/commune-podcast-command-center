import { NextResponse } from 'next/server';

// ─ In-memory cache (single session) ──────────────────────────────────────────
let cachedData: any = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ─ YouTube ───────────────────────────────────────────────────────────────────
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

// ─ Megaphone ─────────────────────────────────────────────────────────────────
async function fetchPodcast(megaphoneApiKey?: string) {
    const NETWORK_ID = '92d07666-568b-11f0-905f-27d2b3e735f9';
    const PODCAST_ID = '83bda43e-5846-11f0-9c25-6747adca5027';
    const apiToken = megaphoneApiKey || process.env.MEGAPHONE_API_TOKEN;

  if (apiToken) {
        try {
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

  const RSS_URLS = ['https://feeds.megaphone.fm/SWDG4803951965'];
    let rssText = '';
    for (const rssUrl of RSS_URLS) {
          try {
                  const r = await fetch(rssUrl, { cache: 'no-store' });
                  if (r.ok) { const t = await r.text(); if (t.includes('Commune') && t.includes('<item>')) { rssText = t; break; } }
          } catch (_) {}
    }
    if (!rssText) {
          return {
                  podcastName: 'Commune with Jeff Krasno',
                  topEpisodes: [], episodes: [],
                  analyticsAvailable: false,
                  apiKeyConfigured: !!apiToken,
                  totalDownloads: null, totalStreams: null,
                  status: { connected: false, error: 'No API key or RSS feed available' },
          };
    }
    const items = rssText.split('<item>').slice(1);
    const episodes = items.slice(0, 50).map((item: string) => {
          const title = item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
          const duration = item.match(/<itunes:duration>(.*?)<\/itunes:duration>/)?.[1] || '0';
          const audioUrl = item.match(/url="([^"]+\.mp3[^"]*?)"/)?.[1] || '';
          const thumbnail = item.match(/<itunes:image href="([^"]+)"/)?.[1] || '';
          const durationMins = duration.includes(':')
            ? parseInt(duration.split(':')[0]) * 60 + parseInt(duration.split(':')[1] || '0')
                  : Math.floor(parseInt(duration) / 60);
          return { id: Math.random().toString(36), title, publishedAt: pubDate, duration: durationMins, audioUrl, thumbnail, downloads: 0, streams: 0, delivered: 0, performanceScore: 0 };
    });
    return {
          podcastName: 'Commune with Jeff Krasno',
          topEpisodes: episodes, episodes,
          analyticsAvailable: false,
          apiKeyConfigured: false,
          totalDownloads: null, totalStreams: null,
          status: { connected: true, source: 'rss' },
    };
}

// ─ Instagram (RapidAPI) ───────────────────────────────────────────────────────
async function fetchInstagram() {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };
    try {
          const res = await fetch(
                  'https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=jeffkrasno',
            {
                      headers: {
                                  'x-rapidapi-host': 'instagram-scraper-stable-api.p.rapidapi.com',
                                  'x-rapidapi-key': rapidApiKey,
                                  'Content-Type': 'application/json',
                      },
                      cache: 'no-store',
            }
                );
          if (!res.ok) throw new Error(`Instagram API error: ${res.status}`);
          const data = await res.json();
          const user = data?.user_data || data?.data || data;
          const posts = data?.user_posts || data?.posts || [];
          const topPosts = posts.map((p: any) => {
                  const node = p?.node || p;
                  const imgCandidates = node?.image_versions2?.candidates || node?.display_resources || [];
                  const thumbnail = imgCandidates[0]?.url || node?.display_url || node?.thumbnail_url || '';
                  const views = node?.view_count || node?.video_view_count || node?.play_count || 0;
                  const likes = node?.like_count || node?.edge_liked_by?.count || node?.likes_count || 0;
                  const comments = node?.comment_count || node?.edge_media_to_comment?.count || 0;
                  const engagementRate = (views || likes) > 0 ? ((likes + comments) / Math.max(views, likes, 1)) * 100 : 0;
                  return {
                            id: node?.id || node?.code || node?.shortcode || '',
                            caption: node?.caption?.text || node?.accessibility_caption || node?.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                            thumbnail: thumbnail ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '',
                            likes,
                            comments,
                            views,
                            engagementRate,
                            publishedAt: node?.taken_at ? new Date(node.taken_at * 1000).toISOString() : node?.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : '',
                            url: node?.code ? `https://www.instagram.com/p/${node.code}/` : '',
                  };
          }).sort((a: any, b: any) => (b.views || b.likes) - (a.views || a.likes));
          const followers = user?.follower_count || user?.followers || user?.edge_followed_by?.count || 0;
          const following = user?.following_count || user?.following || user?.edge_follow?.count || 0;
          const postsCount = user?.media_count || user?.posts_count || user?.edge_owner_to_timeline_media?.count || 0;
          const totalViews = topPosts.reduce((s: number, p: any) => s + (p.views || 0), 0);
          const avgEngagement = topPosts.length > 0 ? topPosts.reduce((s: number, p: any) => s + p.engagementRate, 0) / topPosts.length : 0;
          return {
                  profileStats: { followers, following, totalViews, avgEngagement, postsCount },
                  topPosts,
                  status: { connected: true },
          };
    } catch (err: any) { return { status: { connected: false, error: `Instagram scraper error: ${err.message}` } }; }
}

// ─ TikTok (RapidAPI) ─────────────────────────────────────────────────────────
async function fetchTikTok() {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };
    try {
          // First get user detail by unique_id (username)
      const userRes = await fetch(
              'https://tiktok-scraper7.p.rapidapi.com/user/info?unique_id=jeffkrasno',
        {
                  headers: {
                              'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
                              'x-rapidapi-key': rapidApiKey,
                              'Content-Type': 'application/json',
                  },
                  cache: 'no-store',
        }
            );
          if (!userRes.ok) throw new Error(`TikTok API error: ${userRes.status}`);
          const userData = await userRes.json();
          const userInfo = userData?.data?.user || userData?.user || userData?.data || userData;
          const userStats = userData?.data?.stats || userData?.stats || {};
          const userId = userInfo?.id || userInfo?.user_id || '';
          const followers = userStats?.followerCount || userInfo?.followerCount || 0;
          const following = userStats?.followingCount || userInfo?.followingCount || 0;
          const totalLikes = userStats?.heartCount || userStats?.heart || userInfo?.heartCount || 0;
          const videoCount = userStats?.videoCount || userInfo?.videoCount || 0;

      // Fetch top posts using user_id
      let topPosts: any[] = [];
          if (userId) {
                  const postsRes = await fetch(
                            `https://tiktok-scraper7.p.rapidapi.com/user/posts?user_id=${userId}&count=30&cursor=0&sort_type=0`,
                    {
                                headers: {
                                              'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
                                              'x-rapidapi-key': rapidApiKey,
                                              'Content-Type': 'application/json',
                                },
                                cache: 'no-store',
                    }
                          );
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
                                        return {
                                                      id: v?.id || v?.aweme_id || '',
                                                      caption: v?.desc || v?.description || v?.title || '',
                                                      thumbnail: thumbnail ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '',
                                                      views: plays,
                                                      likes,
                                                      comments,
                                                      shares,
                                                      engagementRate,
                                                      publishedAt: v?.createTime ? new Date(v.createTime * 1000).toISOString() : v?.create_time ? new Date(v.create_time * 1000).toISOString() : '',
                                                      url: v?.id ? `https://www.tiktok.com/@jeffkrasno/video/${v.id}` : '',
                                        };
                            }).sort((a: any, b: any) => b.views - a.views);
                  }
          }

      const totalViews = topPosts.reduce((s: number, p: any) => s + p.views, 0);
          const avgEngagement = topPosts.length > 0 ? topPosts.reduce((s: number, p: any) => s + p.engagementRate, 0) / topPosts.length : 0;
          const avgCtr = 0;
          return {
                  profileStats: { followers, following, totalViews, avgEngagement, avgCtr, videoCount, totalLikes },
                  topPosts,
                  status: { connected: true },
          };
    } catch (err: any) { return { status: { connected: false, error: `TikTok scraper error: ${err.message}` } }; }
}

// ─ Facebook (RapidAPI) ───────────────────────────────────────────────────────
async function fetchFacebook() {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };
    try {
          const postsRes = await fetch(
                  'https://facebook-scraper3.p.rapidapi.com/page/posts?page_id=jeffpatrickkrasno&count=30',
            {
                      headers: {
                                  'x-rapidapi-host': 'facebook-scraper3.p.rapidapi.com',
                                  'x-rapidapi-key': rapidApiKey,
                                  'Content-Type': 'application/json',
                      },
                      cache: 'no-store',
            }
                );
          if (!postsRes.ok) throw new Error(`Facebook API error: ${postsRes.status}`);
          const postsData = await postsRes.json();
          const rawPosts = postsData?.data || postsData?.posts || postsData?.results || [];
          const pageInfo = postsData?.page || postsData?.page_info || {};
          const followers = pageInfo?.followers_count || pageInfo?.fan_count || pageInfo?.followers || 0;
          const pageLikes = pageInfo?.fan_count || pageInfo?.likes || followers;
          const topPosts = (Array.isArray(rawPosts) ? rawPosts : []).map((p: any) => {
                  const likes = p?.reactions?.total_count || p?.likes?.count || p?.like_count || p?.reactions || 0;
                  const comments = p?.comments?.total_count || p?.comments?.count || p?.comment_count || p?.comments || 0;
                  const shares = p?.shares?.count || p?.share_count || p?.shares || 0;
                  const reach = p?.insights?.reach || p?.reach || 0;
                  const engagement = (typeof likes === 'number' ? likes : 0) + (typeof comments === 'number' ? comments : 0) + (typeof shares === 'number' ? shares : 0);
                  const thumbnail = p?.full_picture || p?.picture || p?.attachments?.[0]?.media?.image?.src || p?.media?.[0]?.image?.src || '';
                  const isFbUrl = thumbnail && (thumbnail.includes('facebook.com') && !thumbnail.includes('fbcdn') && !thumbnail.includes('akamaihd'));
                  return {
                            id: p?.post_id || p?.id || '',
                            caption: p?.message || p?.story || p?.description || '',
                            thumbnail: (thumbnail && !isFbUrl) ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '',
                            likes: typeof likes === 'number' ? likes : 0,
                            comments: typeof comments === 'number' ? comments : 0,
                            shares: typeof shares === 'number' ? shares : 0,
                            reach,
                            engagementScore: engagement,
                            publishedAt: p?.created_time || p?.timestamp || p?.date || '',
                            url: p?.post_url || p?.permalink_url || '',
                  };
          }).sort((a: any, b: any) => b.engagementScore - a.engagementScore);
          const totalReach = topPosts.reduce((s: number, p: any) => s + p.reach, 0);
          const avgEngagement = topPosts.length > 0
            ? topPosts.reduce((s: number, p: any) => s + p.engagementScore, 0) / topPosts.length : 0;
          return {
                  profileStats: { followers, pageLikes, totalReach, avgEngagement },
                  topPosts,
                  status: { connected: true },
          };
    } catch (err: any) { return { status: { connected: false, error: `Facebook scraper error: ${err.message}` } }; }
}

// ─ GET handler ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const megaphoneKey = searchParams.get('megaphoneKey') || undefined;

  if (!forceRefresh && cachedData && (Date.now() - cacheTime) < CACHE_TTL) {
        return NextResponse.json(cachedData);
  }

  const [youtube, podcast, instagram, tiktok, facebook] = await Promise.all([
        fetchYouTube(),
        fetchPodcast(megaphoneKey),
        fetchInstagram(),
        fetchTikTok(),
        fetchFacebook(),
      ]);

  const result = {
        youtube,
        podcast,
        instagram,
        tiktok,
        facebook,
        generatedAt: new Date().toISOString(),
  };

  cachedData = result;
    cacheTime = Date.now();

  return NextResponse.json(result);
}
