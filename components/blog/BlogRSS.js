import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { getAllPosts } from '../../lib/blog';

// RSS Feed Generator
export default function BlogRSS() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const posts = getAllPosts();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      
      const rssItems = posts.map(post => {
        const postUrl = `${siteUrl}/blog/${post.slug}`;
        const pubDate = new Date(post.date).toUTCString();
        
        return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description><![CDATA[${post.dek}]]></description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
      }).join('\n');
      
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Learnadoodle Blog</title>
    <link>${siteUrl}/blog</link>
    <description>Essays on learning, family schedules, and educational strategies</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/blog/rss.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;

      // Set content type and return RSS
      document.contentType = 'application/rss+xml';
      
      // For now, we'll need to handle this differently since React Native Web
      // doesn't easily support XML responses. This would typically be handled
      // by a server route in Next.js.
      console.log('RSS Feed generated. In production, this should be served as XML.');
    }
  }, []);

  // Return null since RSS should be served as XML, not rendered as React
  return null;
}

// Helper function to generate RSS XML string
export function generateRSSXML() {
  const posts = getAllPosts();
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://learnadoodle.com';
  
  const rssItems = posts.map(post => {
    const postUrl = `${siteUrl}/blog/${post.slug}`;
    const pubDate = new Date(post.date).toUTCString();
    
    return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description><![CDATA[${post.dek}]]></description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Learnadoodle Blog</title>
    <link>${siteUrl}/blog</link>
    <description>Essays on learning, family schedules, and educational strategies</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/blog/rss.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;
}
