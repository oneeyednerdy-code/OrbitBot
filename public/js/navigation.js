export const NAV_GROUPS = [
  {
    id: 'community',
    label: 'Community',
    items: [
      ['verification', 'Verification', '✓', 'protection'],
      ['roles', 'Roles', '◇', 'roles'],
      ['tickets', 'Tickets', '▣', 'tickets'],
      ['leveling', 'Leveling', '↗', 'leveling'],
      ['community', 'Community', '◉', 'creator_community'],
      ['community-engagement', 'Engagement', '?', 'creator_community'],
      ['counting', 'Counting', '#', 'creator_community'],
      ['birthdays', 'Birthdays', '🎂', 'creator_community'],
      ['applications', 'Applications & Appeals', '▤', 'creator_community'],
      ['creator', 'Community Alerts', '◌', 'alerts'],
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    items: [
      ['moderation', 'Moderation & Honeypot', '◆', 'protection'],
      ['shield', 'Shield Mode', '⬢', 'protection'],
      ['safety', 'Creator Safety Mode', '⚠', 'protection'],
      ['security', 'Security Center', '⬡', 'protection'],
      ['logs', 'Logs', '≡', 'protection'],
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    items: [
      ['automation', 'Automations', '⚡', 'automation'],
      ['scheduler', 'Scheduled Posts', '◷', 'scheduler'],
    ],
  },
  {
    id: 'creator',
    label: 'Creator',
    items: [
      ['connections', 'Connections', '⇄', ['alerts', 'social']],
      ['kofi', 'Ko-fi', '♥', 'kofi'],
      ['social', 'Social Publishing', '↻', 'social'],
      ['short-video', 'Short-Form Video', '▶', 'social'],
      ['directory', 'Creator Directory', '◍', 'creator_community'],
      ['events', 'Events', '◷', 'creator_community'],
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      ['roadmap', 'Roadmap', '⌁', null],
      ['operations', 'Operations Center', '◈', null],
      ['health', 'Community Health', '♡', 'creator_community'],
      ['channel-manager', 'Channel Manager', '▦', null, { ownerOnly: true }],
      ['diagnostics', 'Diagnostics', '◌', null],
      ['features', 'Manage Features', '＋', null],
      ['settings', 'Settings', '⚙', null],
      ['bugs', 'Developer Bug Inbox', '⌁', null, { operatorOnly: true }],
    ],
  },
].map(group => ({
  ...group,
  items: group.items.map(([page, label, icon, feature, access = {}], order) => ({
    page,
    label,
    icon,
    features: feature ? (Array.isArray(feature) ? feature : [feature]) : [],
    order,
    ...access,
  })),
}));

export const NAV_ITEMS = [
  { page: 'overview', label: 'Overview', icon: '◎', features: [], order: 0 },
  ...NAV_GROUPS.flatMap(group => group.items),
];

export const PAGE_FEATURES = Object.fromEntries(
  NAV_ITEMS.filter(item => item.features.length).map(item => [item.page, item.features]),
);

export function navigationItem(page) {
  return NAV_ITEMS.find(item => item.page === page) || null;
}

export function renderNavigation(target) {
  if (!target) return;
  const overview = NAV_ITEMS[0];
  const link = item => `<a class="nav-link" href="#${item.page}" data-page="${item.page}"${item.features.length ? ` data-feature="${item.features.join(' ')}"` : ''}${item.ownerOnly ? ' data-owner-only="1"' : ''}${item.operatorOnly ? ' data-operator-only="1"' : ''}><span class="nav-icon" aria-hidden="true">${item.icon}</span>${item.label}</a>`;
  target.innerHTML = `${link(overview)}${NAV_GROUPS.map(group => `<div class="nav-section" data-group="${group.id}">${group.label}</div>${group.items.map(link).join('')}`).join('')}`;
}
