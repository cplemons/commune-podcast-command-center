'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Youtube, Mic, Instagram, Facebook, TrendingUp, Users, Eye, Clock, MessageCircle, Play, X, ChevronDown, ChevronUp, Heart, Share2, Download, Headphones, BarChart2, Radio } from 'lucide-react';

function fmt(n: number): string {
    if (!n && n !== 0) return '--';
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
    return min>=60 ? Math.floor(min/60)+'h '+(min%60>0 ? (min%60)+'m' : '') : min+'m';
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
                        <span className="text-[10px] tracking-widest text-[#8a7a6a] uppercase font-medium">{label}</span>span>
                        <Icon size={14} className="text-[#c4622d] opacity-70" />
                </div>div>
                <span className="text-3xl font-bold text-[#e8ddd0] font-serif">{value}</span>span>
            {sub && <span className="text-xs text-[#6b5f52]">{sub}</span>span>}
          </div>div>
        );
}

function NotConnected({ platform, icon: Icon, error }: any) {
    return (
          <div className="bg-[#1a1612] rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border border-dashed border-[#2a2218] min-h-[200px]">
                <Icon size={36} className="text-[#3a2e22]" />
                <p className="text-[#5a4e42] font-medium">Connect {platform}</p>p>
            {error ? (
                    <p className="text-[#c4622d] text-xs text-center max-w-xs font-mono">{error}</p>p>
                  ) : (
                    <p className="text-[#3a2e22] text-xs text-center max-w-xs">Configure API credentials to pull live data</p>p>
                )}
          </div>div>
        );
}

function MediaModal({ item, onClose }: any) {
    return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
                <div className="bg-[#1a1612] rounded-2xl overflow-hidden max-w-3xl w-full mx-4 shadow-2xl" onClick={(e:any) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-[#2a2218]">
                                  <span className="text-[#e8ddd0] text-sm font-medium truncate pr-4">{item.title||item.caption||'Media'}</span>span>
                                  <button onClick={onClose} className="text-[#8a7a6a] hover:text-[#e8ddd0]"><X size={18}/></button>button>
                        </div>div>
                        <div className="aspect-video bg-black">
                          {item.youtubeId ? (
                        <iframe src={`https://www.youtube.com/embed/${item.youtubeId}?autoplay=1`} className="w-full h-full" allowFullScreen allow="autoplay"/>
                      ) : item.audioUrl ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 bg-[#0d0a06]">
                                      <Mic size={48} className="text-[#c4622d]"/>
                                      <p className="text-[#e8ddd0] text-center text-sm font-medium">{item.title}</p>p>
                                      <audio controls autoPlay src={item.audioUrl} className="w-full max-w-lg"/>
                        </div>div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.thumbnail && <img src={item.thumbnail} alt="" className="max-h-full object-contain"/>}
                        </div>div>
                                  )}
                        </div>div>
                </div>div>
          </div>div>
        );
}

function SectionHeader({ icon: Icon, title, color, expanded, onToggle }: any) {
    return (
          <button onClick={onToggle} className="w-full flex items-center justify-between p-6 hover:bg-[#1a1612]/30 transition-colors rounded-t-2xl">
                <div className="flex items-center gap-3">
                        <Icon size={18} style={{color}} />
                        <h2 className="text-lg font-semibold text-[#e8ddd0] font-serif">{title}</h2>h2>
                </div>div>
            {expanded ? <ChevronUp size={16} className="text-[#6b5f52]"/> : <ChevronDown size={16} className="text-[#6b5f52]"/>}
          </button>button>
        );
}

