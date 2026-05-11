'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Youtube, Mic, Instagram, Facebook, TrendingUp, Users, Eye, Clock, MessageCircle, Play, X, ChevronDown, ChevronUp, AlertCircle, Upload, Send, Bot } from 'lucide-react';

interface PlatformStatus {
  connected: boolean;
  error?: string;
  lastUpdated?: string;
}

interface YouTubeData {
  channelStats: {
    subscribers: number;
    totalViews: number;
    videoCount: number;
    subscriberGrowth?: number;
  };
  videos: Array<{
    id: string;
    title: string;
    thumbnail: string;
    views: number;
    likes: number;
    comments: number;
    duration: string;
    publishedAt: string;
    engagementRate: number;
  }>;
  status: PlatformStatus;
}

interface PodcastData {
  episodes: Array<{
    id: string;
    title: string;
    description: string;
    audioUrl: string;
    duration: number;
    publishedAt: string;
    thumbnail?: string;
  }>;
  channelTitle: string;
  totalEpisodes: number;
  status: PlatformStatus;
}

interface SocialData {
  platform: string;
  handle: string;
  followers?: number;
  posts?: any[];
  status: PlatformStatus;
}

interface DashboardData {
  youtube: YouTubeData | null;
  podcast: PodcastData | null;
  instagram: SocialData | null;
  facebook: SocialData | null;
  tiktok: SocialData | null;
  lastRefresh: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-accent' }: any) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-border flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-xs uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={16} className={color} />}
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {sub && <div className="text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}

function ConnectCard({ platform, icon: Icon, color, description }: any) {
  return (
    <div className="bg-surface rounded-xl p-6 border border-dashed border-border flex flex-col items-center justify-center gap-3 min-h-[160px]">
      <Icon size={32} className={color} />
      <div className="text-text-secondary text-sm text-center">
        <div className="font-medium text-text-primary mb-1">Connect {platform}</div>
        <div className="text-text-muted text-xs">{description}</div>
      </div>
      <div className="text-xs text-accent border border-accent rounded-lg px-3 py-1">
        Add API credentials to .env
      </div>
    </div>
  );
}

function ErrorCard({ platform, error }: any) {
  return (
    <div className="bg-surface rounded-xl p-6 border border-red-900/50 flex flex-col items-center justify-center gap-3 min-h-[160px]">
      <AlertCircle size={32} className="text-red-400" />
      <div className="text-center">
        <div className="font-medium text-red-400 mb-1">{platform} Error</div>
        <div className="text-text-muted text-xs">{error}</div>
      </div>
    </div>
  );
}

function VideoCard({ video, onPlay }: any) {
  const engRate = video.engagementRate || ((video.likes + video.comments) / Math.max(video.views, 1) * 100);
  return (
    <div className="bg-surface-2 rounded-lg overflow-hidden border border-border group hover:border-accent/50 transition-colors">
      <div className="relative aspect-video bg-surface-3">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Youtube size={32} className="text-text-muted" />
          </div>
        )}
        <button
          onClick={() => onPlay(video)}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="bg-red-600 rounded-full p-3">
            <Play size={20} className="text-white fill-white" />
          </div>
        </button>
      </div>
      <div className="p-3">
        <div className="text-sm font-medium text-text-primary line-clamp-2 mb-2">{video.title}</div>
        <div className="flex gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1"><Eye size={11} />{formatNumber(video.views)}</span>
          <span className="flex items-center gap-1"><TrendingUp size={11} />{engRate.toFixed(1)}%</span>
          <span className="flex items-center gap-1"><MessageCircle size={11} />{formatNumber(video.comments)}</span>
        </div>
      </div>
    </div>
  );
}

