'use client';
import { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts';

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

interface MetricoolRow {
  image: string; url: string; text: string; network: string; date: string;
  impressions: number; interactions: number; engagement: number;
}
interface PlatformSummary { network: string; totalPosts: number; totalImpressions: number; avgEngagement: number; }
interface MonthlyDataPoint { month: string; [network: string]: number | string; }
interface TopicImpression { topic: string; totalImpressions: number; postCount: number; }

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

// Change 5: analyzeContent now accepts optional metricoolRows to incorporate CSV data
function analyzeContent(data: DashData, metricoolRows: MetricoolRow[] = []) {
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
    const bestMetric = s[0].views > 0 ? 'views' : 'likes';
    const bestValue = s[0].views > 0 ? s[0].views : s[0].likes;
    const worstMetric = s[s.length-1].views > 0 ? 'views' : 'likes';
    const worstValue = s[s.length-1].views > 0 ? s[s.length-1].views : s[s.length-1].likes;
    if (bestValue > 0) {
      extremes.push({ platform: 'Instagram', best: { title: s[0].caption, value: bestValue, metric: bestMetric }, worst: { title: s[s.length-1].caption, value: worstValue, metric: worstMetric } });
    }
  }
  const ttPosts = data.tiktok?.topPosts || [];
  if (ttPosts.length > 0) {
    ttPosts.forEach(p => { const g = extractGuest(p.caption); if (g) addGuest(g, p.views, 'TikTok'); addTopic(p.caption, p.views); });
    const s = [...ttPosts].sort((a,b) => b.views - a.views);
    extremes.push({ platform: 'TikTok', best: { title: s[0].caption, value: s[0].views, metric: 'views' }, worst: { title: s[s.length-1].caption, value: s[s.length-1].views, metric: 'views' } });
  }
  const eps = data.podcast?.topEpisodes || data.podcast?.episodes || [];
  if (eps.length > 0) {
    eps.forEach(ep => {
      const perf = (ep.downloads || 0) + (ep.streams || 0) || 1;
      const g = extractGuest(ep.title);
      if (g) addGuest(g, perf, 'Podcast');
      addTopic(ep.title, perf);
    });
  }

  // Incorporate Metricool CSV rows (all 7 networks)
  for (const row of metricoolRows) {
    const g = extractGuest(row.text);
    if (g) addGuest(g, row.impressions, row.network);
    addTopic(row.text, row.impressions);
  }

  const guests: GuestStat[] = Object.entries(guestMap).map(([g, s]) => ({ guest: g, avgPerformance: Math.round(s.total/s.count), appearances: s.count, platform: s.platform })).sort((a,b) => b.avgPerformance - a.avgPerformance).slice(0,8);
  const topics: TopicStat[] = Object.entries(topicMap).map(([t, s]) => ({ topic: t, avgPerformance: Math.round(s.total/s.count), count: s.count })).sort((a,b) => b.avgPerformance - a.avgPerformance).slice(0,6);
  return { guests, topics, extremes };
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i]; i++; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      let val = '';
      while (i < line.length && line[i] !== ',') { val += line[i]; i++; }
      fields.push(val.trim());
      if (line[i] === ',') i++;
    }
  }
  return fields;
}

function parseMetricoolCSV(csvText: string): MetricoolRow[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);
  const iImg = idx('image'), iUrl = idx('url'), iText = idx('text'),
        iNet = idx('network'), iDate = idx('date'),
        iImp = idx('impressions'), iInt = idx('interactions'), iEng = idx('engagement');
  const rows: MetricoolRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCSVLine(lines[r]);
    if (cols.length < 5) continue;
    rows.push({
      image:        iImg  >= 0 ? cols[iImg]  || '' : '',
      url:          iUrl  >= 0 ? cols[iUrl]  || '' : '',
      text:         iText >= 0 ? cols[iText] || '' : '',
      network:      iNet  >= 0 ? (cols[iNet] || '').toLowerCase().trim() : '',
      date:         iDate >= 0 ? cols[iDate] || '' : '',
      impressions:  iImp  >= 0 ? parseFloat(cols[iImp])  || 0 : 0,
      interactions: iInt  >= 0 ? parseFloat(cols[iInt])  || 0 : 0,
      engagement:   iEng  >= 0 ? parseFloat(cols[iEng])  || 0 : 0,
    });
  }
  return rows.filter(r => r.network !== '');
}