// ── YouTube Section ───────────────────────────────────────────────────────────
function YouTubeSection({ data, expanded, onToggle }: any) {
    const [modal, setModal] = useState<any>(null);
    const stats = data?.channelStats || {};
    // API now returns topVideos (sorted by views desc)
    const topVideos = data?.topVideos || data?.videos || [];
    const connected = data?.status?.connected;
  
    return (
          <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
                <SectionHeader icon={Youtube} title="YouTube — @jeffkrasno" color="#ff4444" expanded={expanded} onToggle={onToggle}/>
            {expanded && (
                    <div className="px-6 pb-6 space-y-6">
                      {!connected ? (
                                  <NotConnected platform="YouTube" icon={Youtube} error={data?.status?.error}/>
                                ) : (
                                  <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <StatCard label="Subscribers" value={fmt(stats.subscribers||0)} icon={Users}/>
                                                                <StatCard label="Total Views" value={fmt(stats.totalViews||0)} icon={Eye}/>
                                                                <StatCard label="Videos" value={fmt(stats.videoCount||0)} icon={Youtube}/>
                                                                <StatCard label="Avg Engagement" value={(stats.avgEngagement||0).toFixed(2)+'%'} icon={TrendingUp}/>
                                                </div>div>
                                    {topVideos.length > 0 && (
                                                    <div>
                                                                      <h3 className="text-xs tracking-widest text-[#8a7a6a] uppercase mb-3 font-medium">Top Videos by Views</h3>h3>
                                                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                                        {topVideos.slice(0,8).map((v: any) => (
                                                                            <div key={v.id} onClick={() => setModal({...v, youtubeId: v.id})}
                                                                                                      className="bg-[#1a1612] rounded-xl overflow-hidden cursor-pointer hover:ring-1 hover:ring-[#c4622d]/50 transition-all group">
                                                                                                    <div className="aspect-video bg-[#0d0a06] relative overflow-hidden">
                                                                                                      {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>}
                                                                                                                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                                                                                          <div className="bg-black/60 rounded-full p-2"><Play size={16} className="text-white fill-white"/></div>div>
                                                                                                                                </div>div>
                                                                                                      {v.duration && <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">{fmtIsoDuration(v.duration)}</span>span>}
                                                                                                      </div>div>
                                                                                                    <div className="p-2">
                                                                                                                              <p className="text-[#c8bdb0] text-xs line-clamp-2 mb-1">{v.title}</p>p>
                                                                                                                              <div className="flex items-center gap-2 text-[10px] text-[#8a7a6a]">
                                                                                                                                                          <span className="flex items-center gap-1"><Eye size={10}/>{fmt(v.views)}</span>span>
                                                                                                                                                          <span className="flex items-center gap-1"><Heart size={10}/>{fmt(v.likes)}</span>span>
                                                                                                                                </div>div>
                                                                                                      </div>div>
                                                                            </div>div>
                                                                          ))}
                                                                      </div>div>
                                                    </div>div>
                                                )}
                                  </>>
                                )}
                    </div>div>
                )}
            {modal && <MediaModal item={modal} onClose={() => setModal(null)}/>}
          </section>section>
        );
}

// ── Podcast Section ───────────────────────────────────────────────────────────
function PodcastSection({ data, expanded, onToggle }: any) {
    const [modal, setModal] = useState<any>(null);
    const pod = data || {};
    const podStats = pod.podcastStats || {};
    const topEpisodes = pod.topEpisodes || [];
    const connected = pod.status?.connected;
  
    return (
          <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
                <SectionHeader icon={Mic} title={`Podcast — ${pod.podcastName || 'Commune Podcast'}`} color="#c4622d" expanded={expanded} onToggle={onToggle}/>
            {expanded && (
                    <div className="px-6 pb-6 space-y-6">
                      {!connected ? (
                                  <NotConnected platform="Megaphone Podcast" icon={Mic} error={pod.status?.error}/>
                                ) : (
                                  <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <StatCard label="Episodes" value={fmt(podStats.totalEpisodes||0)} icon={Mic}/>
                                                                <StatCard
                                                                                    label="Total Downloads"
                                                                                    value={podStats.hasAnalytics ? fmt(podStats.totalDownloads||0) : '--'}
                                                                                    sub={podStats.hasAnalytics ? undefined : 'analytics unavailable'}
                                                                                    icon={Download}
                                                                                  />
                                                                <StatCard
                                                                                    label="Total Streams"
                                                                                    value={podStats.hasAnalytics ? fmt(podStats.totalStreams||0) : '--'}
                                                                                    sub={podStats.hasAnalytics ? undefined : 'analytics unavailable'}
                                                                                    icon={Radio}
                                                                                  />
                                                                <StatCard
                                                                                    label="Avg Listen Time"
                                                                                    value={podStats.hasAnalytics ? fmtTime(podStats.avgConsumptionTime||0) : '--'}
                                                                                    sub={podStats.hasAnalytics ? undefined : 'analytics unavailable'}
                                                                                    icon={Clock}
                                                                                  />
                                                </div>div>
                                    {!podStats.hasAnalytics && (
                                                    <div className="bg-[#1a1612] rounded-xl p-4 border border-[#2a2218]">
                                                                      <p className="text-[#8a7a6a] text-xs">
                                                                                          <span className="text-[#c4622d] font-medium">Analytics unavailable.</span>span> Episodes sorted by most recent. To enable download/stream analytics, contact Megaphone support to activate the Analytics add-on for your account at cms.megaphone.fm.
                                                                      </p>p>
                                                    </div>div>
                                                )}
                                    {topEpisodes.length > 0 && (
                                                    <div>
                                                                      <h3 className="text-xs tracking-widest text-[#8a7a6a] uppercase mb-3 font-medium">
                                                                        {podStats.hasAnalytics ? 'Top Episodes by Downloads + Streams' : 'Recent Episodes'}
                                                                      </h3>h3>
                                                                      <div className="space-y-2">
                                                                        {topEpisodes.slice(0,10).map((ep: any, i: number) => (
                                                                            <div key={ep.id || i}
                                                                                                      onClick={() => ep.audioUrl && setModal({...ep, audioUrl: ep.audioUrl})}
                                                                                                      className={`bg-[#1a1612] rounded-xl p-3 flex items-center gap-3 ${ep.audioUrl ? 'cursor-pointer hover:bg-[#221e18]' : ''} transition-colors`}>
                                                                                                    <span className="text-[#4a3e32] text-sm font-mono w-5 text-right flex-shrink-0">{i+1}</span>span>
                                                                              {ep.thumbnail ? (
                                                                                                                                  <img src={ep.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0"/>
                                                                                                                                ) : (
                                                                                                                                  <div className="w-10 h-10 rounded bg-[#2a2218] flex items-center justify-center flex-shrink-0">
                                                                                                                                                              <Mic size={14} className="text-[#c4622d]"/>
                                                                                                                                    </div>div>
                                                                                                    )}
                                                                                                    <div className="flex-1 min-w-0">
                                                                                                                              <p className="text-[#c8bdb0] text-sm truncate">{ep.title}</p>p>
                                                                                                                              <div className="flex items-center gap-3 mt-0.5">
                                                                                                                                {ep.publishedAt && <span className="text-[#6b5f52] text-xs">{timeAgo(ep.publishedAt)}</span>span>}
                                                                                                                                {ep.duration > 0 && <span className="text-[#6b5f52] text-xs">{fmtEpDuration(ep.duration)}</span>span>}
                                                                                                                                </div>div>
                                                                                                      </div>div>
                                                                              {podStats.hasAnalytics && (
                                                                                                                                  <div className="flex items-center gap-3 flex-shrink-0">
                                                                                                                                    {ep.downloads > 0 && <span className="text-xs text-[#8a7a6a]"><Download size={10} className="inline mr-1"/>{fmt(ep.downloads)}</span>span>}
                                                                                                                                    {ep.streams > 0 && <span className="text-xs text-[#8a7a6a]"><Radio size={10} className="inline mr-1"/>{fmt(ep.streams)}</span>span>}
                                                                                                                                    </div>div>
                                                                                                    )}
                                                                              {ep.audioUrl && <Play size={14} className="text-[#c4622d] flex-shrink-0"/>}
                                                                            </div>div>
                                                                          ))}
                                                                      </div>div>
                                                    </div>div>
                                                )}
                                  </>>
                                )}
                    </div>div>
                )}
            {modal && <MediaModal item={modal} onClose={() => setModal(null)}/>}
          </section>section>
        );
}

// ── Instagram Section ─────────────────────────────────────────────────────────
function InstagramSection({ data, expanded, onToggle }: any) {
    const [modal, setModal] = useState<any>(null);
    const stats = data?.profileStats || {};
    const topPosts = data?.topPosts || [];
    const connected = data?.status?.connected;
  
    return (
          <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
                <SectionHeader icon={Instagram} title="Instagram — @jeffkrasno" color="#e1306c" expanded={expanded} onToggle={onToggle}/>
            {expanded && (
                    <div className="px-6 pb-6 space-y-6">
                      {!connected ? (
                                  <NotConnected platform="Instagram" icon={Instagram} error={data?.status?.error}/>
                                ) : (
                                  <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <StatCard label="Followers" value={fmt(stats.followers||0)} icon={Users}/>
                                                                <StatCard label="Posts" value={fmt(stats.postsCount||0)} icon={Instagram}/>
                                                                <StatCard label="Avg Engagement" value={(stats.avgEngagement||0).toFixed(2)+'%'} icon={TrendingUp}/>
                                                                <StatCard label="Total Likes" value={fmt(stats.totalReach||0)} icon={Heart}/>
                                                </div>div>
                                    {topPosts.length > 0 && (
                                                    <div>
                                                                      <h3 className="text-xs tracking-widest text-[#8a7a6a] uppercase mb-3 font-medium">Top Posts by Engagement</h3>h3>
                                                                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                                                        {topPosts.slice(0,12).map((p: any) => (
                                                                            <div key={p.id}
                                                                                                      onClick={() => setModal(p)}
                                                                                                      className="aspect-square bg-[#1a1612] rounded-lg overflow-hidden cursor-pointer hover:ring-1 hover:ring-[#c4622d]/50 transition-all group relative">
                                                                              {p.thumbnail ? (
                                                                                                                                  <img
                                                                                                                                                                src={`/api/proxy/image?url=${encodeURIComponent(p.thumbnail)}`}
                                                                                                                                                                alt=""
                                                                                                                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                                                                                                                onError={(e: any) => { e.target.style.display='none'; }}
                                                                                                                                                              />
                                                                                                                                ) : (
                                                                                                                                  <div className="w-full h-full flex items-center justify-center">
                                                                                                                                                              <Instagram size={20} className="text-[#3a2e22]"/>
                                                                                                                                    </div>div>
                                                                                                    )}
                                                                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                                                              <div className="flex items-center gap-1.5 text-[10px] text-white">
                                                                                                                                                          <Heart size={8}/><span>{fmt(p.likes)}</span>span>
                                                                                                                                {p.views > 0 && <><Eye size={8}/><span>{fmt(p.views)}</span>span></>>}
                                                                                                                                </div>div>
                                                                                                      </div>div>
                                                                            </div>div>
                                                                          ))}
                                                                      </div>div>
                                                    </div>div>
                                                )}
                                  </>>
                                )}
                    </div>div>
                )}
            {modal && <MediaModal item={modal} onClose={() => setModal(null)}/>}
          </section>section>
        );
}

// ── TikTok Section ────────────────────────────────────────────────────────────
function TikTokSection({ data, expanded, onToggle }: any) {
    const [modal, setModal] = useState<any>(null);
    const stats = data?.profileStats || {};
    const topPosts = data?.topPosts || [];
    const connected = data?.status?.connected;
  
    function TikTokIcon({ size, className }: any) {
          return (
                  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z"/>
                  </svg>svg>
                );
    }
  
    return (
          <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
                <SectionHeader icon={TikTokIcon} title="TikTok — @jeffkrasno" color="#69C9D0" expanded={expanded} onToggle={onToggle}/>
            {expanded && (
                    <div className="px-6 pb-6 space-y-6">
                      {!connected ? (
                                  <NotConnected platform="TikTok" icon={TikTokIcon} error={data?.status?.error}/>
                                ) : (
                                  <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <StatCard label="Followers" value={fmt(stats.followers||0)} icon={Users}/>
                                                                <StatCard label="Following" value={fmt(stats.following||0)} icon={Users}/>
                                                                <StatCard label="Avg Engagement" value={(stats.avgEngagement||0).toFixed(2)+'%'} icon={TrendingUp}/>
                                                                <StatCard label="Total Views (Top Posts)" value={fmt(stats.totalReach||0)} icon={Eye}/>
                                                </div>div>
                                    {topPosts.length > 0 && (
                                                    <div>
                                                                      <h3 className="text-xs tracking-widest text-[#8a7a6a] uppercase mb-3 font-medium">Top Posts by Views</h3>h3>
                                                                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                                                        {topPosts.slice(0,12).map((p: any, i: number) => (
                                                                            <div key={p.id || i}
                                                                                                      onClick={() => p.url && window.open(p.url, '_blank')}
                                                                                                      className="aspect-[9/16] bg-[#1a1612] rounded-lg overflow-hidden cursor-pointer hover:ring-1 hover:ring-[#c4622d]/50 transition-all group relative">
                                                                              {p.thumbnail ? (
                                                                                                                                  <img
                                                                                                                                                                src={`/api/proxy/image?url=${encodeURIComponent(p.thumbnail)}`}
                                                                                                                                                                alt=""
                                                                                                                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                                                                                                                onError={(e: any) => { e.target.style.display='none'; }}
                                                                                                                                                              />
                                                                                                                                ) : (
                                                                                                                                  <div className="w-full h-full flex items-center justify-center">
                                                                                                                                                              <Play size={20} className="text-[#3a2e22]"/>
                                                                                                                                    </div>div>
                                                                                                    )}
                                                                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                                                              <div className="flex items-center gap-1 text-[10px] text-white">
                                                                                                                                                          <Eye size={8}/><span>{fmt(p.views)}</span>span>
                                                                                                                                                          <Heart size={8}/><span>{fmt(p.likes)}</span>span>
                                                                                                                                </div>div>
                                                                                                      </div>div>
                                                                            </div>div>
                                                                          ))}
                                                                      </div>div>
                                                    </div>div>
                                                )}
                                  </>>
                                )}
                    </div>div>
                )}
          </section>section>
        );
}

// ── Facebook Section ──────────────────────────────────────────────────────────
function FacebookSection({ data, expanded, onToggle }: any) {
    const stats = data?.profileStats || {};
    const topPosts = data?.topPosts || [];
    const connected = data?.status?.connected;
  
    return (
          <section className="bg-[#13100d] rounded-2xl border border-[#2a2218]">
                <SectionHeader icon={Facebook} title="Facebook — @jeffpatrickkrasno" color="#1877F2" expanded={expanded} onToggle={onToggle}/>
            {expanded && (
                    <div className="px-6 pb-6 space-y-6">
                      {!connected ? (
                                  <NotConnected platform="Facebook" icon={Facebook} error={data?.status?.error}/>
                                ) : (
                                  <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <StatCard label="Page Likes" value={stats.pageLikes > 0 ? fmt(stats.pageLikes) : '--'} sub={stats.pageLikes > 0 ? undefined : 'not available via posts scraper'} icon={Heart}/>
                                                                <StatCard label="Followers" value={stats.followers > 0 ? fmt(stats.followers) : '--'} sub={stats.followers > 0 ? undefined : 'not available via posts scraper'} icon={Users}/>
                                                                <StatCard label="Avg Engagement" value={fmt(Math.round(stats.avgEngagement||0))} sub="likes+comments avg" icon={TrendingUp}/>
                                                                <StatCard label="Total Engagement" value={fmt(stats.totalReach||0)} sub="from top posts" icon={Eye}/>
                                                </div>div>
                                    {stats.followers === 0 && (
                                                    <div className="bg-[#1a1612] rounded-xl p-3 border border-[#2a2218]">
                                                                      <p className="text-[#6b5f52] text-xs">Page-level follower counts require a different scraper. Showing post engagement data only. To get follower count, a Facebook Graph API token is needed.</p>p>
                                                    </div>div>
                                                )}
                                    {topPosts.length > 0 && (
                                                    <div>
                                                                      <h3 className="text-xs tracking-widest text-[#8a7a6a] uppercase mb-3 font-medium">Top Posts by Engagement</h3>h3>
                                                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                                        {topPosts.slice(0,8).map((p: any, i: number) => (
                                                                            <div key={p.id || i}
                                                                                                      onClick={() => p.url && window.open(p.url, '_blank')}
                                                                                                      className="bg-[#1a1612] rounded-xl overflow-hidden cursor-pointer hover:ring-1 hover:ring-[#c4622d]/50 transition-all group">
                                                                                                    <div className="aspect-video bg-[#0d0a06] relative overflow-hidden">
                                                                                                      {p.thumbnail ? (
                                                                                                                                    <img
                                                                                                                                                                    src={`/api/proxy/image?url=${encodeURIComponent(p.thumbnail)}`}
                                                                                                                                                                    alt=""
                                                                                                                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                                                                                                                    onError={(e: any) => { e.target.style.display='none'; }}
                                                                                                                                                                  />
                                                                                                                                  ) : (
                                                                                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                                                                                                                  <Facebook size={20} className="text-[#3a2e22]"/>
                                                                                                                                      </div>div>
                                                                                                                              )}
                                                                                                      </div>div>
                                                                                                    <div className="p-2">
                                                                                                                              <p className="text-[#c8bdb0] text-xs line-clamp-2 mb-1">{p.caption || '(no caption)'}</p>p>
                                                                                                                              <div className="flex items-center gap-2 text-[10px] text-[#8a7a6a]">
                                                                                                                                                          <span className="flex items-center gap-1"><Heart size={10}/>{fmt(p.likes)}</span>span>
                                                                                                                                                          <span className="flex items-center gap-1"><MessageCircle size={10}/>{fmt(p.comments)}</span>span>
                                                                                                                                {p.shares > 0 && <span className="flex items-center gap-1"><Share2 size={10}/>{fmt(p.shares)}</span>span>}
                                                                                                                                </div>div>
                                                                                                      </div>div>
                                                                            </div>div>
                                                                          ))}
                                                                      </div>div>
                                                    </div>div>
                                                )}
                                  </>>
                                )}
                    </div>div>
                )}
          </section>section>
        );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────
function SummaryBar({ data }: any) {
    const yt = data?.youtube;
    const pod = data?.podcast;
    const ig = data?.instagram;
    const tt = data?.tiktok;
    const fb = data?.facebook;
  
    const items = [
      { label: 'YouTube', value: yt?.channelStats?.subscribers ? fmt(yt.channelStats.subscribers)+' subs' : '--', connected: yt?.status?.connected },
      { label: 'Podcast', value: pod?.podcastStats?.totalEpisodes ? fmt(pod.podcastStats.totalEpisodes)+' eps' : '--', connected: pod?.status?.connected },
      { label: 'Instagram', value: ig?.profileStats?.followers ? fmt(ig.profileStats.followers)+' followers' : '--', connected: ig?.status?.connected },
      { label: 'TikTok', value: tt?.profileStats?.followers ? fmt(tt.profileStats.followers)+' followers' : '--', connected: tt?.status?.connected },
      { label: 'Facebook', value: fb?.topPosts?.length ? fb.topPosts.length+' posts' : '--', connected: fb?.status?.connected },
        ];
  
    return (
          <div className="grid grid-cols-5 gap-2 mb-6">
            {items.map(item => (
                    <div key={item.label} className={`bg-[#13100d] rounded-xl p-3 border ${item.connected ? 'border-[#2a2218]' : 'border-dashed border-[#2a2218]'}`}>
                              <p className="text-[10px] tracking-widest text-[#8a7a6a] uppercase mb-1">{item.label}</p>p>
                              <p className={`text-sm font-bold ${item.connected ? 'text-[#e8ddd0]' : 'text-[#4a3e32]'}`}>{item.value}</p>p>
                              <div className={`w-1.5 h-1.5 rounded-full mt-1 ${item.connected ? 'bg-green-500' : 'bg-[#3a2e22]'}`}/>
                    </div>div>
                  ))}
          </div>div>
        );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [autoRefreshMin, setAutoRefreshMin] = useState(30);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
          youtube: true, podcast: true, instagram: true, tiktok: true, facebook: true,
    });
  
    const fetchData = useCallback(async () => {
          setLoading(true);
          try {
                  const res = await fetch('/api/dashboard');
                  const json = await res.json();
                  setData(json);
                  setLastUpdated(new Date().toLocaleTimeString());
          } catch (e) {
                  console.error('Dashboard fetch error:', e);
          } finally {
                  setLoading(false);
          }
    }, []);
  
    useEffect(() => { fetchData(); }, [fetchData]);
  
    useEffect(() => {
          if (!autoRefreshMin) return;
          const interval = setInterval(fetchData, autoRefreshMin * 60 * 1000);
          return () => clearInterval(interval);
    }, [autoRefreshMin, fetchData]);
  
    const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  
    return (
          <div className="min-h-screen bg-[#0d0a06] text-[#e8ddd0]">
                <header className="sticky top-0 z-40 bg-[#0d0a06]/95 backdrop-blur border-b border-[#1a1612] px-6 py-3 flex items-center justify-between">
                        <div>
                                  <h1 className="text-lg font-bold font-serif text-[#e8ddd0]">Commune Podcast</h1>h1>
                                  <p className="text-xs text-[#6b5f52]">Command Center &middot; {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p>p>
                        </div>div>
                        <div className="flex items-center gap-3">
                                  <select value={autoRefreshMin} onChange={e => setAutoRefreshMin(Number(e.target.value))}
                                                className="bg-[#1a1612] border border-[#2a2218] text-[#8a7a6a] text-xs rounded-lg px-3 py-1.5">
                                              <option value={0}>Manual only</option>option>
                                              <option value={15}>Auto-refresh: 15m</option>option>
                                              <option value={30}>Auto-refresh: 30m</option>option>
                                              <option value={60}>Auto-refresh: 1h</option>option>
                                  </select>select>
                                  <button onClick={fetchData} disabled={loading}
                                                className="flex items-center gap-2 bg-[#1a1612] hover:bg-[#221e18] border border-[#2a2218] text-[#8a7a6a] text-xs rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                                              <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>
                                    {loading ? 'Loading...' : 'Refresh'}
                                  </button>button>
                          {lastUpdated && <span className="text-xs text-[#4a3e32]">Updated {lastUpdated}</span>span>}
                        </div>div>
                </header>header>
          
                <main className="max-w-6xl mx-auto px-6 py-8 space-y-4">
                  {data && <SummaryBar data={data}/>}
                
                  {loading && !data ? (
                      <div className="flex items-center justify-center h-64">
                                  <div className="text-[#8a7a6a] text-sm animate-pulse">Loading dashboard data...</div>div>
                      </div>div>
                    ) : (
                      <>
                                  <YouTubeSection data={data?.youtube} expanded={expanded.youtube} onToggle={() => toggle('youtube')}/>
                                  <PodcastSection data={data?.podcast} expanded={expanded.podcast} onToggle={() => toggle('podcast')}/>
                                  <InstagramSection data={data?.instagram} expanded={expanded.instagram} onToggle={() => toggle('instagram')}/>
                                  <TikTokSection data={data?.tiktok} expanded={expanded.tiktok} onToggle={() => toggle('tiktok')}/>
                                  <FacebookSection data={data?.facebook} expanded={expanded.facebook} onToggle={() => toggle('facebook')}/>
                      </>>
                    )}
                </main>main>
          </div>div>
        );
}</></></></></></></></div>
