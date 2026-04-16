/**
 * ZERO RISK V3 — Web Discovery Module (Pilar 6)
 *
 * Scrapes client and competitor websites to extract structured data
 * for auto-populating the Client Brain during onboarding.
 *
 * Uses web_fetch (built-in Managed Agents) or direct fetch for HTML.
 * Falls back gracefully when pages are unavailable.
 *
 * This module is PASSIVE — it only fetches and extracts raw data.
 * The brand-analyzer.ts module interprets the data with Claude.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Types
// ============================================================

export interface ScrapedPage {
  url: string
  title: string
  metaDescription: string
  headings: string[]            // h1, h2 text content
  bodyText: string              // Main text content (truncated)
  links: string[]               // Internal + external links
  images: { src: string; alt: string }[]
  socialLinks: string[]         // Facebook, Instagram, LinkedIn, etc.
  contactInfo: {
    emails: string[]
    phones: string[]
    address: string | null
  }
  colors: string[]              // Hex colors extracted from inline styles
  statusCode: number
  error?: string
}

export interface DiscoveryResult {
  companyName: string
  websiteUrl: string
  pages: ScrapedPage[]
  totalPagesScraped: number
  scrapedAt: string
  // Extracted structured data
  detectedIndustry: string | null
  detectedServices: string[]
  detectedTagline: string | null
  socialProfiles: Record<string, string>  // platform → URL
  contactInfo: {
    emails: string[]
    phones: string[]
    addresses: string[]
  }
  colorPalette: string[]
  errors: string[]
}

export interface CompetitorScrapeResult {
  competitorUrl: string
  competitorName: string | null
  pages: ScrapedPage[]
  detectedTagline: string | null
  detectedServices: string[]
  socialProfiles: Record<string, string>
  error?: string
}

export interface ReviewResult {
  source: string
  sourceUrl: string
  reviews: {
    text: string
    rating: number | null
    author: string | null
    date: string | null
  }[]
  totalFound: number
  error?: string
}

// ============================================================
// Web Discovery Class
// ============================================================

export class WebDiscovery {
  private supabase: SupabaseClient
  private onboardingId: string | null

  constructor(supabase: SupabaseClient, onboardingId?: string) {
    this.supabase = supabase
    this.onboardingId = onboardingId || null
  }

  // ----------------------------------------------------------
  // MAIN: Discover a client's web presence
  // ----------------------------------------------------------

  async discoverClient(websiteUrl: string, companyName: string): Promise<DiscoveryResult> {
    const baseUrl = this.normalizeUrl(websiteUrl)
    const errors: string[] = []

    // Pages to scrape (ordered by importance)
    const pagePaths = [
      '',                     // Homepage
      '/about', '/about-us', '/quienes-somos', '/nosotros', '/empresa',
      '/services', '/servicios', '/products', '/productos',
      '/contact', '/contacto', '/contactenos',
      '/blog', '/noticias', '/news',
    ]

    // Scrape pages in parallel (with concurrency limit)
    const pages: ScrapedPage[] = []
    const batchSize = 3

    for (let i = 0; i < pagePaths.length; i += batchSize) {
      const batch = pagePaths.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(path => this.scrapePage(`${baseUrl}${path}`))
      )
      for (const result of results) {
        if (result.statusCode === 200 || result.bodyText.length > 100) {
          pages.push(result)
        } else if (result.error) {
          errors.push(`${result.url}: ${result.error}`)
        }
      }
      await this.logDiscoveryAction(
        batch[0].includes('about') ? 'scrape_about' :
        batch[0].includes('service') || batch[0].includes('product') ? 'scrape_services' :
        batch[0].includes('contact') ? 'scrape_contact' :
        batch[0].includes('blog') || batch[0].includes('news') ? 'scrape_blog' :
        'scrape_homepage',
        `${baseUrl}${batch[0]}`,
        pages.length > 0 ? 'completed' : 'failed',
        `Scraped ${results.filter(r => r.statusCode === 200).length}/${batch.length} pages`
      )
    }

    // Aggregate extracted data
    const allEmails = Array.from(new Set(pages.flatMap(p => p.contactInfo.emails)))
    const allPhones = Array.from(new Set(pages.flatMap(p => p.contactInfo.phones)))
    const allAddresses = pages.map(p => p.contactInfo.address).filter(Boolean) as string[]
    const allColors = Array.from(new Set(pages.flatMap(p => p.colors))).slice(0, 10)
    const allSocialLinks = Array.from(new Set(pages.flatMap(p => p.socialLinks)))

    // Detect social profiles
    const socialProfiles: Record<string, string> = {}
    for (const link of allSocialLinks) {
      if (link.includes('facebook.com')) socialProfiles.facebook = link
      else if (link.includes('instagram.com')) socialProfiles.instagram = link
      else if (link.includes('linkedin.com')) socialProfiles.linkedin = link
      else if (link.includes('twitter.com') || link.includes('x.com')) socialProfiles.twitter = link
      else if (link.includes('youtube.com')) socialProfiles.youtube = link
      else if (link.includes('tiktok.com')) socialProfiles.tiktok = link
    }

    // Try to detect tagline from homepage h1/meta
    const homepage = pages.find(p => p.url === baseUrl || p.url === `${baseUrl}/`)
    const detectedTagline = homepage?.headings[0] || homepage?.metaDescription || null

    // Try to detect services from services page
    const servicesPage = pages.find(p =>
      p.url.includes('service') || p.url.includes('servicio') ||
      p.url.includes('product') || p.url.includes('producto')
    )
    const detectedServices = servicesPage?.headings.slice(0, 10) || []

    return {
      companyName,
      websiteUrl: baseUrl,
      pages,
      totalPagesScraped: pages.length,
      scrapedAt: new Date().toISOString(),
      detectedIndustry: null, // Will be inferred by brand-analyzer
      detectedServices,
      detectedTagline,
      socialProfiles,
      contactInfo: {
        emails: allEmails,
        phones: allPhones,
        addresses: Array.from(new Set(allAddresses)),
      },
      colorPalette: allColors,
      errors,
    }
  }

  // ----------------------------------------------------------
  // Scrape a single page
  // ----------------------------------------------------------

  async scrapePage(url: string): Promise<ScrapedPage> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ZeroRisk-Discovery/1.0 (marketing agency onboarding)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000), // 15s timeout
      })

      if (!response.ok) {
        return this.emptyPage(url, response.status, `HTTP ${response.status}`)
      }

      const html = await response.text()
      return this.parseHtml(url, html, response.status)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return this.emptyPage(url, 0, msg)
    }
  }

  // ----------------------------------------------------------
  // Parse HTML into structured data
  // ----------------------------------------------------------

  private parseHtml(url: string, html: string, statusCode: number): ScrapedPage {
    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch?.[1]?.trim() || ''

    // Extract meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)
    const metaDescription = metaDescMatch?.[1]?.trim() || ''

    // Extract headings (h1, h2)
    const headingRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi
    const headings: string[] = []
    let match
    while ((match = headingRegex.exec(html)) !== null) {
      const text = this.stripTags(match[1]).trim()
      if (text.length > 2 && text.length < 200) {
        headings.push(text)
      }
    }

    // Extract body text (strip scripts, styles, tags)
    let bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
    bodyText = this.stripTags(bodyText)
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000) // Truncate to manage tokens

    // Extract links
    const linkRegex = /href=["']([^"']+)["']/gi
    const links: string[] = []
    while ((match = linkRegex.exec(html)) !== null) {
      if (match[1] && !match[1].startsWith('#') && !match[1].startsWith('javascript:')) {
        links.push(match[1])
      }
    }

    // Extract social links
    const socialPatterns = [
      'facebook.com', 'instagram.com', 'linkedin.com',
      'twitter.com', 'x.com', 'youtube.com', 'tiktok.com',
    ]
    const socialLinks = links.filter(link =>
      socialPatterns.some(pattern => link.includes(pattern))
    )

    // Extract images with alt text
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/gi
    const images: { src: string; alt: string }[] = []
    while ((match = imgRegex.exec(html)) !== null) {
      images.push({ src: match[1], alt: match[2] })
    }

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    const emails = Array.from(new Set(bodyText.match(emailRegex) || []))

    // Extract phone numbers (international format)
    const phoneRegex = /(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g
    const phones = Array.from(new Set(bodyText.match(phoneRegex) || [])).slice(0, 5)

    // Try to extract address (simple heuristic)
    const addressPatterns = [
      /(?:dirección|address|ubicación)[\s:]*([^.]{10,100})/i,
    ]
    let address: string | null = null
    for (const pattern of addressPatterns) {
      const addrMatch = bodyText.match(pattern)
      if (addrMatch) {
        address = addrMatch[1].trim()
        break
      }
    }

    // Extract inline colors (hex codes)
    const colorRegex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
    const colors = Array.from(new Set(html.match(colorRegex) || [])).slice(0, 20)

    return {
      url,
      title,
      metaDescription,
      headings: headings.slice(0, 20),
      bodyText,
      links: Array.from(new Set(links)).slice(0, 50),
      images: images.slice(0, 20),
      socialLinks: Array.from(new Set(socialLinks)),
      contactInfo: { emails, phones, address },
      colors,
      statusCode,
    }
  }

  // ----------------------------------------------------------
  // Scrape competitor websites
  // ----------------------------------------------------------

  async scrapeCompetitors(competitorUrls: string[]): Promise<CompetitorScrapeResult[]> {
    const results: CompetitorScrapeResult[] = []

    for (const url of competitorUrls.slice(0, 5)) {
      try {
        const baseUrl = this.normalizeUrl(url)
        const pages: ScrapedPage[] = []

        // Scrape homepage + about page for competitor
        const pagePaths = ['', '/about', '/about-us', '/quienes-somos', '/nosotros']
        for (const path of pagePaths) {
          const page = await this.scrapePage(`${baseUrl}${path}`)
          if (page.statusCode === 200 || page.bodyText.length > 100) {
            pages.push(page)
          }
        }

        await this.logDiscoveryAction(
          'scrape_competitor', baseUrl,
          pages.length > 0 ? 'completed' : 'failed',
          `Scraped ${pages.length} pages from competitor`
        )

        const homepage = pages[0]
        const socialLinks = Array.from(new Set(pages.flatMap(p => p.socialLinks)))
        const socialProfiles: Record<string, string> = {}
        for (const link of socialLinks) {
          if (link.includes('facebook.com')) socialProfiles.facebook = link
          else if (link.includes('instagram.com')) socialProfiles.instagram = link
          else if (link.includes('linkedin.com')) socialProfiles.linkedin = link
        }

        results.push({
          competitorUrl: baseUrl,
          competitorName: homepage?.title?.split(/[|\-–—]/)[0]?.trim() || null,
          pages,
          detectedTagline: homepage?.headings[0] || homepage?.metaDescription || null,
          detectedServices: homepage?.headings.slice(1, 8) || [],
          socialProfiles,
        })
      } catch (error) {
        results.push({
          competitorUrl: url,
          competitorName: null,
          pages: [],
          detectedTagline: null,
          detectedServices: [],
          socialProfiles: {},
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return results
  }

  // ----------------------------------------------------------
  // Search for reviews (Google, social media)
  // ----------------------------------------------------------

  async discoverReviews(companyName: string, websiteUrl: string): Promise<ReviewResult[]> {
    const results: ReviewResult[] = []

    // Search for Google Reviews page
    // In production, this would use Apify Google Maps Scraper or SerpAPI
    // For now, we attempt to find reviews through web search patterns
    const searchUrls = [
      `https://www.google.com/search?q=${encodeURIComponent(companyName + ' reviews')}`,
      `https://www.google.com/search?q=${encodeURIComponent(companyName + ' opiniones')}`,
    ]

    // Note: Direct Google scraping won't work reliably.
    // In production, use:
    // - Apify Google Maps Scraper ($5/1000 results)
    // - SerpAPI ($50/mo for 5000 searches)
    // - Firecrawl for structured extraction
    //
    // For MVP, we'll use the web_fetch tool from Managed Agents
    // which can access these services.

    await this.logDiscoveryAction(
      'scrape_reviews', websiteUrl,
      'completed',
      `Review discovery initiated for "${companyName}". Production uses Apify/SerpAPI.`
    )

    // Placeholder: In production, this calls Apify or SerpAPI
    results.push({
      source: 'google_reviews',
      sourceUrl: searchUrls[0],
      reviews: [],
      totalFound: 0,
      error: 'Production implementation requires Apify Google Maps Scraper or SerpAPI. MVP uses manual review import.',
    })

    return results
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private normalizeUrl(url: string): string {
    let normalized = url.trim()
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`
    }
    // Remove trailing slash
    return normalized.replace(/\/+$/, '')
  }

  private stripTags(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  }

  private emptyPage(url: string, statusCode: number, error: string): ScrapedPage {
    return {
      url,
      title: '',
      metaDescription: '',
      headings: [],
      bodyText: '',
      links: [],
      images: [],
      socialLinks: [],
      contactInfo: { emails: [], phones: [], address: null },
      colors: [],
      statusCode,
      error,
    }
  }

  private async logDiscoveryAction(
    actionType: string,
    targetUrl: string,
    status: string,
    resultSummary: string
  ): Promise<void> {
    if (!this.onboardingId) return

    try {
      await this.supabase.from('onboarding_discovery_logs').insert({
        onboarding_id: this.onboardingId,
        action_type: actionType,
        target_url: targetUrl,
        status,
        result_summary: resultSummary,
      })
    } catch {
      // Non-blocking logging
    }
  }
}
