'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface VideoItem { id: string; title: string; thumbnail: string; views: number; likes: number; comments: number; duration: string; publishedAt: string; engagementRate: number; }
interface PostItem { id: string; caption: string; thumbnail: string; likes: number; comments: number; views: number; publishedAt?: string; url?: string; shares?: number; engagement?: number; }
interface EpisodeItem { id: string; title: string; publishedAt: string; duration: number; audioUrl: string; thumbnail: string; downloads: number; streams: number; delivered: number; performanceScore: number; }
interface DashData {
  youtube?: { channelStats?: { subscribers: number; totalViews: number; videoCount: number; avgEngagement: number; }; topVideos?: VideoItem[]; videos?: VideoItem[]; status?: { connected: boolean; error?: string }; };
  podcast?: { podcastName?: string; topEpisodes?: EpisodeItem[]; episodes?: EpisodeItem[]; analyticsAvailable?: boolean; apiKeyConfigured?: boolean; totalDownloads?: number | null; totalStreams?: number | null; status?: { connected: boolean; error?: string }; };
  instagram?: { profileStats?: { followers: number; totalViews: number; avgEngagement: number; postsCount: number; }; topPosts?: PostItem[]; status?: { connected: boolean; error?: string }; };
  tiktok?: { profileStats?: { followers: number; following: number; totalViews: number; avgEngagement: number; avgCtr: number; }; topPosts?: PostItem[]; status?: { connected: boolean; error?: string }; };
  facebook?: { profileStats?: { followers: number; pageLikes: number; totalReach: number; avgEngagement: number; }; topPosts?: PostItem[]; status?: { connected: boolean; error?: string; note?: string; }; };
  generatedAt?: string;
}

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  if ((n as number) >= 1000000) return ((n as number) / 1000000).toFixed(1) + 'M';
  if ((n as number) >= 1000) return ((n as number) / 1000).toFixed(1) + 'K';
  return String(Math.round(n as number));
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  return (n as number).toFixed(2) + '%';
}
function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function proxyImg(url: string): string {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  if (url.includes('ytimg.com') || url.includes('googleusercontent')) return url;
  return '/api/proxy/image?url=' + encodeURIComponent(url);
}

interface GuestStat { guest: string; avgPerformance: number; appearances: number; platform: string; }
interface TopicStat { topic: string; avgPerformance: number; count: number; }
interface PerfExtreme { platform: string; best?: { title: string; value: number; metric: string }; worst?: { title: string; value: number; metric: string }; }

const TOPIC_KEYWORDS: Record<string, string[]> = {
  'Health & Wellness': ['health', 'wellness', 'gut', 'microbe', 'food', 'diet', 'metabolic', 'blood sugar', 'immune', 'disease', 'medicine', 'sleep', 'melatonin', 'peptide', 'glp', 'cgm', 'oura', 'whoop', 'back pain', 'spine'],
  'Spirituality': ['spiritual', 'consciousness', 'meditation', 'psychedelic', 'healing', 'soul', 'inner', 'transform', 'mindful', 'wisdom', 'tao'],
  'Politics & Society': ['political', 'politics', 'regime', 'middle east', 'history', 'trump', 'america', 'iran', 'war', 'election', 'democracy', 'evolution', 'tucker'],
  'Business': ['business', 'billion', 'strategy', 'entrepreneur', 'brand', 'company', 'startup', 'market', 'build', 'growth'],
  'Personal Development': ['change', 'challenge', 'transformation', 'habit', 'goal', 'purpose', 'motivation', 'stress', 'resilience', 'mindset'],
  'Environment': ['garden', 'nature', 'environment', 'climate', 'dolphin', 'ocean', 'earth', 'victory garden', 'plant'],
  'Mental Health': ['mental health', 'ptsd', 'therapy', 'psychotherapy', 'trauma', 'depression', 'anxiety'],
  'Relationships': ['relationship', 'love', 'family', 'marriage', 'connection', 'community'],
};

function extractGuest(title: string): string | null {
  const withMatch = title.match(/\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,2})/);
  if (withMatch) {
    const name = withMatch[1].trim();
    const skip = ['The','This','What','How','Why','When','Jeff','Commune'];
    if (!skip.includes(name.split(' ')[0])) return name;
  }
  const colonMatch = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,2}):/);
  if (colonMatch) {
    const name = colonMatch[1].trim();
    const skip = ['The','This','What','How','Why','When','Jeff','Commune','Make','Back','Small','Good','Health'];
    if (!skip.includes(name.split(' ')[0]) && name.split(' ').length >= 2) return name;
  }
  return null;
}