function buildPlatformSummary(rows: MetricoolRow[]): PlatformSummary[] {
  const map: Record<string, { impressions: number; engagementSum: number; count: number }> = {};
  for (const r of rows) {
    if (!map[r.network]) map[r.network] = { impressions: 0, engagementSum: 0, count: 0 };
    map[r.network].impressions   += r.impressions;
    map[r.network].engagementSum += r.engagement;
    map[r.network].count++;
  }
  return Object.entries(map)
    .map(([network, s]) => ({ network, totalPosts: s.count, totalImpressions: s.impressions, avgEngagement: s.count > 0 ? s.engagementSum / s.count : 0 }))
    .sort((a, b) => b.totalImpressions - a.totalImpressions);
}

function buildMonthlyTrend(rows: MetricoolRow[], networks: string[]): MonthlyDataPoint[] {
  const map: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!networks.includes(r.network)) continue;
    const month = r.date.slice(0, 7);
    if (!month || month.length !== 7) continue;
    if (!map[month]) map[month] = {};
    map[month][r.network] = (map[month][r.network] || 0) + r.impressions;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, nets]) => ({ month, ...nets }));
}

function buildTopTopics(rows: MetricoolRow[]): TopicImpression[] {
  const STOP = new Set(['the','and','for','are','but','not','you','all','any','can','her','was','our','one','had','his','him','has','how','its','now','did','get','may','new','see','two','who','day','way','use','from','that','this','with','have','your','they','been','more','will','what','when','like','just','into','than','then','also','some','time','each','very','much','both','same','over','such','here','only','most','other','their','about','would','there','could','after','think','first','these','those','being','great','many','even','want','give','back','come','does','good','well','know','long','make','said','take','them','went','were','which','while','work','years','help','need','put','out','she','yet','in','is','it','of','to','a','an','or','as','at','by','if','up','do','so','we','be','me','my','no','us','am']);
  const wordMap: Record<string, { impressions: number; count: number }> = {};
  for (const r of rows) {
    const words = r.text.toLowerCase().replace(/https?:\/\/\S+/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
    const seen = new Set<string>();
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      if (!wordMap[w]) wordMap[w] = { impressions: 0, count: 0 };
      wordMap[w].impressions += r.impressions;
      wordMap[w].count++;
    }
  }
  return Object.entries(wordMap).map(([topic, s]) => ({ topic, totalImpressions: s.impressions, postCount: s.count })).filter(t => t.postCount >= 2).sort((a,b) => b.totalImpressions - a.totalImpressions).slice(0,10);
}

const NET_COLORS: Record<string, string> = { instagram: '#E1306C', facebook: '#1877F2', youtube: '#FF0000', tiktok: '#69C9D0', linkedin: '#0A66C2', twitter: '#1DA1F2', threads: '#9B9B9B' };
function netColor(n: string): string { return NET_COLORS[n.toLowerCase()] || '#8a7060'; }
function netLabel(n: string): string { return n.charAt(0).toUpperCase() + n.slice(1); }

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

