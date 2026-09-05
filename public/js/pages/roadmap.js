import { $, escapeHtml } from '../core.js';
import { ORBIT_VERSION } from '../version.js';

const ROADMAP_UPDATED = 'September 5, 2026';

const currentFeatures = [
  { title: 'Discord publishing', status: 'Live now', tone: 'active', copy: 'Post text and images to Discord, with an optional role ping for the selected server.' },
  { title: 'Social publishing', status: 'Live now', tone: 'active', copy: 'Compose, customize, schedule, edit, retry, and delete posts for Threads, Bluesky, and Mastodon.' },
  { title: 'Short-form video', status: 'Built, approval pending', tone: 'foundation', copy: 'The queue and publishing paths are built for YouTube Shorts, TikTok, and Instagram Reels. Provider approval and account scopes are still required before each network can be used.' },
  { title: 'Creator alerts and RSS', status: 'Live now', tone: 'active', copy: 'Relay Twitch, YouTube, TikTok, RSS/Atom, and podcast updates into Discord with duplicate-safe delivery.' },
  { title: 'Ko-fi milestones', status: 'Live now', tone: 'active', copy: 'Use one stable webhook URL per integration, store the verification token securely, and manage milestone rules from Orbit.' },
  { title: 'Community modules', status: 'Live now', tone: 'active', copy: 'Birthdays, counting, events, moderation, tickets, roles, leveling, automation, and scheduled posts are part of the deployed control center.' },
];

const integrationStatus = [
  { title: 'TikTok API', status: 'Awaiting provider approval', tone: 'foundation', copy: 'OAuth connection, public-video announcements, duplicate-safe polling, and Direct Post delivery are built. TikTok approval and requested scopes are still pending before publishing can be relied on.' },
  { title: 'YouTube API', status: 'Awaiting provider approval', tone: 'foundation', copy: 'The OAuth upload and API-assisted live-detection paths are built. YouTube approval and account access are still pending; the public channel-feed fallback remains available where supported.' },
  { title: 'Ko-fi webhook foundation', status: 'Established', tone: 'foundation', copy: 'Orbit shows the webhook URL, accepts the Ko-fi verification token in the owner panel, and evaluates editable, enabled, or deleted milestones behind that one URL.' },
];

const plannedChanges = [
  { title: 'Twitter/X publishing under Social', status: 'Planned after Ko-fi foundation', tone: 'roadmap', copy: 'Add a dedicated Social adapter only after the Ko-fi milestone system is established. Because the Twitter/X API can cost money, Orbit will add this when Nerdspace Labs can afford it and will keep the feature free rather than paywalling it.' },
  { title: 'Provider-aware publishing improvements', status: 'Next planning track', tone: 'roadmap', copy: 'Keep provider availability, OAuth status, scopes, rate limits, and post delivery state visible in one place as more networks are added.' },
  { title: 'Roadmap change history', status: 'Ongoing', tone: 'roadmap', copy: 'Each patch should update this page with what shipped, what is active but configuration-dependent, and what is still a planned change.' },
];

const budgetDependentFeatures = [
  { title: 'Facebook Page posting', status: 'Future consideration', tone: 'roadmap', copy: 'A possible future social adapter from the earlier relay planning. It needs Meta app review, permissions, provider maintenance, and a clear free-to-users operating budget.' },
  { title: 'Cross-platform analytics', status: 'Future consideration', tone: 'roadmap', copy: 'Unified reach, engagement, and delivery reporting would require more provider endpoints, rate-limit handling, scheduled collection, and additional storage.' },
  { title: 'Expanded media retention', status: 'Budget and storage dependent', tone: 'roadmap', copy: 'Longer image and video retention, media history, and larger upload capacity would increase Cloudflare R2 storage and egress usage, so lifecycle rules need to be designed before expanding it.' },
];

