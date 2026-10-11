import Phaser from "phaser";

/**
 * Recenters a fixed-zoom, fixed-bounds room camera whenever the RESIZE-mode canvas is larger
 * than the zoomed room in some axis. Once the camera's display size (world units visible, i.e.
 * `cam.width / zoom`) exceeds the bounds size in that axis, Phaser's clamp (Camera.clampX/Y)
 * collapses `scrollX`/`scrollY` to a single fixed value derived from `bounds.x`/`bounds.y`, and
 * `startFollow` can no longer move it -- so the room ends up wherever that fixed value happens
 * to land, not centered.
 *
 * `scrollX` itself is NOT the rendered left edge once zoom != 1 -- Phaser's `preRender` derives
 * the actual visible rect (`cam.worldView`) from `scrollX` via a second offset
 * (`scrollX + width/2 - displayWidth/2`) that exactly cancels the offset baked into the clamped
 * `scrollX` value, so the two offsets net out and `worldView.x` in the degenerate case reduces
 * to plain `bounds.x` (confirmed against a live `cam.worldView` read, not just the source, since
 * reasoning about `scrollX` alone here previously led to an incorrect "corrected" formula that
 * looked right on paper but rendered off-center). So centering the room only requires setting
 * `bounds.x`/`bounds.y` to the desired visible-rect origin directly -- no correction term needed.
 */
export function fitCameraToRoom(cam: Phaser.Cameras.Scene2D.Camera, roomWidth: number, roomHeight: number, zoom: number) {
	const displayWidth = cam.width / zoom;
	const displayHeight = cam.height / zoom;
	const boundsX = displayWidth > roomWidth ? (roomWidth - displayWidth) / 2 : 0;
	// Centred horizontally, but anchored to the BOTTOM vertically when the room is shorter than the
	// viewport: a phone in portrait showing the bakery (560px tall at NARROW_ZOOM 1.1 = 616 screen px
	// of an 844px screen) used to centre it, leaving a dark band both above and below, with the
	// floating joystick and the dialogue box sitting in the lower one over nothing. The rooms' own
	// exits are all on their south wall, so the bottom is the edge worth keeping flush.
	// Panini's especially short room leaves a large upper void on portrait phones. Share that
	// spare space above/below the room; the south exit stays just above the dialogue panel.
	const centerShortRoom = cam.scene?.scene?.key === "PaninisFlat" && cam.height > cam.width;
	const boundsY = displayHeight > roomHeight ? (roomHeight - displayHeight) / (centerShortRoom ? 2 : 1) : 0;
	cam.setBounds(boundsX, boundsY, roomWidth, roomHeight);
}

/**
 * The camera zoom for a scrolling room, reduced on a viewport too narrow to show a useful slice.
 *
 * Every room is authored around ROOM_ZOOM, which suits a desktop window: at 1.6 a 1280px-wide canvas
 * shows 800 world px, more than the market's whole 640px width. The same zoom on a 390px phone shows
 * 244 -- barely more than a third of that room, so the market "is very small" on mobile in the sense
 * that you can never see enough of it at once to read the space. Below MIN_VISIBLE_WIDTH world px of
 * horizontal view, drop to NARROW_ZOOM instead.
 *
 * Two fixed steps rather than a continuous fit-to-width: this is pixel art, and a zoom derived from
 * the viewport lands on arbitrary fractions that soften every edge in the room. 1.1 is close enough
 * to 1:1 to stay crisp.
 */
export const ROOM_ZOOM = 1.6;
export const NARROW_ZOOM = 1.1;
/** Below this many world px of visible width at ROOM_ZOOM, the view is too tight to play in. */
export const MIN_VISIBLE_WIDTH = 420;

/**
 * The player's own zoom preference, as a multiplier on whichever of the two automatic steps above
 * this viewport gets.
 *
 * A multiplier rather than an absolute zoom: the automatic step already encodes "this is a phone,
 * back off", and a player who wants a wider view on a phone and a player who wants one on a desktop
 * are asking for the same relative thing. Discrete steps rather than a continuous slider because
 * this is pixel art -- an arbitrary fraction lands between texels and softens every edge in the
 * room, which is the same reason roomZoom itself is two fixed steps instead of a fit-to-width.
 */
export const ZOOM_SCALES = [0.7, 0.85, 1, 1.15, 1.3] as const;
export const DEFAULT_ZOOM_SCALE = 1;
const ZOOM_SCALE_KEY = "frankie:zoomScale";

/** Best-effort localStorage read: private browsing throws on access, not just on write. */
function readStoredZoomScale(): number | null {
	try {
		const raw = window.localStorage.getItem(ZOOM_SCALE_KEY);
		const value = raw === null ? NaN : Number(raw);
		return ZOOM_SCALES.includes(value as (typeof ZOOM_SCALES)[number]) ? value : null;
	} catch {
		return null;
	}
}