// Change 4: PostCard wrapped in anchor link
function PostCard({ post, metric }: { post: PostItem; metric: string }) {
  const [imgErr, setImgErr] = useState(false);
  const perf = metric === 'views' ? post.views : metric === 'likes' ? post.likes : (post.engagement || post.likes + post.comments);
  const thumb = proxyImg(post.thumbnail);
  const card = (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden hover:border-[#4a3a2a] transition-colors">
      <div className="h-36 bg-[#0f0d0a] relative">
        {thumb && !imgErr ? <img src={thumb} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} /> : <div className="w-full h-full flex items-center justify-center text-[#3a2a1a] text-4xl">📸</div>}
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
  if (post.url) return <a href={post.url} target="_blank" rel="noopener noreferrer" className="block">{card}</a>;
  return card;
}

// Change 4: VideoCard wrapped in YouTube link
function VideoCard({ video }: { video: VideoItem }) {
  function parseDur(iso: string) {
    const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '';
    const h=parseInt(m[1]||'0'),mn=parseInt(m[2]||'0'),s=parseInt(m[3]||'0');
    return h>0 ? h+':'+String(mn).padStart(2,'0')+':'+String(s).padStart(2,'0') : mn+':'+String(s).padStart(2,'0');
  }
  const href = 'https://youtube.com/watch?v=' + video.id;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block">
      <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden hover:border-[#4a3a2a] transition-colors">
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
    </a>
  );
}

// Change 4: EpisodeCard wrapped in audioUrl link; Change 2: no analytics gating
function EpisodeCard({ ep }: { ep: EpisodeItem }) {
  const [imgErr, setImgErr] = useState(false);
  const thumb = proxyImg(ep.thumbnail);
  const href = ep.audioUrl || '';
  const pubDate = ep.publishedAt ? new Date(ep.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const card = (
    <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden hover:border-[#4a3a2a] transition-colors">
      <div className="h-32 bg-[#0f0d0a]">
        {thumb && !imgErr ? <img src={thumb} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} /> : <div className="w-full h-full flex items-center justify-center text-5xl text-[#3a2a1a]">&#127897;</div>}
      </div>
      <div className="p-3">
        <p className="text-xs text-[#ccc] line-clamp-2 mb-2">{ep.title}</p>
        <div className="flex gap-3 text-xs text-[#8a7060]">
          {ep.duration > 0 && <span>&#9201; {ep.duration}m</span>}
          {pubDate && <span>{pubDate}</span>}
        </div>
        {((ep.downloads || 0) + (ep.streams || 0)) > 0 && (
          <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
            <div className="text-amber-400">&#8595; {fmt(ep.downloads)}</div>
            <div className="text-blue-400">&#9654; {fmt(ep.streams)}</div>
          </div>
        )}
      </div>
    </div>
  );
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className="block">{card}</a>;
  return card;
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

interface MetricoolState { rows: MetricoolRow[]; uploadedAt: Date; fileName: string; }

// Change 6 + Change 5: exposes rows upward; top 30 video-only with URL column
function SocialAnalyticsSection({ onRowsChange }: { onRowsChange: (rows: MetricoolRow[]) => void }) {
  const [metricool, setMetricool]         = useState<MetricoolState | null>(null);
  const [parsing, setParsing]             = useState(false);
  const [parseError, setParseError]       = useState<string | null>(null);
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setParseError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const rows = parseMetricoolCSV(text);
        if (rows.length === 0) {
          setParseError('No valid rows found. Make sure this is a Metricool CSV export with columns: Image, URL, Text, Network, Date, Impressions, Interactions, Engagement.');
        } else {
          setMetricool({ rows, uploadedAt: new Date(), fileName: file.name });
          setNetworkFilter('all');
          onRowsChange(rows);
        }
      } catch (err) { setParseError('Failed to parse CSV: ' + String(err)); }
      finally { setParsing(false); }
    };
    reader.onerror = () => { setParseError('Failed to read file.'); setParsing(false); };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleClear() {
    setMetricool(null); setParseError(null); setNetworkFilter('all');
    onRowsChange([]);
  }

  const allNetworks: string[] = metricool ? Array.from(new Set(metricool.rows.map(r => r.network))).sort() : [];
  const filteredRows: MetricoolRow[] = metricool ? (networkFilter === 'all' ? metricool.rows : metricool.rows.filter(r => r.network === networkFilter)) : [];
  const platformSummary: PlatformSummary[] = metricool ? buildPlatformSummary(metricool.rows) : [];

  // Change 6: top 30 video-only (youtube, tiktok, instagram), with URL column
  const VIDEO_NETWORKS = ['youtube', 'tiktok', 'instagram'];
  const videoRows: MetricoolRow[] = filteredRows.filter(r => VIDEO_NETWORKS.includes(r.network));
  const top30: MetricoolRow[] = [...videoRows].sort((a,b) => b.impressions - a.impressions).slice(0, 30);

  const monthlyData: MonthlyDataPoint[] = metricool ? buildMonthlyTrend(metricool.rows, allNetworks) : [];
  const topTopics: TopicImpression[] = metricool ? buildTopTopics(filteredRows) : [];
  const maxTopicImpressions: number = topTopics[0]?.totalImpressions || 1;

  if (!metricool) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-5xl mb-4">📊</div>
        <div className="text-white font-semibold text-lg mb-2">Upload Metricool Export</div>
        <div className="text-sm text-[#8a7060] mb-6 text-center max-w-md">
          Export your analytics CSV from Metricool (annual export, all networks). Expected columns: Image, URL, Text, Network, Date, Impressions, Interactions, Engagement.
        </div>
        {parseError && <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-xl px-5 py-3 mb-4 max-w-lg text-center">{parseError}</div>}
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
        <button onClick={() => fileInputRef.current?.click()} disabled={parsing} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors">
          {parsing ? <><span className="inline-block animate-spin">⟳</span> Parsing CSV…</> : <><span>📂</span> Choose CSV File</>}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-[#8a7060]">
          <span className="text-white font-medium">{metricool.fileName}</span>
          {' · '}{metricool.rows.length.toLocaleString()} posts parsed
          {' · '}Last updated {metricool.uploadedAt.toLocaleTimeString()}
        </div>
        <button onClick={handleClear} className="bg-[#1a1612] border border-[#2a2118] hover:bg-[#2a2118] text-sm text-[#8a7060] hover:text-white rounded-lg px-3 py-1.5 transition-colors">
          ✕ Clear / Re-upload
        </button>
      </div>

      <div>
        <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Platform Summary</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(platformSummary.length, 4)}, minmax(0,1fr))` }}>
          {platformSummary.map(p => (
            <div key={p.network} className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: netColor(p.network) }} />
                <span className="text-xs text-[#8a7060] uppercase tracking-wider font-semibold">{netLabel(p.network)}</span>
              </div>
              <div className="text-2xl font-bold text-white">{fmt(p.totalImpressions)}</div>
              <div className="text-xs text-[#6a5a4a] mb-3">total impressions</div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#2a2118] text-xs">
                <div><div className="text-[#6a5a4a] mb-0.5">Posts</div><div className="text-white font-semibold">{p.totalPosts.toLocaleString()}</div></div>
                <div><div className="text-[#6a5a4a] mb-0.5">Avg Eng</div><div className="text-amber-400 font-semibold">{fmtPct(p.avgEngagement)}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#6a5a4a]">Filter by network:</span>
        {(['all', ...allNetworks] as string[]).map(n => (
          <button key={n} onClick={() => setNetworkFilter(n)} className={`text-xs px-3 py-1 rounded-full border transition-colors ${networkFilter === n ? 'bg-amber-600 border-amber-600 text-white' : 'bg-[#1a1612] border-[#2a2118] text-[#8a7060] hover:text-white hover:border-[#4a3a2a]'}`}>
            {n === 'all' ? 'All Networks' : netLabel(n)}
          </button>
        ))}
      </div>

      <div>
        <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">
          Top 30 Video Posts by Impressions (YouTube · TikTok · Instagram)
          {networkFilter !== 'all' && <span className="ml-2 normal-case text-amber-500">— {netLabel(networkFilter)}</span>}
        </div>
        <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2118]">
                <th className="text-left text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">#</th>
                <th className="text-left text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Network</th>
                <th className="text-left text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Date</th>
                <th className="text-left text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Caption</th>
                <th className="text-right text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Impressions</th>
                <th className="text-right text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Interactions</th>
                <th className="text-right text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Engagement</th>
                <th className="text-center text-xs text-[#8a7060] uppercase tracking-wider px-4 py-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {top30.map((row, i) => (
                <tr key={i} className="border-b border-[#2a2118] last:border-0 hover:bg-[#1e1a16] transition-colors">
                  <td className="px-4 py-3 text-[#6a5a4a] font-medium">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: netColor(row.network) }} />
                      <span className="text-xs text-[#ccc]">{netLabel(row.network)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8a7060] whitespace-nowrap">{row.date.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-xs text-[#ccc] max-w-xs">
                    <div className="truncate" title={row.text}>{row.text.slice(0, 100)}{row.text.length > 100 ? '…' : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-amber-400 font-semibold">{fmt(row.impressions)}</td>
                  <td className="px-4 py-3 text-right text-xs text-[#ccc]">{fmt(row.interactions)}</td>
                  <td className="px-4 py-3 text-right text-xs text-green-400">{fmtPct(row.engagement)}</td>
                  <td className="px-4 py-3 text-center">
                    {row.url ? (
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">↗</a>
                    ) : <span className="text-xs text-[#4a3a2a]">—</span>}
                  </td>
                </tr>
              ))}
              {top30.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-[#6a5a4a]">No video posts found for this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Monthly Impressions Trend</div>
        <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4">
          {monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-[#6a5a4a]">No monthly data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2118" />
                <XAxis dataKey="month" tick={{ fill: '#8a7060', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#2a2118' }} />
                <YAxis tick={{ fill: '#8a7060', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmt(v)} width={55} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1612', border: '1px solid #2a2118', borderRadius: '8px', fontSize: '12px', color: '#fff' }} formatter={(value: number, name: string) => [fmt(value), netLabel(name)]} />
                <Legend formatter={(value: string) => <span style={{ color: '#8a7060', fontSize: '11px' }}>{netLabel(value)}</span>} />
                {allNetworks.map(net => (
                  <Line key={net} type="monotone" dataKey={net} stroke={netColor(net)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div>
        <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">
          Top Topics by Total Impressions
          {networkFilter !== 'all' && <span className="ml-2 normal-case text-amber-500">— {netLabel(networkFilter)}</span>}
        </div>
        {topTopics.length === 0 ? (
          <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-6 text-center text-xs text-[#6a5a4a]">Not enough keyword data — try uploading more posts or selecting a different network.</div>
        ) : (
          <div className="space-y-2">
            {topTopics.map((t, i) => (
              <div key={t.topic} className="bg-[#1a1612] border border-[#2a2118] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-sm w-5">{i + 1}</span>
                    <span className="text-white text-sm font-medium capitalize">{t.topic}</span>
                    <span className="text-xs text-[#6a5a4a]">({t.postCount} posts)</span>
                  </div>
                  <span className="text-amber-400 font-semibold text-sm">{fmt(t.totalImpressions)}</span>
                </div>
                <div className="w-full bg-[#2a2118] rounded-full h-1.5">
                  <div className="bg-amber-600 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((t.totalImpressions / maxTopicImpressions) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(30);
  const [metricoolRows, setMetricoolRows] = useState<MetricoolRow[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      setData(await res.json());
      setLastUpdated(new Date());
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (autoRefresh > 0) timer.current = setInterval(() => loadData(), autoRefresh * 60000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [autoRefresh, loadData]);

  const yt     = data?.youtube;
  const pod    = data?.podcast;
  const ig     = data?.instagram;
  const tt     = data?.tiktok;
  const fb     = data?.facebook;
  const ytVideos = yt?.topVideos  || yt?.videos   || [];
  const episodes = pod?.topEpisodes || pod?.episodes || [];
  const igPosts  = ig?.topPosts   || [];
  const ttPosts  = tt?.topPosts   || [];
  const fbPosts  = fb?.topPosts   || [];
  // Change 5: pass metricoolRows so CSV data enriches guest/topic analysis
  const analysis = data ? analyzeContent(data, metricoolRows) : null;

  return (
    <div className="min-h-screen bg-[#0c0a08] text-white">
      <header className="sticky top-0 z-50 bg-[#0c0a08]/95 backdrop-blur border-b border-[#2a2118] px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Commune Podcast</h1>
            <p className="text-xs text-[#6a5a4a]">Command Center · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>
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
                <StatCard label="Subscribers"    value={fmt(yt?.channelStats?.subscribers)} />
                <StatCard label="Total Views"    value={fmt(yt?.channelStats?.totalViews)} />
                <StatCard label="Videos"         value={fmt(yt?.channelStats?.videoCount)} />
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
              <div className="grid grid-cols-3 gap-4 mb-6">
                <StatCard label="Total Episodes"  value={String(episodes.length||'—')} />
                <StatCard label="Total Downloads" value={pod?.totalDownloads!=null?fmt(pod.totalDownloads):'—'} />
                <StatCard label="Total Streams"   value={pod?.totalStreams!=null?fmt(pod.totalStreams):'—'} />
              </div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Recent Episodes</div>
              <div className="grid grid-cols-4 gap-4">{episodes.slice(0,8).map(ep=><EpisodeCard key={ep.id} ep={ep}/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#128247;" title="Instagram — @jeffkrasno">
          {ig?.status?.connected===false ? <NotConnected platform="Instagram" error={ig.status.error} /> : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Followers"      value={fmt(ig?.profileStats?.followers)} />
                <StatCard label="Total Views"    value={fmt(ig?.profileStats?.totalViews)} />
                <StatCard label="Avg Engagement" value={fmtPct(ig?.profileStats?.avgEngagement)} />
                <StatCard label="Posts"          value={String(igPosts.length)} />
              </div>
              <div className="text-sm text-[#8a7060] uppercase tracking-wider mb-3">Top Posts by Views</div>
              <div className="grid grid-cols-4 gap-4">{igPosts.slice(0,8).map(p=><PostCard key={p.id} post={p} metric="views"/>)}</div>
            </>
          )}
        </Section>

        <Section icon="&#127925;" title="TikTok — @jeffkrasno">
          {tt?.status?.connected===false ? <NotConnected platform="TikTok" error={tt.status.error} /> : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <StatCard label="Followers"      value={fmt(tt?.profileStats?.followers)} />
                <StatCard label="Total Views"    value={fmt(tt?.profileStats?.totalViews)} />
                <StatCard label="Avg Engagement" value={fmtPct(tt?.profileStats?.avgEngagement)} />
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
                <StatCard label="Page Likes"     value={fb?.profileStats?.pageLikes?fmt(fb.profileStats.pageLikes):'—'} sub={!fb?.profileStats?.pageLikes?'needs Graph API token':undefined} />
                <StatCard label="Followers"      value={fb?.profileStats?.followers?fmt(fb.profileStats.followers):'—'} sub={!fb?.profileStats?.followers?'needs Graph API token':undefined} />
                <StatCard label="Total Reach"    value={fmt(fb?.profileStats?.totalReach)} />
                <StatCard label="Avg Engagement" value={fb?.profileStats?.avgEngagement?fmt(fb.profileStats.avgEngagement):'—'} sub="per post" />
              </div>
              <div className="bg-[#1a1410] border border-[#2a1f10] rounded-xl p-3 mb-4 flex items-start gap-2">
                <span className="text-amber-500 text-sm mt-0.5">&#8505;</span>
                <div className="text-xs text-[#8a7060]"><strong className="text-amber-400">Follower &amp; Page Like counts require a Facebook Graph API token.</strong> To enable: Facebook Developer App → request <code className="bg-[#0c0a08] px-1 rounded">pages_read_engagement</code> → generate Page Access Token → add as <code className="bg-[#0c0a08] px-1 rounded">FACEBOOK_ACCESS_TOKEN</code> in Vercel env vars.</div>
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
                    <div className="flex-1 min-w-0"><div className="text-white text-sm font-medium truncate">{g.guest}</div><div className="text-xs text-[#6a5a4a]">{g.appearances} appearance{g.appearances>1?'s':''} · {g.platform}</div></div>
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
                    {e.best&&<div className="mb-2"><div className="text-xs text-green-400 font-semibold mb-0.5">▲ BEST — {fmt(e.best.value)} {e.best.metric}</div><div className="text-xs text-[#ccc] line-clamp-2">{e.best.title}</div></div>}
                    {e.worst&&<div><div className="text-xs text-red-400 font-semibold mb-0.5">▼ LOWEST — {fmt(e.worst.value)} {e.worst.metric}</div><div className="text-xs text-[#ccc] line-clamp-2">{e.worst.title}</div></div>}
                  </div>
                ))}</div>
              ) : <div className="bg-[#1a1612] border border-[#2a2118] rounded-xl p-4 text-center text-xs text-[#6a5a4a]">Loading performance data...</div>}
            </div>
          </div>
        </Section>

        <Section icon="📡" title="Social Analytics — Metricool">
          <SocialAnalyticsSection onRowsChange={setMetricoolRows} />
        </Section>

      </main>
    </div>
  );
}
