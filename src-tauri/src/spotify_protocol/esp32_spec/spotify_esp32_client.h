/**
 * @file spotify_esp32_client.h
 * @brief ESP32-C3 C/C++ Header Interface for Spotify Web API HTTP Client
 * 
 * Maps 1:1 with `src-tauri/src/spotify_protocol/endpoints.rs`.
 * Compatible with ESP-IDF `esp_http_client` and `cJSON`.
 */

#ifndef SPOTIFY_ESP32_CLIENT_H
#define SPOTIFY_ESP32_CLIENT_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char id[64];
    char uri[128];
    char name[128];
    char artist[128];
    char album[128];
    char album_art_url[256];
    uint32_t duration_ms;
} spotify_track_t;

typedef struct {
    char id[64];
    char name[64];
    char device_type[32];
    bool is_active;
    uint8_t volume_percent;
} spotify_device_t;

typedef struct {
    bool is_playing;
    uint32_t progress_ms;
    uint32_t duration_ms;
    spotify_track_t track;
    spotify_device_t device;
    bool has_track;
    bool has_device;
    char repeat_mode[16];
    bool shuffle_state;
    uint64_t timestamp;
} spotify_player_state_t;

/**
 * @brief Initialize the Spotify client with an OAuth2 access token.
 */
int spotify_client_init(const char *access_token);

/**
 * @brief Update the bearer token when refreshed.
 */
void spotify_client_set_token(const char *access_token);

/**
 * @brief GET /v1/me/player
 * Parses Spotify playback state into `state`.
 * @return 0 on success, non-zero on HTTP error / 204 no content.
 */
int spotify_get_player_state(spotify_player_state_t *state);

/**
 * @brief PUT /v1/me/player/play
 */
int spotify_play(const char *device_id);

/**
 * @brief PUT /v1/me/player/pause
 */
int spotify_pause(const char *device_id);

/**
 * @brief POST /v1/me/player/next
 */
int spotify_next(const char *device_id);

/**
 * @brief POST /v1/me/player/previous
 */
int spotify_previous(const char *device_id);

/**
 * @brief PUT /v1/me/player/seek?position_ms={position_ms}
 */
int spotify_seek(uint32_t position_ms, const char *device_id);

/**
 * @brief PUT /v1/me/player/volume?volume_percent={volume_percent}
 */
int spotify_set_volume(uint8_t volume_percent, const char *device_id);

/**
 * @brief PUT /v1/me/player (Transfer playback to device_id)
 */
int spotify_transfer_playback(const char *device_id, bool play);

#ifdef __cplusplus
}
#endif

#endif // SPOTIFY_ESP32_CLIENT_H
