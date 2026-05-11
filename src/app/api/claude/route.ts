import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { message, dashboardData } = await req.json();

    // Build a rich context summary from the live dashboard data
    const contextParts: string[] = [];
    contextParts.push('You are an expert content strategy analyst for the Commune Podcast with Jeff Krasno.');
    contextParts.push('You have access to real-time analytics data from multiple platforms. Use this data to give specific, actionable insights.');
    contextParts.push('');

    if (dashboardData?.youtube?.status?.connected) {
      const yt = dashboardData.youtube;
      contextParts.push('## YOUTUBE DATA (@jeffkrasno)');
      contextParts.push(`Subscribers: ${yt.channelStats?.subscribers?.toLocaleString()}`);
      contextParts.push(`Total Views: ${yt.channelStats?.totalViews?.toLocaleString()}`);
      contextParts.push(`Video Count: ${yt.channelStats?.videoCount}`);
      if (yt.videos?.length > 0) {
        contextParts.push('\nTop Videos (sorted by views):');
        yt.videos.slice(0, 20).forEach((v: any, i: number) => {
          contextParts.push(`${i + 1}. "${v.title}" - ${v.views?.toLocaleString()} views, ${v.likes?.toLocaleString()} likes, ${v.comments?.toLocaleString()} comments, ${v.engagementRate?.toFixed(2)}% engagement, published ${new Date(v.publishedAt).toLocaleDateString()}`);
        });
      }
      contextParts.push('');
    }

    if (dashboardData?.podcast?.status?.connected) {
      const pod = dashboardData.podcast;
      contextParts.push('## PODCAST DATA (Commune Podcast)');
      contextParts.push(`Show: ${pod.channelTitle}`);
      contextParts.push(`Total Episodes: ${pod.totalEpisodes}`);
      if (pod.episodes?.length > 0) {
        contextParts.push('\nRecent Episodes:');
        pod.episodes.slice(0, 20).forEach((ep: any, i: number) => {
          const mins = Math.floor((ep.duration || 0) / 60);
          contextParts.push(`${i + 1}. "${ep.title}" - ${mins}min, published ${new Date(ep.publishedAt).toLocaleDateString()}`);
        });
      }
      contextParts.push('');
    }

    if (dashboardData?.instagram?.status?.connected) {
      contextParts.push('## INSTAGRAM (@jeffkrasno)');
      contextParts.push(`Followers: ${dashboardData.instagram.followers?.toLocaleString() || 'N/A'}`);
      contextParts.push('');
    }

    const systemContext = contextParts.join('\n');

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemContext,
      messages: [
        {
          role: 'user',
          content: message,
        }
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return NextResponse.json({ response: textContent?.text || 'No response generated' });
  } catch (e: any) {
    console.error('Claude API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