function PodcastCard({ episode, onPlay }: any) {
  const mins = Math.floor((episode.duration || 0) / 60);
  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border group hover:border-accent/50 transition-colors">
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-lg bg-surface-3 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {episode.thumbnail ? (
            <img src={episode.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <Mic size={24} className="text-accent" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary line-clamp-2 mb-1">{episode.title}</div>
          <div className="text-xs text-text-muted">{mins}m · {new Date(episode.publishedAt).toLocaleDateString()}</div>
          <button
            onClick={() => onPlay(episode)}
            className="mt-2 text-xs flex items-center gap-1 text-accent hover:text-accent-light transition-colors"
          >
            <Play size={12} className="fill-accent" /> Play Episode
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, color, children, defaultOpen = true }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 bg-surface hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon size={20} className={color} />
          <span className="font-display text-lg font-semibold text-text-primary">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>
      {open && <div className="p-6 bg-background">{children}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playItem, setPlayItem] = useState<any>(null);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [claudeMessages, setClaudeMessages] = useState<ClaudeMessage[]>([]);
  const [claudeInput, setClaudeInput] = useState('');
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, autoRefreshInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll, autoRefreshInterval]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [claudeMessages]);

  const askClaude = async () => {
    if (!claudeInput.trim() || claudeLoading) return;
    const userMsg = claudeInput.trim();
    setClaudeInput('');
    setClaudeMessages(m => [...m, { role: 'user', content: userMsg }]);
    setClaudeLoading(true);
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, dashboardData: data }),
      });
      const json = await res.json();
      setClaudeMessages(m => [...m, { role: 'assistant', content: json.response || 'Sorry, I could not process that.' }]);
    } catch {
      setClaudeMessages(m => [...m, { role: 'assistant', content: 'Error connecting to Claude. Check your API key.' }]);
    } finally {
      setClaudeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-accent text-4xl font-display font-bold mb-4">Commune</div>
          <div className="text-text-muted animate-pulse">Loading live data...</div>
        </div>
      </div>
    );
  }

  const yt = data?.youtube;
  const pod = data?.podcast;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-display text-2xl font-bold text-text-primary">Commune Podcast</div>
          <div className="text-xs text-text-muted">Command Center · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={autoRefreshInterval}
            onChange={e => setAutoRefreshInterval(Number(e.target.value))}
            className="text-xs bg-surface border border-border rounded-lg px-2 py-1 text-text-secondary"
          >
            <option value={15}>Auto-refresh: 15m</option>
            <option value={30}>Auto-refresh: 30m</option>
            <option value={60}>Auto-refresh: 60m</option>
          </select>
          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="flex items-center gap-2 text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text-secondary hover:text-accent hover:border-accent transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {data?.lastRefresh ? `Updated ${new Date(data.lastRefresh).toLocaleTimeString()}` : 'Refresh'}
          </button>
          <button
            onClick={() => setClaudeOpen(!claudeOpen)}
            className="flex items-center gap-2 text-xs bg-accent rounded-lg px-3 py-1.5 text-white hover:bg-accent-light transition-colors"
          >
            <Bot size={13} /> Ask Claude
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Aggregate Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="YouTube Subscribers" value={yt?.channelStats ? formatNumber(yt.channelStats.subscribers) : '—'} icon={Youtube} color="text-red-500" sub={yt?.channelStats?.totalViews ? `${formatNumber(yt.channelStats.totalViews)} total views` : undefined} />
          <StatCard label="Podcast Episodes" value={pod?.totalEpisodes ?? '—'} icon={Mic} color="text-accent" sub={pod?.channelTitle} />
          <StatCard label="Instagram" value={data?.instagram?.status?.connected ? (data.instagram.followers ? formatNumber(data.instagram.followers) : 'Connected') : 'Not Connected'} icon={Instagram} color="text-pink-500" />
          <StatCard label="TikTok" value={data?.tiktok?.status?.connected ? 'Connected' : 'Not Connected'} icon={TrendingUp} color="text-cyan-400" />
        </div>

        {/* YouTube Section */}
        <Section title="YouTube — @jeffkrasno" icon={Youtube} color="text-red-500">
          {!yt?.status?.connected ? (
            yt?.status?.error ? (
              <ErrorCard platform="YouTube" error={yt.status.error} />
            ) : (
              <ConnectCard platform="YouTube" icon={Youtube} color="text-red-500" description="Add YOUTUBE_API_KEY to .env file" />
            )
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Subscribers" value={formatNumber(yt.channelStats.subscribers)} icon={Users} />
                <StatCard label="Total Views" value={formatNumber(yt.channelStats.totalViews)} icon={Eye} />
                <StatCard label="Videos" value={yt.channelStats.videoCount} icon={Youtube} />
                <StatCard label="Avg Engagement" value={yt.videos.length > 0 ? (yt.videos.reduce((a, v) => a + v.engagementRate, 0) / yt.videos.length).toFixed(2) + '%' : '—'} icon={TrendingUp} />
              </div>
              <div>
                <div className="text-sm font-medium text-text-secondary mb-3">Top Videos</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {yt.videos.slice(0, 8).map(v => (
                    <VideoCard key={v.id} video={v} onPlay={setPlayItem} />
                  ))}
                </div>
              </div>
            </>
          )}
        </Section>

        {/* Podcast Section */}
        <Section title="Commune Podcast — Megaphone" icon={Mic} color="text-accent">
          {!pod?.status?.connected ? (
            pod?.status?.error ? (
              <ErrorCard platform="Podcast" error={pod.status.error} />
            ) : (
              <ConnectCard platform="Megaphone" icon={Mic} color="text-accent" description="Add MEGAPHONE_API_TOKEN and MEGAPHONE_NETWORK_ID to .env" />
            )
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <StatCard label="Total Episodes" value={pod.totalEpisodes} icon={Mic} />
                <StatCard label="Show" value={pod.channelTitle} icon={TrendingUp} />
                <StatCard label="Status" value="Live" icon={Eye} color="text-green-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-text-secondary mb-3">Recent Episodes</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pod.episodes.slice(0, 6).map(ep => (
                    <PodcastCard key={ep.id} episode={ep} onPlay={setPlayItem} />
                  ))}
                </div>
              </div>
            </>
          )}
        </Section>

        {/* Social Platforms */}
        <Section title="Social Media Overview" icon={TrendingUp} color="text-pink-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Instagram */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Instagram size={16} className="text-pink-500" />
                <span className="text-sm font-medium text-text-primary">Instagram @jeffkrasno</span>
              </div>
              {data?.instagram?.status?.connected ? (
                <StatCard label="Followers" value={data.instagram.followers ? formatNumber(data.instagram.followers) : 'Connected'} icon={Users} />
              ) : (
                <ConnectCard platform="Instagram" icon={Instagram} color="text-pink-500" description="Upload CSV from Instagram Insights or add Apify token" />
              )}
            </div>
            {/* Facebook */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Facebook size={16} className="text-blue-500" />
                <span className="text-sm font-medium text-text-primary">Facebook @jeffkrasno</span>
              </div>
              {data?.facebook?.status?.connected ? (
                <StatCard label="Followers" value={data.facebook.followers ? formatNumber(data.facebook.followers) : 'Connected'} icon={Users} />
              ) : (
                <ConnectCard platform="Facebook" icon={Facebook} color="text-blue-500" description="Upload CSV from Meta Business Suite or add Apify token" />
              )}
            </div>
            {/* TikTok */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-cyan-400" />
                <span className="text-sm font-medium text-text-primary">TikTok @jeffkrasno</span>
              </div>
              {data?.tiktok?.status?.connected ? (
                <StatCard label="Followers" value={data.tiktok.followers ? formatNumber(data.tiktok.followers) : 'Connected'} icon={Users} />
              ) : (
                <ConnectCard platform="TikTok" icon={TrendingUp} color="text-cyan-400" description="Upload CSV from TikTok Analytics or add Apify token" />
              )}
            </div>
          </div>
        </Section>

        {/* Content Analysis Section */}
        {yt?.status?.connected && yt.videos.length > 0 && (
          <Section title="Content Performance Analysis" icon={TrendingUp} color="text-accent">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* By Guest */}
              <div>
                <div className="text-sm font-medium text-text-secondary mb-3">By Guest (parsed from titles)</div>
                <div className="space-y-2">
                  {extractGuests(yt.videos).slice(0, 8).map(({ guest, avgViews, count }) => (
                    <div key={guest} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-xs text-text-primary">{guest}</div>
                        <div className="text-xs text-text-muted">{count} episode{count > 1 ? 's' : ''}</div>
                      </div>
                      <div className="text-xs text-accent font-medium">{formatNumber(avgViews)} avg views</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* By Topic */}
              <div>
                <div className="text-sm font-medium text-text-secondary mb-3">By Topic Category</div>
                <div className="space-y-2">
                  {extractTopics(yt.videos).slice(0, 8).map(({ topic, avgViews, count }) => (
                    <div key={topic} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-xs text-text-primary capitalize">{topic}</div>
                        <div className="text-xs text-text-muted">{count} videos</div>
                      </div>
                      <div className="text-xs text-accent font-medium">{formatNumber(avgViews)} avg views</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Top vs Bottom */}
              <div>
                <div className="text-sm font-medium text-text-secondary mb-3">Performance Extremes</div>
                <div className="space-y-2">
                  <div className="text-xs text-green-400 mb-1">🔥 Top Performer</div>
                  {yt.videos.slice(0, 1).map(v => (
                    <div key={v.id} className="bg-surface-2 rounded-lg p-3 border border-green-900/30">
                      <div className="text-xs text-text-primary line-clamp-2 mb-1">{v.title}</div>
                      <div className="text-xs text-text-muted">{formatNumber(v.views)} views · {v.engagementRate.toFixed(1)}% engagement</div>
                    </div>
                  ))}
                  <div className="text-xs text-red-400 mb-1 mt-3">📉 Needs Improvement</div>
                  {yt.videos.slice(-1).map(v => (
                    <div key={v.id} className="bg-surface-2 rounded-lg p-3 border border-red-900/30">
                      <div className="text-xs text-text-primary line-clamp-2 mb-1">{v.title}</div>
                      <div className="text-xs text-text-muted">{formatNumber(v.views)} views · {v.engagementRate.toFixed(1)}% engagement</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        )}
      </div>

      {/* Inline Player Modal */}
      {playItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl overflow-hidden max-w-3xl w-full border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="font-medium text-text-primary text-sm line-clamp-1 flex-1 mr-4">{playItem.title}</div>
              <button onClick={() => setPlayItem(null)} className="text-text-muted hover:text-text-primary">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {playItem.audioUrl ? (
                <div>
                  {playItem.thumbnail && (
                    <img src={playItem.thumbnail} alt="" className="w-full rounded-lg mb-4 max-h-48 object-cover" />
                  )}
                  <audio controls className="w-full" autoPlay>
                    <source src={playItem.audioUrl} type="audio/mpeg" />
                  </audio>
                  <div className="mt-3 text-xs text-text-muted">{playItem.description?.substring(0, 200)}...</div>
                </div>
              ) : (
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${playItem.id}?autoplay=1`}
                    className="w-full h-full rounded-lg"
                    allowFullScreen
                    allow="autoplay; encrypted-media"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Claude Panel */}
      {claudeOpen && (
        <div className="fixed bottom-0 right-0 z-50 w-full md:w-[420px] h-[520px] bg-surface border border-border rounded-tl-2xl flex flex-col shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-accent" />
              <span className="font-medium text-text-primary">Ask Claude</span>
            </div>
            <button onClick={() => setClaudeOpen(false)} className="text-text-muted hover:text-text-primary">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {claudeMessages.length === 0 && (
              <div className="text-center text-text-muted text-xs mt-8">
                <Bot size={32} className="mx-auto mb-3 text-accent/50" />
                <div className="font-medium text-text-secondary mb-2">AI Analytics Assistant</div>
                <div>Ask questions about your content performance. Examples:</div>
                <div className="mt-2 space-y-1 text-accent">
                  <div>"Which topics get the most views?"</div>
                  <div>"What's my best performing content style?"</div>
                  <div>"Which guests should we invite back?"</div>
                </div>
              </div>
            )}
            {claudeMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-surface-2 text-text-primary border border-border'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {claudeLoading && (
              <div className="flex justify-start">
                <div className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text-muted animate-pulse">
                  Analyzing your data...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 border-t border-border flex gap-2">
            <input
              value={claudeInput}
              onChange={e => setClaudeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && askClaude()}
              placeholder="Ask about your analytics..."
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent"
            />
            <button
              onClick={askClaude}
              disabled={claudeLoading || !claudeInput.trim()}
              className="bg-accent hover:bg-accent-light disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
            >
              <Send size={14} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function extractGuests(videos: any[]) {
  const guestMap: Record<string, { totalViews: number; count: number }> = {};
  const guestPatterns = [/with\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/g, /feat\.?\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/g, /:\s+([A-Z][a-z]+\s+[A-Z][a-z]+)$/g];
  videos.forEach(v => {
    guestPatterns.forEach(pattern => {
      let match;
      const re = new RegExp(pattern.source, 'g');
      while ((match = re.exec(v.title)) !== null) {
        const name = match[1];
        if (!guestMap[name]) guestMap[name] = { totalViews: 0, count: 0 };
        guestMap[name].totalViews += v.views;
        guestMap[name].count++;
      }
    });
  });
  return Object.entries(guestMap)
    .map(([guest, data]) => ({ guest, avgViews: Math.round(data.totalViews / data.count), count: data.count }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

function extractTopics(videos: any[]) {
  const topics: Record<string, { keywords: string[]; category: string }> = {
    health: { keywords: ['health', 'wellness', 'fitness', 'nutrition', 'diet', 'body', 'medicine', 'healing'], category: 'health' },
    spirituality: { keywords: ['spirit', 'meditation', 'mindful', 'conscious', 'soul', 'yoga', 'awakening', 'purpose'], category: 'spirituality' },
    business: { keywords: ['business', 'entrepreneur', 'success', 'money', 'wealth', 'startup', 'leadership'], category: 'business' },
    relationships: { keywords: ['relationship', 'love', 'marriage', 'family', 'parenting', 'connection', 'community'], category: 'relationships' },
    science: { keywords: ['science', 'research', 'brain', 'biology', 'quantum', 'physics', 'psychology'], category: 'science' },
    environment: { keywords: ['climate', 'environment', 'nature', 'earth', 'sustainability', 'planet'], category: 'environment' },
  };
  const topicMap: Record<string, { totalViews: number; count: number }> = {};
  videos.forEach(v => {
    const titleLower = v.title.toLowerCase();
    Object.entries(topics).forEach(([key, { keywords }]) => {
      if (keywords.some(kw => titleLower.includes(kw))) {
        if (!topicMap[key]) topicMap[key] = { totalViews: 0, count: 0 };
        topicMap[key].totalViews += v.views;
        topicMap[key].count++;
      }
    });
  });
  return Object.entries(topicMap)
    .map(([topic, data]) => ({ topic, avgViews: Math.round(data.totalViews / data.count), count: data.count }))
    .sort((a, b) => b.avgViews - a.avgViews);
}