const recentChanges = [
  ['alpha.78', 'Roadmap and integration status', 'Added a visible roadmap with current TikTok, YouTube, and Ko-fi status plus forward-change tracking.'],
  ['alpha.77', 'Navigation and sorting cleanup', 'Registry-driven sections, consistent channel/role ordering, server size sorting, and mobile sidebar behavior.'],
  ['alpha.76', 'Counting save recovery', 'Fixed the counting configuration upsert and replaced the generic server error with migration-aware diagnostics.'],
  ['alpha.75', 'Discord member labels', 'Member-facing pages now show a resolved Discord name followed by the raw ID.'],
  ['alpha.74', 'Birthday permission diagnostics', 'Birthday panel posting now explains missing Discord channel permissions and 403 responses.'],
  ['alpha.73', 'Birthday registration panel', 'Users can register, update, or remove a birthday through a Discord panel and private modal.'],
  ['alpha.72', 'Birthday module', 'Added private month/day registration, annual announcements, timezones, role pings, and duplicate protection.'],
];

function status(item) {
  return `<span class="status ${item.tone}">${escapeHtml(item.status)}</span>`;
}

function roadmapCard(item) {
  return `<article class="card span-4 roadmap-card"><div class="roadmap-card-head"><h3>${escapeHtml(item.title)}</h3>${status(item)}</div><p>${escapeHtml(item.copy)}</p></article>`;
}

function integrationCard(item) {
  return `<article class="card span-4 roadmap-card"><div class="eyebrow">INTEGRATION</div><div class="roadmap-card-head"><h3>${escapeHtml(item.title)}</h3>${status(item)}</div><p>${escapeHtml(item.copy)}</p></article>`;
}

export function renderRoadmap() {
  $('#content').innerHTML = `<div class="eyebrow">PRODUCT DIRECTION</div>
    <h1 class="page-title">Orbit Roadmap</h1>
    <p class="page-intro">A living view of what is deployed in Orbit, what is built but still waiting on provider approval, and which changes are planned next.</p>
    <div class="grid">
      <section class="card span-8 roadmap-hero"><div class="section-heading"><div><div class="eyebrow">CURRENT BUILD</div><h2>Orbit ${escapeHtml(ORBIT_VERSION)}</h2><p class="small">Reviewed ${ROADMAP_UPDATED}. This page is the product-level companion to the release notes.</p></div>${status({ status: 'Living roadmap', tone: 'roadmap' })}</div><p class="roadmap-lead">Orbit stays Cloudflare-first and modular: provider connections are optional, credentials remain server-side, and a provider being supported does not mean every server has connected or approved it.</p></section>
      <section class="card span-4"><div class="eyebrow">HOW TO READ THIS</div><h2>Clear status</h2><p class="small">Live now means the feature is usable in the deployed build. Built, approval pending means Orbit’s code path is ready but a provider approval, OAuth scope, or account review is still blocking use. Planned means it is not a supported publishing target yet.</p></section>
    </div>
    <div class="section-heading roadmap-section-heading"><div><div class="eyebrow">SHIPPED CAPABILITIES</div><h2>Current Orbit</h2></div><span class="small">Ready in the current build</span></div>
    <div class="grid">${currentFeatures.map(roadmapCard).join('')}</div>
    <div class="section-heading roadmap-section-heading"><div><div class="eyebrow">API AND CONNECTION STATUS</div><h2>TikTok, YouTube, and Ko-fi</h2></div><span class="small">Supported, with setup boundaries called out</span></div>
    <div class="grid">${integrationStatus.map(integrationCard).join('')}</div>
    <div class="section-heading roadmap-section-heading"><div><div class="eyebrow">FORWARD CHANGES</div><h2>What comes next</h2></div><span class="small">Priority and dependencies are explicit</span></div>
    <div class="grid">${plannedChanges.map(roadmapCard).join('')}</div>
    <div class="section-heading roadmap-section-heading"><div><div class="eyebrow">COST-AWARE FUTURE FEATURES</div><h2>Ideas that need a larger budget</h2></div><span class="small">No feature paywalls planned</span></div>
    <div class="grid">${budgetDependentFeatures.map(roadmapCard).join('')}</div>
    <section class="card roadmap-history"><div class="section-heading"><div><div class="eyebrow">RECENT CHANGE HISTORY</div><h2>Recent patches</h2></div><span class="small">Newest first</span></div><div class="roadmap-change-list">${recentChanges.map(([version, title, copy]) => `<div class="roadmap-change"><span class="status foundation">${escapeHtml(version)}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div></div>`).join('')}</div></section>`;
}
