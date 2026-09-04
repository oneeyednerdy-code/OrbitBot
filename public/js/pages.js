import { beginPageRender, state } from './core.js';
import { renderLoading, renderError, renderNoServers, renderInstallNeeded, renderGuildAuthorizationError } from './pages/common.js';
import { renderOverview } from './pages/overview.js';
import { renderVerification } from './pages/verification.js';
import { renderFoundation } from './pages/foundation.js';
import { renderSettings } from './pages/settings.js';
import { renderModeration } from './pages/moderation.js';
import { renderRoles } from './pages/roles.js';
import { renderTickets } from './pages/tickets.js';
import { renderScheduler } from './pages/scheduler.js';
import { renderLeveling } from './pages/leveling.js';
import { renderAutomation } from './pages/automation.js';
import { renderCommunity } from './pages/community.js';
import { renderCommunityEngagement } from './pages/community-engagement.js';
import { renderKofi } from './pages/kofi.js';
import { renderCreator } from './pages/creator.js';
import { renderSocial } from './pages/social.js';
import { renderShortVideo } from './pages/short-video.js';
import { renderDiagnostics, renderLogs } from './pages/diagnostics.js';
import { renderSecurity } from './pages/security.js';
import { renderShield } from './pages/shield.js';
import { renderDirectory } from './pages/directory.js';
import { renderEvents } from './pages/events.js';
import { renderApplications } from './pages/applications.js';
import { renderHealth } from './pages/health.js';
import { renderSafety } from './pages/safety.js';
import { renderOperations } from './pages/operations.js';
import { renderOnboarding } from './pages/onboarding.js';
import { renderConnections } from './pages/connections.js';
import { renderBugs } from './pages/bugs.js';
import { renderChannelManager } from './pages/channel-manager.js';

export { renderLoading, renderError, renderNoServers, renderInstallNeeded, renderGuildAuthorizationError };

export function renderPage(){
  if(!state.bundle){if(!state.guildId)renderNoServers();return}
  beginPageRender();
  switch(state.page){
    case 'overview': return renderOverview();
    case 'verification': return renderVerification();
    case 'moderation': return renderModeration();
    case 'roles': return renderRoles();
    case 'tickets': return renderTickets();
    case 'scheduler': return renderScheduler();
    case 'leveling': return renderLeveling();
    case 'automation': return renderAutomation();
    case 'community': return renderCommunity();
    case 'community-engagement': return renderCommunityEngagement();
    case 'kofi': return renderKofi();
    case 'creator': return renderCreator();
    case 'social': return renderSocial();
    case 'short-video': return renderShortVideo();
    case 'security': return renderSecurity();
    case 'shield': return renderShield();
    case 'directory': return renderDirectory();
    case 'events': return renderEvents();
    case 'applications': return renderApplications();
    case 'health': return renderHealth();
    case 'safety': return renderSafety();
    case 'operations': return renderOperations();
    case 'onboarding': return renderOnboarding(false);
    case 'features': return renderOnboarding(true);
    case 'connections': return renderConnections();
    case 'bugs': return renderBugs();
    case 'channel-manager': return renderChannelManager();
    case 'diagnostics': return renderDiagnostics();
    case 'logs': return renderLogs();
    case 'settings': return renderSettings();
    default: return renderFoundation(state.page);
  }
}
