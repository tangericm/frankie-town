import Phaser from "phaser";

/**
 * The game's one audio layer: one music loop, a short SFX vocabulary, and a mute switch.
 *
 * Files live under public/assets/audio (see LICENSES.md there) and are loaded here, lazily, on
 * first use per scene -- not through the boot asset pack. Music is ~1-4 MB a track; putting it in
 * the pack would stall the title screen behind it, and a player who mutes never needs it at all.
 *
 * One instance per game, on the registry (same pattern as GameState), because music has to
 * survive scene changes: every room shares the one home theme, and it must not restart at a door. Phaser's SoundManager is already game-wide; this just owns "what's playing" on top.
 */

export type MusicTrack = "home-town";
export type SfxKey =
	| "step1" | "step2" | "step3" | "step4"
	| "door-open" | "door-close"
	| "journal-tick" | "journal-open" | "journal-close"
	| "pickup" | "dialogue-open" | "dialogue-blip" | "ui-click" | "reward" | "setback"
	| "cart-hit" | "gate" | "bar-hit" | "bar-miss"
	| "bark" | "cluck";

const SFX_KEYS: SfxKey[] = [
	"step1", "step2", "step3", "step4",
	"door-open", "door-close",
	"journal-tick", "journal-open", "journal-close",
	"pickup", "dialogue-open", "dialogue-blip", "ui-click", "reward", "setback",
	"cart-hit", "gate", "bar-hit", "bar-miss",
	"bark", "cluck",
];

/** One shared music loop continues across room changes. */
export const SCENE_MUSIC: Record<string, MusicTrack> = {
	Title: "home-town",
	Apartment: "home-town",
	Bakery: "home-town",
	Street: "home-town",
	Market: "home-town",
	PaninisFlat: "home-town",
};

/** Per-speaker dialogue voice: the species noise for the animals that have one, a soft page/
 * cloth rustle for everyone else. Played once per line, not per character -- a per-character
 * blip at 22ms/char is a machine gun on a 120-character line. */
export const SPEAKER_VOICE: Record<string, SfxKey> = {
	Frankie: "bark",
	Rafa: "bark",
};

const MUSIC_VOLUME = 0.32;
const SFX_VOLUME = 0.7;
const FADE_MS = 700;
const MUTE_KEY = "frankie:muted";
const REGISTRY_KEY = "frankie:audio";
const AUDIO_ROOT = "assets/audio";

/** A given file is offered in both containers; Phaser picks the first the browser can decode --
 * OGG (Vorbis/Opus) for Chrome/Firefox, M4A (AAC) for Safari. */
function urls(kind: "music" | "sfx", key: string): string[] {
	return [`${AUDIO_ROOT}/${kind}/${key}.ogg`, `${AUDIO_ROOT}/${kind}/${key}.m4a`];
}

export class AudioManager {
	private game: Phaser.Game;
	private muted: boolean;
	private currentTrack: MusicTrack | null = null;
	private current: Phaser.Sound.BaseSound | null = null;
	private wantedTrack: MusicTrack | null = null;
	private loading = new Set<string>();
	private lastStepAt = 0;
	private stepIndex = 0;
	/** The scene whose tween manager runs the current crossfade -- always the most recently
	 * attached one, since a scene being left is shutting its own tweens down. */
	private tweenScene: Phaser.Scene | null = null;
	private unlockPending = false;

