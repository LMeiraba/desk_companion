use std::sync::Arc;
use tokio::sync::watch;

use crate::display_domain::DefaultDisplayFormatter;
use crate::hardware_domain::MockHardwareBridge;
use crate::hotspot::HotspotManager;
use crate::lyrics_domain::LyricsService;
use crate::media_domain::DefaultMediaRouter;
use crate::spotify_domain::{SpotifyAuth, SpotifyPoller, SpotifyRemoteClient, SpotifySource};

pub struct AppState {
    pub auth: Arc<SpotifyAuth>,
    pub client: Arc<SpotifyRemoteClient>,
    pub lyrics: Arc<LyricsService>,
    pub media_router: Arc<DefaultMediaRouter>,
    pub sdk_active_tx: watch::Sender<bool>,
    pub hardware_bridge: Arc<MockHardwareBridge>,
    pub display_formatter: Arc<DefaultDisplayFormatter>,
    pub hotspot: Arc<HotspotManager>,
}

impl AppState {
    pub fn new() -> (Self, SpotifyPoller) {
        let auth = Arc::new(SpotifyAuth::new());
        let client = Arc::new(SpotifyRemoteClient::new(auth.clone()));
        let lyrics = Arc::new(LyricsService::new());
        let (sdk_active_tx, sdk_active_rx) = watch::channel(false);

        let poller = SpotifyPoller::new(client.clone(), sdk_active_rx);

        let media_router = Arc::new(DefaultMediaRouter::new("spotify"));
        let spotify_source = Arc::new(SpotifySource::new(client.clone()));
        // Synchronously register spotify source into router
        media_router.add_source(spotify_source);

        let hardware_bridge = Arc::new(MockHardwareBridge::new());
        let display_formatter = Arc::new(DefaultDisplayFormatter::new());
        let hotspot = Arc::new(HotspotManager::new());

        let state = Self {
            auth,
            client,
            lyrics,
            media_router,
            sdk_active_tx,
            hardware_bridge,
            display_formatter,
            hotspot,
        };

        (state, poller)
    }
}