export function getZoomScale(game: Phaser.Game): number {
	const cached = game.registry.get(ZOOM_SCALE_KEY) as number | undefined;
	if (typeof cached === "number") return cached;
	const stored = readStoredZoomScale() ?? DEFAULT_ZOOM_SCALE;
	game.registry.set(ZOOM_SCALE_KEY, stored);
	return stored;
}

export function setZoomScale(game: Phaser.Game, scale: number) {
	game.registry.set(ZOOM_SCALE_KEY, scale);
	try {
		window.localStorage.setItem(ZOOM_SCALE_KEY, String(scale));
	} catch {
		// Storage unavailable. The setting still applies for this session; it just won't persist.
	}
}

/**
 * Re-applies zoom and room fit to a camera already set up by a scene, without the scene having to
 * know the setting exists. `cam.getBounds()` gives the room size straight back, because
 * fitCameraToRoom is what set those bounds in the first place.
 */
export function reapplyRoomZoom(cam: Phaser.Cameras.Scene2D.Camera) {
	const bounds = cam.getBounds();
	if (bounds.width <= 0 || bounds.height <= 0) return;
	const zoom = roomZoom(cam);
	cam.setZoom(zoom);
	fitCameraToRoom(cam, bounds.width, bounds.height, zoom);
}

/** Each room's world size, so the portrait rule below can know how tall the room is without the
 * generated scene files having to pass it. Same numbers the scenes give fitCameraToRoom. */
export const ROOM_SIZES: Record<string, { width: number; height: number }> = {
	PaninisFlat: { width: 608, height: 480 },
	Apartment: { width: 608, height: 704 },
	Bakery: { width: 608, height: 560 },
	// Rows 1104 onward are only transparent/cream export padding below the last painted kerb.
	// The full physics/tilemap canvas stays 1232; only the camera excludes that dead strip.
	Market: { width: 640, height: 1104 },
	// height is the map's actual painted extent (map-base.png is fully transparent below row
	// 888 -- a clean cutoff, measured with base.getbbox() in scripts/build-street-pixellab.py, not
	// a few stray pixels), not the 992 canvas the export sits on -- see that script's ROOM_H for
	// the full writeup. Using the raw canvas here let a follow camera scroll into that void.
	// Tightened again to 840: rows 840-887 are a flat pale-cream export margin under the kerb, a
	// dead band on screen. Keep in sync with the builder's PAINTED_H.
	Street: { width: 1232, height: 840 },
};
/** On a portrait phone, never zoom in so far that fewer world px than this are visible across. */
export const MIN_PORTRAIT_VISIBLE_WIDTH = 300;
export const PORTRAIT_MAX_ZOOM = 1.4;

/**
 * The automatic zoom for a viewport, before the player's own multiplier.
 *
 * Landscape/desktop: ROOM_ZOOM, or NARROW_ZOOM when the view would be too tight. Portrait phone
 * with a room shorter than the screen (the bakery at 1.1 filled 616 of 844px, the rest a dark
 * band): zoom in until the room fills the height, capped so at least MIN_PORTRAIT_VISIBLE_WIDTH
 * world px stay visible and never past PORTRAIT_MAX_ZOOM. The room then scrolls sideways under
 * the follow camera like the street does, instead of sitting small under a void.
 */
export function autoZoom(viewW: number, viewH: number, room?: { width: number; height: number }): number {
	const base = viewW / ROOM_ZOOM >= MIN_VISIBLE_WIDTH ? ROOM_ZOOM : NARROW_ZOOM;
	if (!room || viewH <= viewW) return base;
	if (room.height * base >= viewH) return base;
	const fill = viewH / room.height;
	const cap = viewW / MIN_PORTRAIT_VISIBLE_WIDTH;
	const portrait = Math.min(fill, cap, PORTRAIT_MAX_ZOOM);
	// Quantised to 0.05 so the value is stable across the one-pixel resizes Safari's chrome causes.
	return Math.max(base, Math.round(portrait * 20) / 20);
}

export function roomZoom(cam: Phaser.Cameras.Scene2D.Camera): number {
	// The narrow-viewport decision is made on the automatic zoom, not the scaled one: whether this
	// viewport is too tight to play in is a fact about the device, and letting a player's own zoom
	// choice flip that step would jump them between 1.6 and 1.1 mid-adjustment.
	// Optional chaining: unit tests hand in a bare {width, scene:{game}} camera with no scene key.
	const key = cam.scene?.scene?.key;
	const base = autoZoom(cam.width, cam.height ?? cam.width, key ? ROOM_SIZES[key] : undefined);
	return base * getZoomScale(cam.scene.game);
}