function classifyTopic(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return topic;
  }
  return null;
}

function analyzeContent(data: DashData) {
  const guestMap: Record<string, { total: number; count: number; platform: string }> = {};
  const topicMap: Record<string, { total: number; count: number }> = {};
  const extremes: PerfExtreme[] = [];

  function addGuest(name: string, val: number, plat: string) {
    if (!guestMap[name]) guestMap[name] = { total: 0, count: 0, platform: plat };
    guestMap[name].total += val; guestMap[name].count++;
  }
  function addTopic(text: string, val: number) {
    const t = classifyTopic(text);
    if (!t) return;
    if (!topicMap[t]) topicMap[t] = { total: 0, count: 0 };
    topicMap[t].total += val; topicMap[t].count++;
  }

  const ytVideos = data.youtube?.topVideos || data.youtube?.videos || [];
  if (ytVideos.length > 0) {
    ytVideos.forEach(v => { const g = extractGuest(v.title); if (g) addGuest(g, v.views, 'YouTube'); addTopic(v.title, v.views); });
    const s = [...ytVideos].sort((a,b) => b.views - a.views);
    extremes.push({ platform: 'YouTube', best: { title: s[0].title, value: s[0].views, metric: 'views' }, worst: { title: s[s.length-1].title, value: s[s.length-1].views, metric: 'views' } });
  }
  const igPosts = data.instagram?.topPosts || [];
  if (igPosts.length > 0) {
    igPosts.forEach(p => { const g = extractGuest(p.caption); if (g) addGuest(g, p.views||p.likes, 'Instagram'); addTopic(p.caption, p.views||p.likes); });
    const s = [...igPosts].sort((a,b) => (b.views||b.likes) - (a.views||a.likes));
    extremes.push({ platform: 'Instagram', best: { title: s[0].caption, value: s[0].views||s[0].likes, metric: s[0].views>0?'views':'likes' }, worst: { title: s[s.length-1].caption, value: s[s.length-1].views||s[s.length-1].likes, metric: 'engagement' } });
  }
  const ttPosts = data.tiktok?.topPosts || [];
  if (ttPosts.length > 0) {
    ttPosts.forEach(p => { const g = extractGuest(p.caption); if (g) addGuest(g, p.views, 'TikTok'); addTopic(p.caption, p.views); });
    const s = [...ttPosts].sort((a,b) => b.views - a.views);
    extremes.push({ platform: 'TikTok', best: { title: s[0].caption, value: s[0].views, metric: 'views' }, worst: { title: s[s.length-1].caption, value: s[s.length-1].views, metric: 'views' } });
  }
  const eps = data.podcast?.topEpisodes || data.podcast?.episodes || [];
  if (eps.length > 0 && data.podcast?.analyticsAvailable) {
    eps.forEach(ep => { const g = extractGuest(ep.title); if (g) addGuest(g, ep.downloads+ep.streams, 'Podcast'); addTopic(ep.title, ep.downloads+ep.streams); });
    const s = [...eps].sort((a,b) => (b.downloads+b.streams)-(a.downloads+a.streams));
    if (s[0].downloads > 0) extremes.push({ platform: 'Podcast', best: { title: s[0].title, value: s[0].downloads+s[0].streams, metric: 'downloads' }, worst: { title: s[s.length-1].title, value: s[s.length-1].downloads+s[s.length-1].streams, metric: 'downloads' } });
  }

  const guests: GuestStat[] = Object.entries(guestMap).map(([g, s]) => ({ guest: g, avgPerformance: Math.round(s.total/s.count), appearances: s.count, platform: s.platform })).sort((a,b) => b.avgPerformance - a.avgPerformance).slice(0,8);
  const topics: TopicStat[] = Object.entries(topicMap).map(([t, s]) => ({ topic: t, avgPerformance: Math.round(s.total/s.count), count: s.count })).sort((a,b) => b.avgPerformance - a.avgPerformance).slice(0,6);
  return { guests, topics, extremes };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4">
      <div className="text-xs text-[#8a7060] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-[#6a5a4a] mt-1">{sub}</div>}
    </div>
  );
}

