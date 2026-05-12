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
          if (apiToken) {
                      try {
                                    const epsRes = await fetch(`https://cms.megaphone.fm/api/networks/${NETWORK_ID}/podcasts/${PODCAST_ID}/episodes?per=100`, { headers: { 'Authorization': `Token token=${apiToken}` }, cache: 'no-store' });
                                    if (epsRes.ok) {
                                                    const epsData = await epsRes.json();
                                                    const apiEpisodes = Array.isArray(epsData) ? epsData : epsData?.episodes || [];
                                                    if (apiEpisodes.length > 0) {
                                                                      const episodes = apiEpisodes.map((ep: any) => {
                                                                                          const durationSecs = parseFloat(ep.duration || ep.lengthInSeconds || '0');
                                                                                          const downloads = ep.downloads || ep.totalDownloads || ep.download_count || ep.preCount || 0;
                                                                                          const streams = ep.streams || ep.totalStreams || ep.stream_count || ep.postCount || 0;
                                                                                          return { id: ep.id || ep.uid, title: ep.title, publishedAt: ep.pubdate || ep.publishedAt || ep.pubDate || '', duration: Math.floor(durationSecs / 60), audioUrl: ep.enclosureUrl || ep.audioUrl || '', thumbnail: ep.imageUrl || ep.image || ep.thumbnailUrl || '', downloads, streams, delivered: ep.delivered || ep.totalDelivered || (downloads + streams), performanceScore: downloads + streams };
                                                                      });
                                                                      const hasAnalytics = episodes.some((e: any) => e.downloads > 0 || e.streams > 0);
                                                                      const topEpisodes = hasAnalytics ? [...episodes].sort((a: any, b: any) => b.performanceScore - a.performanceScore) : episodes;
                                                                      return { podcastName: 'Commune with Jeff Krasno', topEpisodes, episodes: topEpisodes, analyticsAvailable: hasAnalytics, apiKeyConfigured: true, totalDownloads: hasAnalytics ? episodes.reduce((s: number, e: any) => s + e.downloads, 0) : null, totalStreams: hasAnalytics ? episodes.reduce((s: number, e: any) => s + e.streams, 0) : null, status: { connected: true } };
                                                    }
                                    }
                      } catch (apiErr: any) { console.error('Megaphone API error:', apiErr.message); }
          }
          return { podcastName: 'Commune with Jeff Krasno', topEpisodes: [], episodes: [], analyticsAvailable: false, apiKeyConfigured: !!apiToken, totalDownloads: null, totalStreams: null, status: { connected: false, error: 'No API key available' } };
}