	constructor(game: Phaser.Game) {
		this.game = game;
		this.muted = readMuted();
		this.game.sound.mute = this.muted;
		// Coming back to the tab: the browser may have suspended or interrupted the AudioContext
		// while the game was hidden. Nudge it awake and restart the loop if it was lost; every
		// step is best-effort, nothing here may throw into the page.
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState !== "visible") return;
			this.recover();
		});
	}

	private recover() {
		try {
			const ctx = (this.game.sound as unknown as { context?: AudioContext }).context;
			if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
			if (this.current && !this.current.isPlaying && !this.muted) {
				this.current.play();
			}
		} catch {
			// Not a WebAudio manager, or the browser refused: the next gesture unlocks it.
		}
	}

	isMuted(): boolean {
		return this.muted;
	}

	setMuted(muted: boolean) {
		this.muted = muted;
		this.game.sound.mute = muted;
		try {
			localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
		} catch {
			// Storage unavailable: the setting holds for this session only.
		}
		// Unmuting on a scene that never started its music (because it was muted when it loaded)
		// picks it up now rather than waiting for the next room.
		if (!muted && this.tweenScene?.sys.isActive()) this.attach(this.tweenScene);
	}

	/** Call from every scene's attach: loads what this scene needs (once) and starts/crossfades
	 * its music. `scene.load` is used so loading rides Phaser's own loader/decoder, but it runs as
	 * an extra load pass after create(), never blocking the scene itself. */
	attach(scene: Phaser.Scene) {
		this.tweenScene = scene;
		const track = SCENE_MUSIC[scene.scene.key] ?? null;
		this.wantedTrack = track;
		// Cache each file independently: partial failures and abandoned scene loaders are retryable.
		const pending = [
			...SFX_KEYS.map(key => ({ key: `sfx-${key}`, paths: urls("sfx", key) })),
			...(track ? [{ key: `music-${track}`, paths: urls("music", track) }] : []),
		].filter(file => !this.game.cache.audio.exists(file.key) && !this.loading.has(file.key));
		if (!pending.length) { this.playWanted(); return; }
		for (const file of pending) {
			this.loading.add(file.key);
			scene.load.audio(file.key, file.paths);
		}
		const release = () => {
			for (const file of pending) this.loading.delete(file.key);
			scene.load.off(Phaser.Loader.Events.COMPLETE, complete);
			scene.events.off(Phaser.Scenes.Events.SHUTDOWN, release);
		};
		const complete = () => { release(); this.playWanted(); };
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
		scene.load.once(Phaser.Loader.Events.COMPLETE, complete);
		scene.load.start();
	}

	private playWanted() {
		const track = this.wantedTrack;
		if (!track || track === this.currentTrack) return;
		if (!this.game.cache.audio.exists(`music-${track}`)) return;
		// Before the first user gesture the browser won't start audio. Phaser unlocks on the first
		// pointer/key event; wait for that rather than calling play() into a locked context.
		if (this.game.sound.locked) {
			if (!this.unlockPending) {
				this.unlockPending = true;
				this.game.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
					this.unlockPending = false;
					this.playWanted();
				});
			}
			return;
		}
		const tweens = this.tweenScene?.tweens;
		const previous = this.current;
		if (previous && tweens) {
			tweens.add({
				targets: previous,
				volume: 0,
				duration: FADE_MS,
				onComplete: () => {
					previous.stop();
					previous.destroy();
				},
			});
		} else if (previous) {
			previous.stop();
			previous.destroy();
		}
		const next = this.game.sound.add(`music-${track}`, { loop: true, volume: tweens ? 0 : MUSIC_VOLUME });
		try {
			next.play();
		} catch {
			// A suspended context on a backgrounded tab; recover() retries when it is visible again.
		}
		if (tweens) tweens.add({ targets: next, volume: MUSIC_VOLUME, duration: FADE_MS });
		this.current = next;
		this.currentTrack = track;
	}

	/** Fire-and-forget. Silently no-ops until the SFX set has loaded, which on a first visit is a
	 * second or two into the apartment -- an early footstep going missing is not worth a queue. */
	sfx(key: SfxKey, opts: { volume?: number; rate?: number; detune?: number } = {}) {
		if (!this.game.cache.audio.exists(`sfx-${key}`)) return;
		try {
			this.game.sound.play(`sfx-${key}`, {
				volume: SFX_VOLUME * (opts.volume ?? 1),
				rate: opts.rate ?? 1,
				detune: opts.detune ?? 0,
			});
		} catch {
			// A one-shot lost to a suspended context is not worth anything louder than silence.
		}
	}

	/** Alternating footsteps, rate-limited to a walking cadence. Call every frame with the
	 * player's speed; it decides whether this frame is a step. */
	footstep(now: number, speed: number, cadenceMs = 300): boolean {
		if (speed < 20) return false;
		if (now - this.lastStepAt < cadenceMs) return false;
		this.lastStepAt = now;
		this.stepIndex = (this.stepIndex + 1) % 4;
		this.sfx(`step${(this.stepIndex + 1) as 1 | 2 | 3 | 4}`, { volume: 0.35, detune: Phaser.Math.Between(-150, 150) });
		return true;
	}

	/** The per-line voice for a dialogue speaker. Noise/bumper phases of the translation gag are
	 * the species sound by definition; a thought is silent (it's in his head). */
	voice(speaker: string, phase: string) {
		if (phase === "thought") return;
		if (phase === "bumper") {
			this.sfx("ui-click", { volume: 0.5 });
			return;
		}
		const key = SPEAKER_VOICE[speaker] ?? "dialogue-blip";
		this.sfx(key, { volume: key === "bark" ? 0.4 : 0.6, detune: Phaser.Math.Between(-200, 200) });
	}
}

function readMuted(): boolean {
	try {
		return localStorage.getItem(MUTE_KEY) === "1";
	} catch {
		return false;
	}
}

export function getAudio(scene: Phaser.Scene): AudioManager {
	let audio = scene.game.registry.get(REGISTRY_KEY) as AudioManager | undefined;
	if (!audio) {
		audio = new AudioManager(scene.game);
		scene.game.registry.set(REGISTRY_KEY, audio);
	}
	return audio;
}