function NotConnected({ platform, error }: { platform: string; error?: string }) {
  return (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-6 text-center">
      <div className="text-4xl mb-3">🔌</div>
      <div className="text-white font-semibold mb-1">{platform} not connected</div>
      {error && <div className="text-xs text-[#8a7060] mt-1">{error}</div>}
    </div>
  );
}

function PostCard({ post, metric }: { post: PostItem; metric: string }) {
  const [imgErr, setImgErr] = useState(false);
  const perf = metric === 'views' ? post.views : metric === 'likes' ? post.likes : (post.engagement || post.likes + post.comments);
  const thumb = proxyImg(post.thumbnail);
  return (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden">
      <div className="h-36 bg-[#0f0d0a] relative">
        {thumb && !imgErr ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#3a2a1a] text-4xl">📸</div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-[#ccc] line-clamp-2 mb-2">{post.caption}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-amber-400 font-semibold">{fmt(perf)} {metric}</span>
          <span className="text-[#6a5a4a]">{timeAgo(post.publishedAt||'')}</span>
        </div>
        <div className="flex gap-3 mt-1 text-xs text-[#6a5a4a]">
          <span>&#9829; {fmt(post.likes)}</span>
          <span>&#128172; {fmt(post.comments)}</span>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: VideoItem }) {
  function parseDur(iso: string) {
    const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '';
    const h=parseInt(m[1]||'0'),mn=parseInt(m[2]||'0'),s=parseInt(m[3]||'0');
    return h>0 ? h+':'+String(mn).padStart(2,'0')+':'+String(s).padStart(2,'0') : mn+':'+String(s).padStart(2,'0');
  }
  return (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden">
      <div className="h-36 bg-[#0f0d0a] relative">
        {video.thumbnail ? <img src={video.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl text-[#3a2a1a]">&#9654;</div>}
        {video.duration && <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">{parseDur(video.duration)}</span>}
      </div>
      <div className="p-3">
        <p className="text-xs text-[#ccc] line-clamp-2 mb-2">{video.title}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-amber-400 font-semibold">{fmt(video.views)} views</span>
          <span className="text-[#8a7060]">{fmtPct(video.engagementRate)} eng</span>
        </div>
        <div className="flex gap-3 mt-1 text-xs text-[#6a5a4a]">
          <span>&#128077; {fmt(video.likes)}</span>
          <span>&#128172; {fmt(video.comments)}</span>
        </div>
      </div>
    </div>
  );
}

function EpisodeCard({ ep, analytics }: { ep: EpisodeItem; analytics: boolean }) {
  const [imgErr, setImgErr] = useState(false);
  const thumb = proxyImg(ep.thumbnail);
  return (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden">
      <div className="h-32 bg-[#0f0d0a]">
        {thumb && !imgErr ? <img src={thumb} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} /> : <div className="w-full h-full flex items-center justify-center text-5xl text-[#3a2a1a]">&#127897;</div>}
      </div>
      <div className="p-3">
        <p className="text-xs text-[#ccc] line-clamp-2 mb-2">{ep.title}</p>
        <div className="text-xs text-[#8a7060]">&#9201; {ep.duration}m</div>
        {analytics ? (
          <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
            <div className="text-amber-400">&#8595; {fmt(ep.downloads)}</div>
            <div className="text-blue-400">&#9654; {fmt(ep.streams)}</div>
          </div>
        ) : <div className="text-xs text-[#4a3a2a] mt-1 italic">analytics locked</div>}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-[#12100e] border border-[#2a2118] rounded-2xl overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#1a1612] transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <span className="text-white font-semibold text-lg">{title}</span>
        </div>
        <span className="text-[#6a5a4a]">{open ? '∧' : '∨'}</span>
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(30);
  const [megaphoneKey, setMegaphoneKey] = useState('');
  const [mkInput, setMkInput] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (key?: string) => {
    setLoading(true);
    try {
      const k = key !== undefined ? key : megaphoneKey;
      const url = k ? '/api/dashboard?megaphoneKey=' + encodeURIComponent(k) : '/api/dashboard';
      const res = await fetch(url, { cache: 'no-store' });
      setData(await res.json());
      setLastUpdated(new Date());
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [megaphoneKey]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (autoRefresh > 0) timer.current = setInterval(() => loadData(), autoRefresh * 60000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [autoRefresh, loadData]);

  const yt = data?.youtube;
  const pod = data?.podcast;
  const ig = data?.instagram;
  const tt = data?.tiktok;
  const fb = data?.facebook;
  const ytVideos = yt?.topVideos || yt?.videos || [];
  const episodes = pod?.topEpisodes || pod?.episodes || [];
  const igPosts = ig?.topPosts || [];
  const ttPosts = tt?.topPosts || [];
  const fbPosts = fb?.topPosts || [];
  const analysis = data ? analyzeContent(data) : null;

  return (
    <div className="min-h-screen bg-[#0c0a08] text-white">
      <header className="sticky top-0 z-50 bg-[#0c0a08]/95 backdrop-blur border-b border-[#2a2118] px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Commune Podcast</h1>
            <p className="text-xs text-[#6a5a4a]">Command Center &middot; {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={autoRefresh} onChange={e=>setAutoRefresh(Number(e.target.value))} className="bg-[#1a1612] border border-[#2a2118] text-sm text-white rounded-lg px-3 py-2 focus:outline-none">
              <option value={0}>No auto-refresh</option>
              <option value={15}>Auto-refresh: 15m</option>
              <option value={30}>Auto-refresh: 30m</option>
              <option value={60}>Auto-refresh: 60m</option>
            </select>
            <button onClick={()=>loadData()} disabled={loading} className="bg-[#1a1612] border border-[#2a2118] text-sm text-white rounded-lg px-4 py-2 hover:bg-[#2a2118] disabled:opacity-50 flex items-center gap-2">
              <span className={loading?'inline-block animate-spin':''}>&#8635;</span> {loading?'Loading...':'Refresh'}
            </button>
            {lastUpdated && <span className="text-xs text-[#6a5a4a]">Updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        <div className="grid grid-cols-5 gap-4 bg-[#12100e] border border-[#2a2118] rounded-2xl p-4">
          <div className="text-center"><div className="text-xs text-[#8a7060] uppercase tracking-wider mb-1">YouTube Subscribers</div><div className="text-2xl font-bold">{fmt(yt?.channelStats?.subscribers)}</div><div className="text-xs text-[#6a5a4a]">{fmt(yt?.channelStats?.totalViews)} total views</div></div>
          <div className="text-center"><div className="text-xs text-[#8a7060] uppercase tracking-wider mb-1">Podcast Episodes</div><div className="text-2xl font-bold">{episodes.length||'—'}</div><div className="text-xs text-[#6a5a4a]">{pod?.podcastName||'Commune with Jeff Krasno'}</div></div>
          <div className="text-center"><div className="text-xs text-[#8a7060] uppercase tracking-wider mb-1">Instagram</div><div className="text-2xl font-bold">{fmt(ig?.profileStats?.followers)}</div><div className="text-xs text-[#6a5a4a]">followers</div></div>
          <div className="text-center"><div className="text-xs text-[#8a7060] uppercase tracking-wider mb-1">TikTok</div><div className="text-2xl font-bold">{fmt(tt?.profileStats?.followers)}</div><div className="text-xs text-[#6a5a4a]">followers</div></div>
          <div className="text-center"><div className="text-xs text-[#8a7060] uppercase tracking-wider mb-1">Facebook</div><div className="text-2xl font-bold">{fbPosts.length>0?fbPosts.length+' posts':'—'}</div><div className="text-xs text-[#6a5a4a]">@jeffpatrickkrasno</div></div>
        </div>

        <Section icon="&#9654;" title="YouTube — @jeffkrasno">
          {yt?.status?.connected===false ? <NotConnected platform="YouTube" error={yt.status.error} /> : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Subscribers" value={fmt(yt?.channelStats?.subscribers)} />
                <StatCard label="Total Views" value={fmt(yt?.channelStats?.totalViews)} />
                <StatCard label="Videos" value={fmt(yt?.channelStats?.videoCount)} />
                <StatCard label="Avg Engagement" value={fmtPct(yt?.channelStats?.avgEngagement)} />
              </div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Top Videos by Views</div>
              <div className="grid grid-cols-4 gap-4">{ytVideos.slice(0,8).map(v=><VideoCard key={v.id} video={v}/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#127897;" title="Commune Podcast — Megaphone">
          {pod?.status?.connected===false ? <NotConnected platform="Podcast" error={pod.status.error} /> : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Total Episodes" value={String(episodes.length||'—')} />
                <StatCard label="Total Downloads" value={pod?.totalDownloads!=null?fmt(pod.totalDownloads):'—'} sub={pod?.totalDownloads==null?'analytics unavailable':undefined} />
                <StatCard label="Total Streams" value={pod?.totalStreams!=null?fmt(pod.totalStreams):'—'} sub={pod?.totalStreams==null?'analytics unavailable':undefined} />
                <StatCard label="Avg Listen Time" value="—" sub="analytics unavailable" />
              </div>
              {!pod?.analyticsAvailable && (
                <div className="bg-[#1a1410] border border-[#3a2a10] rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">&#128273;</span>
                    <div className="flex-1">
                      <div className="font-semibold text-amber-400 mb-1">Enter your Megaphone API key to unlock analytics</div>
                      <div className="text-xs text-[#8a7060] mb-3">Episode download counts, stream counts, and consumption time require Megaphone API access. Find your key at <strong className="text-white">cms.megaphone.fm &#x2192; Settings &#x2192; API</strong>.</div>
                      <div className="flex gap-2">
                        <input type="password" value={mkInput} onChange={e=>setMkInput(e.target.value)} placeholder="Enter Megaphone API key..." className="flex-1 bg-[#0c0a08] border border-[#3a2a10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500" onKeyDown={e=>{if(e.key==='Enter'){setMegaphoneKey(mkInput);loadData(mkInput);}}} />
                        <button onClick={()=>{setMegaphoneKey(mkInput);loadData(mkInput);}} className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg">Connect</button>
                      </div>
                      <div className="text-xs text-[#6a5a4a] mt-2">Note: Your account may also need the <strong className="text-white">Analytics add-on</strong> enabled at cms.megaphone.fm for episode-level stats.</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">{pod?.analyticsAvailable?'Top Episodes by Downloads':'Recent Episodes — connect API above for performance ranking'}</div>
              <div className="grid grid-cols-4 gap-4">{episodes.slice(0,8).map(ep=><EpisodeCard key={ep.id} ep={ep} analytics={!!pod?.analyticsAvailable}/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#128247;" title="Instagram — @jeffkrasno">
          {ig?.status?.connected===false ? <NotConnected platform="Instagram" error={ig.status.error} /> : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Followers" value={fmt(ig?.profileStats?.followers)} />
                <StatCard label="Total Views" value={fmt(ig?.profileStats?.totalViews)} />
                <StatCard label="Avg Engagement" value={fmtPct(ig?.profileStats?.avgEngagement)} />
                <StatCard label="Posts" value={String(igPosts.length)} />
              </div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Top Posts by Views</div>
              <div className="grid grid-cols-4 gap-4">{igPosts.slice(0,8).map(p=><PostCard key={p.id} post={p} metric="views"/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#127925;" title="TikTok — @jeffkrasno">
          {tt?.status?.connected===false ? <NotConnected platform="TikTok" error={tt.status.error} /> : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Followers" value={fmt(tt?.profileStats?.followers)} />
                <StatCard label="Total Views" value={fmt(tt?.profileStats?.totalViews)} />
                <StatCard label="Avg Engagement" value={fmtPct(tt?.profileStats?.avgEngagement)} />
                <StatCard label="Avg CTR" value={fmtPct(tt?.profileStats?.avgCtr)} />
              </div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Top Posts by Views</div>
              <div className="grid grid-cols-4 gap-4">{ttPosts.slice(0,8).map(p=><PostCard key={p.id} post={p} metric="views"/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#128100;" title="Facebook — @jeffpatrickkrasno">
          {fb?.status?.connected===false ? (
            <div className="space-y-4">
              <NotConnected platform="Facebook" error={fb?.status?.error} />
              <div className="bg-[#1a1410] border border-[#3a2a10] rounded-xl p-4">
                <div className="font-semibold text-amber-400 mb-2">To connect Facebook with follower counts:</div>
                <div className="text-xs text-[#8a7060] space-y-1">
                  <p>1. Create a Facebook Developer App at developers.facebook.com</p>
                  <p>2. Request <strong className="text-white">pages_read_engagement</strong> permission</p>
                  <p>3. Generate a long-lived Page Access Token for jeffpatrickkrasno</p>
                  <p>4. Add as <code className="bg-[#0c0a08] px-1 rounded">FACEBOOK_ACCESS_TOKEN</code> in Vercel environment variables</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <StatCard label="Page Likes" value={fb?.profileStats?.pageLikes?fmt(fb.profileStats.pageLikes):'—'} sub={!fb?.profileStats?.pageLikes?'needs Graph API token':undefined} />
                <StatCard label="Followers" value={fb?.profileStats?.followers?fmt(fb.profileStats.followers):'—'} sub={!fb?.profileStats?.followers?'needs Graph API token':undefined} />
                <StatCard label="Total Reach" value={fmt(fb?.profileStats?.totalReach)} />
                <StatCard label="Avg Engagement" value={fb?.profileStats?.avgEngagement?fmt(fb.profileStats.avgEngagement):'—'} sub="per post" />
              </div>
              <div className="bg-[#1a1410] border border-[#2a1f10] rounded-xl p-3 mb-4 flex items-start gap-2">
                <span className="text-amber-500 text-sm mt-0.5">&#8505;</span>
                <div className="text-xs text-[#8a7060]"><strong className="text-amber-400">Follower &amp; Page Like counts require a Facebook Graph API token.</strong> To enable: Facebook Developer App &#x2192; request <code className="bg-[#0c0a08] px-1 rounded">pages_read_engagement</code> &#x2192; generate Page Access Token &#x2192; add as <code className="bg-[#0c0a08] px-1 rounded">FACEBOOK_ACCESS_TOKEN</code> in Vercel env vars.</div>
              </div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Top Posts by Engagement</div>
              <div className="grid grid-cols-4 gap-4">{fbPosts.slice(0,8).map(p=><PostCard key={p.id} post={p} metric="engagement"/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#128200;" title="Content Performance Analysis">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">By Guest</div>
              {analysis&&analysis.guests.length>0 ? (
                <div className="space-y-2">{analysis.guests.map((g,i)=>(
                  <div key={g.guest} className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-3 flex items-center gap-3">
                    <span className="text-amber-400 font-bold text-sm w-5">{i+1}</span>
                    <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{g.guest}</div><div className="text-xs text-[#6a5a4a]">{g.appearances} appearance{g.appearances>1?'s':''} &middot; {g.platform}</div></div>
                    <div className="text-amber-400 font-semibold text-sm">{fmt(g.avgPerformance)}</div>
                  </div>
                ))}</div>
              ) : <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4 text-center text-xs text-[#6a5a4a]">Loading guest data from platform content...</div>}
            </div>
            <div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">By Topic Category</div>
              {analysis&&analysis.topics.length>0 ? (
                <div className="space-y-2">{analysis.topics.map((t,i)=>(
                  <div key={t.topic} className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-3 flex items-center gap-3">
                    <span className="text-blue-400 font-bold text-sm w-5">{i+1}</span>
                    <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium">{t.topic}</div><div className="text-xs text-[#6a5a4a]">{t.count} piece{t.count>1?'s':''} of content</div></div>
                    <div className="text-blue-400 font-semibold text-sm">{fmt(t.avgPerformance)} avg</div>
                  </div>
                ))}</div>
              ) : <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4 text-center text-xs text-[#6a5a4a]">Loading topic data from platform content...</div>}
            </div>
            <div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Performance Extremes</div>
              {analysis&&analysis.extremes.length>0 ? (
                <div className="space-y-3">{analysis.extremes.map(e=>(
                  <div key={e.platform} className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-3">
                    <div className="text-xs text-[#6a5a4a] uppercase tracking-wider mb-2 font-semibold">{e.platform}</div>
                    {e.best&&<div className="mb-2"><div className="text-xs text-green-400 font-semibold mb-0.5">&#9650; BEST &mdash; {fmt(e.best.value)} {e.best.metric}</div><div className="text-xs text-[#ccc] line-clamp-2">{e.best.title}</div></div>}
                    {e.worst&&<div><div className="text-xs text-red-400 font-semibold mb-0.5">&#9660; LOWEST &mdash; {fmt(e.worst.value)} {e.worst.metric}</div><div className="text-xs text-[#ccc] line-clamp-2">{e.worst.title}</div></div>}
                  </div>
                ))}</div>
              ) : <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4 text-center text-xs text-[#6a5a4a]">Loading performance data...</div>}
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
              }