// Instagram - uses Account Data V2 (POST) which returns posts with engagement metrics
async function fetchInstagram() {
          const rapidApiKey = process.env.RAPIDAPI_KEY;
          if (!rapidApiKey) return { status: { connected: false, error: 'RAPIDAPI_KEY not configured' } };
          try {
                      const host = 'instagram-scraper-stable-api.p.rapidapi.com';
                      const headers: Record<string, string> = {
                                    'x-rapidapi-host': host,
                                    'x-rapidapi-key': rapidApiKey,
                                    'Content-Type': 'application/json',
                      };

            // Account Data V2 (POST) returns user + posts with like_count, comment_count, video_view_count
                      const res = await fetch(`https://${host}/ig_get_fb_profile_hover.php?username_or_url=jeffkrasno`, { headers: jsonHeaders, cache: 'no-store' });
                                    hrow new Error(`Instagram API error: ${res.status}`);
                      const data = await res.json();

            // Try Account Data V2 response shape first, then fall back to profile hover shape
            const userData = data?.user_data || data?.data?.user || data?.data || data;
                      const followers = Number(userData?.follower_count || userData?.edge_followed_by?.count || 0);
                      const postsCount = Number(userData?.media_count || userData?.edge_owner_to_timeline_media?.count || 0);

            // Posts come from edge_owner_to_timeline_media.edges or user_posts
            const edgePosts = userData?.edge_owner_to_timeline_media?.edges || [];
                      const userPosts = data?.user_posts || [];
                      const rawPosts = edgePosts.length > 0 ? edgePosts : (Array.isArray(userPosts) ? userPosts : []);

            const topPosts = rawPosts.map((p: any) => {
                          const node = p?.node || p;
                          const views = Number(node?.video_view_count || node?.view_count || node?.play_count || 0);
                          const likes = Number(node?.like_count || node?.edge_media_preview_like?.count || node?.edge_liked_by?.count || node?.likes_count || 0);
                          const comments = Number(node?.comment_count || node?.edge_media_to_comment?.count || node?.comments_count || 0);
                          const engagementRate = followers > 0 ? ((likes + comments) / followers) * 100 : 0;
                          const imgCandidates = node?.image_versions2?.candidates || node?.display_resources || [];
                          const thumbnail = imgCandidates[0]?.url || node?.display_url || node?.thumbnail_url || node?.thumbnail_src || '';
                          const caption = node?.caption?.text || node?.edge_media_to_caption?.edges?.[0]?.node?.text || node?.accessibility_caption || '';
                          const takenAt = node?.taken_at || node?.taken_at_timestamp;
                          const publishedAt = takenAt ? new Date(Number(takenAt) * 1000).toISOString() : '';
                          const shortcode = node?.shortcode || node?.code || '';
                          return {
                                          id: String(node?.id || shortcode),
                                          caption,
                                          thumbnail: thumbnail ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '',
                                          views, likes, comments, engagementRate, publishedAt,
                                          url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : '',
                          };
            })
                      .sort((a: any, b: any) => {
                                    const aScore = a.views > 0 ? a.views : a.likes;
                                    const bScore = b.views > 0 ? b.views : b.likes;
                                    return bScore - aScore;
                      });

            const totalViews = topPosts.reduce((s: number, p: any) => s + (p.views || 0), 0);
                      const avgEngagement = topPosts.length > 0 ? topPosts.reduce((s: number, p: any) => s + p.engagementRate, 0) / topPosts.length : 0;
                      return { profileStats: { followers, postsCount, totalViews, avgEngagement }, topPosts, status: { connected: true } };
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
          const host = 'facebook-scraper-api4.p.rapidapi.com';
          const headers = { 'x-rapidapi-host': host, 'x-rapidapi-key': rapidApiKey, 'Content-Type': 'application/json' };
        const attempts = [
          `https://facebook-scraper-api4.p.rapidapi.com/get_facebook_pages_posts?facebook_id=100032044192242&count=20`,
        ];
          let rawPosts: any[] = [];
          let pageInfo: any = {};
          const debugLog: string[] = [];
          for (const url of attempts) {
                      try {
                                    const res = await fetch(url, { headers, cache: 'no-store' });
                                    const statusCode = res.status;
                                    if (!res.ok) { debugLog.push(`${statusCode}:${url.split('?')[0].split('/').pop()}`); continue; }
                                    const json = await res.json();
                                    const topLevelKeys = Object.keys(json).join(',');
                                    const posts = json?.data?.posts || json?.posts || json?.data || json?.results || json?.items || [];
                                    pageInfo = json?.page || json?.page_info || json?.meta || {};
                                    debugLog.push(`200:keys=${topLevelKeys}:posts=${Array.isArray(posts) ? posts.length : 'N'}`);
                                    if (Array.isArray(posts) && posts.length > 0) { rawPosts = posts; break; }
                                    if (Array.isArray(json) && json.length > 0) { rawPosts = json; break; }
                      } catch (e: any) { debugLog.push(`ERR:${e.message}`); }
          }
          if (rawPosts.length === 0) {
                      return { status: { connected: false, error: `Facebook no data. ${debugLog.join(' | ')}` } };
          }
          const followers = Number(pageInfo?.followers_count || pageInfo?.fan_count || pageInfo?.followers || 0);
          const pageLikes = Number(pageInfo?.fan_count || pageInfo?.likes || followers);
          const topPosts = rawPosts.map((p: any) => {
                      const likes = Number(p?.reactions?.total_count || p?.likes?.count || p?.like_count || p?.reactions || 0);
                      const comments = Number(p?.comments?.total_count || p?.comments?.count || p?.comment_count || 0);
                      const shares = Number(p?.shares?.count || p?.share_count || p?.shares || 0);
                      const reach = Number(p?.insights?.reach || p?.reach || 0);
                      const engagementScore = likes + comments + shares;
                      const thumbnail = p?.full_picture || p?.picture || p?.attachments?.[0]?.media?.image?.src || '';
                      const isBadUrl = thumbnail && thumbnail.includes('facebook.com/') && !thumbnail.includes('fbcdn') && !thumbnail.includes('akamaihd');
                      return { id: p?.post_id || p?.id || '', caption: p?.message || p?.story || p?.description || '', thumbnail: (thumbnail && !isBadUrl) ? `/api/proxy/image?url=${encodeURIComponent(thumbnail)}` : '', likes, comments, shares, reach, engagementScore, publishedAt: p?.created_time || p?.timestamp || p?.date || '', url: p?.post_url || p?.permalink_url || '' };
          }).sort((a: any, b: any) => b.engagementScore - a.engagementScore);
          const totalReach = topPosts.reduce((s: number, p: any) => s + p.reach, 0);
          const avgEngagement = topPosts.length > 0 ? topPosts.reduce((s: number, p: any) => s + p.engagementScore, 0) / topPosts.length : 0;
          return { profileStats: { followers, pageLikes, totalReach, avgEngagement }, topPosts, status: { connected: true } };
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
