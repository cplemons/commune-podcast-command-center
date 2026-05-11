'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Youtube, Mic, Instagram, Facebook, TrendingUp, Users, Eye, Clock, MessageCircle, Play, X, ChevronDown, ChevronUp, Bot, Send, Heart, Share2, Download, Headphones, BarChart2, Radio } from 'lucide-react';

function fmt(n: number): string {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(1)+'K';
  return n.toString();
}
function fmtTime(s: number): string {
  if (!s) return '--';
  const m = Math.floor(s/60); const sec = Math.floor(s%60);
  return m>0 ? m+'m '+sec+'s' : sec+'s';
}
function fmtEpDuration(min: number): string {
  if (!min) return '';
  return min>=60 ? Math.floor(min/60)+'h '+( min%60>0 ? (min%60)+'m' : '') : min+'m';
}
function fmtIsoDuration(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h=parseInt(m[1]||'0'), mn=parseInt(m[2]||'0'), s=parseInt(m[3]||'0');
  return h>0 ? h+':'+String(mn).padStart(2,'0')+':'+String(s).padStart(2,'0') : mn+':'+String(s).padStart(2,'0');
}
function timeAgo(d: string): string {
  if (!d) return '';
  const diff=(Date.now()-new Date(d).getTime())/1000;
  if (diff<3600) return Math.floor(diff/60)+'m ago';
  if (diff<86400) return Math.floor(diff/3600)+'h ago';
  if (diff<2592000) return Math.floor(diff/86400)+'d ago';
  return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function StatCard({ label, value, sub, icon: Icon }: any) {
  return (
    <div className="bg-[#1a1612] rounded-xl p-5 flex flex-col gap-1">
      <div className="flex justify-between items-start">
        <span className="text-[10px] tracking-widest text-[#8a7a6a] uppercase font-medium">{label}</span>
        <Icon size={14} className="text-[#c4622d] opacity-70" />
      </div>
      <span className="text-3xl font-bold text-[#e8ddd0] font-serif">{value}</span>
      {sub && <span className="text-xs text-[#6b5f52]">{sub}</span>}
    </div>
  );
}

function NotConnected({ platform, icon: Icon }: any) {
  return (
    <div className="bg-[#1a1612] rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border border-dashed border-[#2a2218] min-h-[200px]">
      <Icon size={36} className="text-[#3a2e22]" />
      <p className="text-[#5a4e42] font-medium">Connect {platform}</p>
      <p className="text-[#3a2e22] text-xs text-center max-w-xs">Instagram, Facebook, and TikTok data will appear here once Apify is connected</p>
    </div>
  );
}

function MediaModal({ item, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1612] rounded-2xl overflow-hidden max-w-3xl w-full mx-4 shadow-2xl" onClick={(e:any) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#2a2218]">
          <span className="text-[#e8ddd0] text-sm font-medium truncate pr-4">{item.title||item.caption||'Media'}</span>
          <button onClick={onClose} className="text-[#8a7a6a] hover:text-[#e8ddd0]"><X size={18}/></button>
        </div>
        <div className="aspect-video bg-black">
          {item.youtubeId ? (
            <iframe src={`https://www.youtube.com/embed/${item.youtubeId}?autoplay=1`} className="w-full h-full" allowFullScreen allow="autoplay"/>
          ) : item.audioUrl ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 bg-[#0d0a06]">
              <Mic size={48} className="text-[#c4622d]"/>
              <p className="text-[#e8ddd0] text-center text-sm font-medium">{item.title}</p>
              <audio controls autoPlay src={item.audioUrl} className="w-full max-w-lg"/>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {item.thumbnail && <img src={item.thumbnail} alt="" className="max-h-full object-contain"/>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color, expanded, onToggle }: any) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between p-6 hover:bg-[#1a1612]/30 transition-colors rounded-t-2xl">
      <div className="flex items-center gap-3">
        <Icon size={18} style={{color}} />
        <h2 className="text-lg font-semibold text-[#e8ddd0] font-serif">{title}</h2>
      </div>
      {expanded ? <ChevronUp size={16} className="text-[#6b5f52]"/> : <ChevronDown size={16} className="text-[#6b5f52]"/>}
    </button>
  );
}

function YouTubeSection({ data, expanded, onToggle }: any) {
  const [modal, setModal] = useState<any>(null);
  const stats = data?.channelStats || {};
  const videos = data?.videos || [];
  const connected = data?.status?.connected;

  return (
    <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
      <SectionHeader icon={Youtube} title="YouTube — @jeffkrasno" color="#ff4444" expanded={expanded} onToggle={onToggle}/>
      {expanded && (
        <div className="px-6 pb-6 space-y-6">
          {!connected ? (
            <div className="bg-[#1a1612] rounded-xl p-4 text-[#c4622d] text-sm">{data?.status?.error || 'YouTube not connected'}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Subscribers" value={fmt(stats.subscribers||0)} icon={Users}/>
                <StatCard label="Total Views" value={fmt(stats.totalViews||0)} icon={Eye}/>
                <StatCard label="Videos" value={fmt(stats.videoCount||0)} icon={Youtube}/>
                <StatCard label="Avg Engagement" value={(stats.avgEngagement||0).toFixed(2)+'%'} icon={TrendingUp}/>
              </div>
              {videos.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[#8a7a6a] mb-4 uppercase tracking-wider">Top Videos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {videos.slice(0,8).map((v: any) => (
                      <div key={v.id} className="bg-[#1a1612] rounded-xl overflow-hidden hover:bg-[#201c18] transition-colors cursor-pointer group" onClick={() => setModal({...v, youtubeId: v.id})}>
                        <div className="relative aspect-video bg-black">
                          {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover"/>}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play size={24} className="text-white fill-white"/>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-[#e8ddd0] text-xs font-medium leading-tight line-clamp-2">{v.title}</p>
                          <div className="flex gap-3 text-[10px] text-[#6b5f52]">
                            <span className="flex items-center gap-1"><Eye size={9}/>{fmt(v.views)}</span>
                            <span className="flex items-center gap-1"><TrendingUp size={9}/>{v.engagementRate.toFixed(1)}%</span>
                            <span className="flex items-center gap-1"><MessageCircle size={9}/>{fmt(v.comments)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {modal && <MediaModal item={modal} onClose={() => setModal(null)}/>}
    </section>
  );
}

function SocialSection({ data, platform, icon: Icon, color, expanded, onToggle }: any) {
  const [modal, setModal] = useState<any>(null);
  const connected = data?.status?.connected;
  const stats: any = data?.profileStats || {};
  const topPosts = data?.topPosts || data?.topVideos || [];

  const statItems = platform === 'tiktok' ? [
    { label: 'Followers', value: fmt(stats.followers||0), icon: Users },
    { label: 'Total Views', value: fmt(stats.totalViews||0), icon: Eye },
    { label: 'Avg Engagement', value: (stats.avgEngagement||0).toFixed(2)+'%', icon: TrendingUp },
    { label: 'Avg CTR', value: (stats.avgCTR||0).toFixed(2)+'%', icon: BarChart2 },
  ] : platform === 'facebook' ? [
    { label: 'Page Likes', value: fmt(stats.pageLikes||stats.followers||0), icon: Heart },
    { label: 'Followers', value: fmt(stats.followers||0), icon: Users },
    { label: 'Total Reach', value: fmt(stats.totalReach||0), icon: Eye },
    { label: 'Avg Engagement', value: (stats.avgEngagement||0).toFixed(2)+'%', icon: TrendingUp },
  ] : [
    { label: 'Followers', value: fmt(stats.followers||0), icon: Users },
    { label: 'Total Views', value: fmt(stats.totalViews||0), icon: Eye },
    { label: 'Avg Engagement', value: (stats.avgEngagement||0).toFixed(2)+'%', icon: TrendingUp },
    { label: 'Posts', value: fmt(stats.posts||0), icon: BarChart2 },
  ];

  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
      <SectionHeader icon={Icon} title={`${platformName} — @jeffkrasno`} color={color} expanded={expanded} onToggle={onToggle}/>
      {expanded && (
        <div className="px-6 pb-6 space-y-6">
          {!connected ? (
            <NotConnected platform={platformName} icon={Icon}/>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statItems.map((s: any) => (
                  <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon}/>
                ))}
              </div>
              {topPosts.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[#8a7a6a] mb-4 uppercase tracking-wider">Top Posts</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {topPosts.slice(0,8).map((p: any, i: number) => (
                      <div key={p.id||i} className="bg-[#1a1612] rounded-xl overflow-hidden hover:bg-[#201c18] transition-colors cursor-pointer group" onClick={() => setModal(p)}>
                        <div className="relative aspect-video bg-[#0d0a06]">
                          {p.thumbnail ? (
                            <img src={p.thumbnail ? `/api/proxy/image?url=${encodeURIComponent(p.thumbnail)}` : ''} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display='none')}/>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Icon size={24} style={{color}} className="opacity-30"/></div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play size={24} className="text-white fill-white"/>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-[#e8ddd0] text-xs font-medium leading-tight line-clamp-2">{p.caption||p.text||'Post'}</p>
                          <div className="flex gap-3 text-[10px] text-[#6b5f52]">
                            <span className="flex items-center gap-1"><Heart size={9}/>{fmt(p.likes||0)}</span>
                            <span className="flex items-center gap-1"><MessageCircle size={9}/>{fmt(p.comments||0)}</span>
                            {p.views > 0 && <span className="flex items-center gap-1"><Eye size={9}/>{fmt(p.views)}</span>}
                          </div>
                          <p className="text-[10px] text-[#4a4038]">{timeAgo(p.publishedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {modal && <MediaModal item={modal} onClose={() => setModal(null)}/>}
    </section>
  );
}

function PodcastSection({ data, expanded, onToggle }: any) {
  const [modal, setModal] = useState<any>(null);
  const connected = data?.status?.connected;
  const podcastStats = data?.podcastStats || {};
  const topEpisodes = data?.topEpisodes || data?.episodes?.slice(0,8) || [];
  const episodes = data?.episodes || [];
  const hasAnalytics = topEpisodes.some((e: any) => e.totalDownloads > 0 || e.totalStreams > 0);

  return (
    <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
      <SectionHeader icon={Mic} title="Commune Podcast — Megaphone" color="#c4622d" expanded={expanded} onToggle={onToggle}/>
      {expanded && (
        <div className="px-6 pb-6 space-y-6">
          {!connected ? (
            <div className="bg-[#1a1612] rounded-xl p-4 text-[#c4622d] text-sm">{data?.status?.error||'Megaphone not connected'}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Episodes" value={fmt(podcastStats.totalEpisodes||0)} icon={Mic}/>
                <StatCard label="Total Downloads" value={fmt(podcastStats.totalDownloads||0)} sub="last 12 months" icon={Download}/>
                <StatCard label="Total Streams" value={fmt(podcastStats.totalStreams||0)} sub="last 12 months" icon={Radio}/>
                <StatCard label="Avg Listen Time" value={fmtTime(podcastStats.avgConsumptionTime||0)} icon={Headphones}/>
              </div>

              <div>
                <h3 className="text-sm font-medium text-[#8a7a6a] mb-4 uppercase tracking-wider">
                  {hasAnalytics ? 'Top Episodes by Downloads' : 'Recent Episodes'}
                </h3>
                <div className="space-y-3">
                  {topEpisodes.slice(0,8).map((ep: any) => (
                    <div key={ep.id} className="bg-[#1a1612] rounded-xl p-4 flex gap-4 hover:bg-[#201c18] transition-colors">
                      <div className="flex-shrink-0 w-12 h-12 bg-[#0d0a06] rounded-lg overflow-hidden">
                        {ep.thumbnail ? (
                          <img src={ep.thumbnail} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display='none')}/>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Mic size={16} className="text-[#c4622d]"/></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#e8ddd0] text-sm font-medium leading-tight truncate">{ep.title}</p>
                        <p className="text-[#6b5f52] text-xs mt-0.5">{timeAgo(ep.publishedAt)}{ep.duration ? ' · ' + fmtEpDuration(ep.duration) : ''}</p>
                        {hasAnalytics && (
                          <div className="flex gap-4 mt-2 text-[11px] text-[#8a7a6a]">
                            <span className="flex items-center gap-1"><Download size={10}/><span className="text-[#e8ddd0] font-medium">{fmt(ep.totalDownloads)}</span> dl</span>
                            <span className="flex items-center gap-1"><Radio size={10}/><span className="text-[#e8ddd0] font-medium">{fmt(ep.totalStreams)}</span> streams</span>
                            {ep.totalDelivered > 0 && <span className="flex items-center gap-1"><BarChart2 size={10}/><span className="text-[#e8ddd0] font-medium">{fmt(ep.totalDelivered)}</span> delivered</span>}
                            {ep.avgConsumptionTime > 0 && <span className="flex items-center gap-1"><Clock size={10}/><span className="text-[#e8ddd0] font-medium">{fmtTime(ep.avgConsumptionTime)}</span> avg</span>}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setModal(ep)} className="flex-shrink-0 flex items-center gap-1 text-[#c4622d] text-xs hover:text-[#e07050] bg-[#2a1f15] hover:bg-[#3a2a1a] px-3 py-1.5 rounded-lg transition-colors self-center">
                        <Play size={10} className="fill-current"/><span>Play</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {!hasAnalytics && (
                <div className="bg-[#1a1612] rounded-xl p-4 border border-[#2a2218]">
                  <p className="text-[#6b5f52] text-xs">💡 Episode analytics (downloads, streams, consumption time) will appear here when available from Megaphone. Your account may need Analytics access enabled.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {modal && <MediaModal item={modal} onClose={() => setModal(null)}/>}
    </section>
  );
}

function ContentAnalysis({ youtube, podcast }: any) {
  const videos = youtube?.videos || [];
  const episodes = podcast?.topEpisodes || podcast?.episodes || [];

  const guestMap: Record<string, {views: number; count: number}> = {};
  const topicMap: Record<string, {views: number; count: number}> = {};
  const topics = ['Health','Science','Spirituality','Relationships','Business','Politics','Mindfulness','Nutrition','Fitness','Mental Health'];
  const guestPatterns = [
    /withs+(?:Dr.?s+)?([A-Z][a-z]+(?:s+[A-Z][a-z]+){0,2})/i,
    /([A-Z][a-z]+(?:s+[A-Z][a-z]+)+)s*(?:on|:||)/,
  ];

  videos.forEach((v: any) => {
    const title = v.title || '';
    for (const rx of guestPatterns) {
      const m = title.match(rx);
      if (m) {
        const guest = m[1].trim();
        if (guest.length > 3 && !/^(The|This|How|Why|What|When|Who|Our|Your)/.test(guest)) {
          guestMap[guest] = { views: (guestMap[guest]?.views||0)+v.views, count: (guestMap[guest]?.count||0)+1 };
        }
        break;
      }
    }
    topics.forEach(t => {
      if (title.toLowerCase().includes(t.toLowerCase())) {
        topicMap[t] = { views: (topicMap[t]?.views||0)+v.views, count: (topicMap[t]?.count||0)+1 };
      }
    });
  });

  const topGuests = Object.entries(guestMap).sort((a,b)=>b[1].views-a[1].views).slice(0,5);
  const topTopics = Object.entries(topicMap).sort((a,b)=>b[1].views-a[1].views).slice(0,6);
  const topVideo = videos[0];
  const bottomVideo = videos.length > 1 ? videos[videos.length-1] : null;

  return (
    <section className="bg-[#13100d] rounded-2xl border border-[#2a2218] p-6">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={18} className="text-[#c4622d]"/>
        <h2 className="text-lg font-semibold text-[#e8ddd0] font-serif">Content Performance Analysis</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <h3 className="text-xs text-[#8a7a6a] uppercase tracking-wider mb-3">By Guest</h3>
          <div className="space-y-2">
            {topGuests.length === 0 ? <p className="text-[#4a4038] text-xs">No data yet</p> : topGuests.map(([g, d]) => (
              <div key={g} className="flex items-center justify-between bg-[#1a1612] rounded-lg px-3 py-2">
                <div>
                  <p className="text-[#e8ddd0] text-xs font-medium">{g}</p>
                  <p className="text-[#6b5f52] text-[10px]">{d.count} episode{d.count>1?'s':''}</p>
                </div>
                <span className="text-[#c4622d] text-xs font-medium">{fmt(Math.round(d.views/d.count))} avg views</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs text-[#8a7a6a] uppercase tracking-wider mb-3">By Topic Category</h3>
          <div className="space-y-2">
            {topTopics.length === 0 ? <p className="text-[#4a4038] text-xs">No data yet</p> : topTopics.map(([t, d]) => (
              <div key={t} className="flex items-center justify-between bg-[#1a1612] rounded-lg px-3 py-2">
                <div>
                  <p className="text-[#e8ddd0] text-xs font-medium">{t}</p>
                  <p className="text-[#6b5f52] text-[10px]">{d.count} video{d.count>1?'s':''}</p>
                </div>
                <span className="text-[#c4622d] text-xs font-medium">{fmt(Math.round(d.views/d.count))} avg views</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xs text-[#8a7a6a] uppercase tracking-wider">Performance Extremes</h3>
          {topVideo && (
            <div className="bg-[#1a1612] rounded-lg p-3">
              <p className="text-[10px] text-[#c4622d] font-medium mb-1">🔥 Top Performer</p>
              <p className="text-[#e8ddd0] text-xs font-medium leading-tight line-clamp-2">{topVideo.title}</p>
              <p className="text-[#6b5f52] text-[10px] mt-1">{fmt(topVideo.views)} views · {topVideo.engagementRate.toFixed(1)}% engagement</p>
            </div>
          )}
          {bottomVideo && (
            <div className="bg-[#1a1612] rounded-lg p-3">
              <p className="text-[10px] text-[#8a7a6a] font-medium mb-1">📉 Needs Improvement</p>
              <p className="text-[#e8ddd0] text-xs font-medium leading-tight line-clamp-2">{bottomVideo.title}</p>
              <p className="text-[#6b5f52] text-[10px] mt-1">{fmt(bottomVideo.views)} views · {bottomVideo.engagementRate.toFixed(1)}% engagement</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ClaudePanel({ data, onClose }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<any>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, dashboardData: data }),
      });
      const j = await res.json();
      setMessages(m => [...m, { role: 'assistant', text: j.answer || j.error || 'No response' }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', text: 'Error: ' + e.message }]);
    }
    setLoading(false);
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-[#13100d] border-l border-[#2a2218] z-40 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-[#2a2218]">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[#c4622d]"/>
          <span className="text-[#e8ddd0] font-semibold font-serif">Ask Claude</span>
        </div>
        <button onClick={onClose} className="text-[#6b5f52] hover:text-[#e8ddd0]"><X size={16}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot size={32} className="text-[#3a2e22] mx-auto mb-3"/>
            <p className="text-[#6b5f52] text-sm font-medium">AI Analytics Assistant</p>
            <p className="text-[#4a4038] text-xs mt-2">Ask questions about your content performance. Examples:</p>
            <div className="mt-3 space-y-1">
              {['"Which topics get the most views?"','"What is my best performing content?"','"Which guests should we invite back?"'].map(ex => (
                <p key={ex} className="text-[#c4622d] text-xs opacity-70 italic">{ex}</p>
              ))}
            </div>
          </div>
        )}
        {messages.map((m: any, i: number) => (
          <div key={i} className={m.role==='user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={"max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed " + (m.role==='user' ? 'bg-[#c4622d] text-white' : 'bg-[#1a1612] text-[#c8bdb0]')}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#1a1612] rounded-xl px-3 py-2 text-xs text-[#6b5f52]">Analyzing your data...</div>
          </div>
        )}
        <span ref={bottomRef}></span>
      </div>
      <div className="p-4 border-t border-[#2a2218]">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key==='Enter') send(); }}
            placeholder="Ask about your analytics..." className="flex-1 bg-[#1a1612] text-[#e8ddd0] placeholder-[#4a4038] text-xs rounded-lg px-3 py-2 outline-none border border-[#2a2218] focus:border-[#c4622d]"/>
          <button onClick={send} disabled={loading} className="bg-[#c4622d] hover:bg-[#d4724d] disabled:opacity-40 text-white rounded-lg p-2 transition-colors">
            <Send size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}


export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [showClaude, setShowClaude] = useState(false);
  const [sections, setSections] = useState({ youtube: true, podcast: true, instagram: true, tiktok: true, facebook: true });

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (refreshInterval === 0) return;
    const interval = setInterval(fetchData, refreshInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  function toggle(s: keyof typeof sections) {
    setSections(prev => ({ ...prev, [s]: !prev[s] }));
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0d0a06] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#c4622d] text-2xl font-serif font-bold mb-2">Commune</p>
          <p className="text-[#4a4038] text-sm">Loading live data...</p>
        </div>
      </div>
    );
  }

  const yt = data?.youtube || {};
  const pod = data?.podcast || {};
  const ig = data?.instagram || {};
  const tt = data?.tiktok || {};
  const fb = data?.facebook || {};

  const totalFollowers = (yt.channelStats?.subscribers||0) + (ig.profileStats?.followers||0) + (tt.profileStats?.followers||0) + (fb.profileStats?.followers||0);
  const totalViews = (yt.channelStats?.totalViews||0) + (ig.profileStats?.totalViews||0) + (tt.profileStats?.totalViews||0);

  return (
    <div className={`min-h-screen bg-[#0d0a06] text-[#e8ddd0] ${showClaude ? 'pr-96' : ''} transition-all`}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0d0a06]/95 backdrop-blur border-b border-[#1a1612] px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-serif text-[#e8ddd0]">Commune Podcast</h1>
          <p className="text-[10px] text-[#4a4038]">Command Center · {new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="bg-[#1a1612] text-[#8a7a6a] text-xs rounded-lg px-3 py-1.5 border border-[#2a2218] outline-none cursor-pointer">
            <option value={0}>No auto-refresh</option>
            <option value={15}>Auto-refresh: 15m</option>
            <option value={30}>Auto-refresh: 30m</option>
            <option value={60}>Auto-refresh: 60m</option>
          </select>
          <button onClick={fetchData} disabled={loading} className="flex items-center gap-1.5 text-xs text-[#8a7a6a] hover:text-[#e8ddd0] bg-[#1a1612] px-3 py-1.5 rounded-lg border border-[#2a2218] transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>
            <span>{loading ? 'Loading...' : 'Refresh'}</span>
          </button>
          {lastUpdated && <span className="text-[10px] text-[#4a4038]">Updated {lastUpdated}</span>}
          <button onClick={() => setShowClaude(!showClaude)} className="flex items-center gap-2 bg-[#c4622d] hover:bg-[#d4724d] text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
            <Bot size={13}/> Ask Claude
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="YouTube Subscribers" value={fmt(yt.channelStats?.subscribers||0)} sub={fmt(yt.channelStats?.totalViews||0)+' total views'} icon={Youtube}/>
          <StatCard label="Podcast Episodes" value={fmt(pod.podcastStats?.totalEpisodes||0)} sub={pod.podcastName||''} icon={Mic}/>
          <StatCard label="Instagram" value={ig.status?.connected ? fmt(ig.profileStats?.followers||0) : 'Not Connected'} sub={ig.status?.connected ? 'followers' : ''} icon={Instagram}/>
          <StatCard label="TikTok" value={tt.status?.connected ? fmt(tt.profileStats?.followers||0) : 'Not Connected'} sub={tt.status?.connected ? 'followers' : ''} icon={TrendingUp}/>
        </div>

        {/* Platform Sections */}
        <YouTubeSection data={yt} expanded={sections.youtube} onToggle={() => toggle('youtube')}/>
        <PodcastSection data={pod} expanded={sections.podcast} onToggle={() => toggle('podcast')}/>

        {/* Social Media */}
        <SocialSection data={ig} platform="instagram" icon={Instagram} color="#e1306c" expanded={sections.instagram} onToggle={() => toggle('instagram')}/>
        <SocialSection data={tt} platform="tiktok" icon={TrendingUp} color="#69c9d0" expanded={sections.tiktok} onToggle={() => toggle('tiktok')}/>
        <SocialSection data={fb} platform="facebook" icon={Facebook} color="#1877f2" expanded={sections.facebook} onToggle={() => toggle('facebook')}/>

        <ContentAnalysis youtube={yt} podcast={pod}/>
      </div>

      {showClaude && <ClaudePanel data={data} onClose={() => setShowClaude(false)}/>}
    </div>
  );
}

