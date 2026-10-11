import Phaser from "phaser";
import { getGameState } from "./GameState";
import { DialogueBox } from "./DialogueBox";
import { InteractionManager } from "./InteractionManager";
import { SceneTransition } from "./SceneTransition";
import { facingFromAnimation } from "./playerMovement";
import { JournalUI } from "./JournalUI";
import { TouchControls } from "./TouchControls";
import { SettingsUI } from "./SettingsUI";
import { celebrateIngredient, flyPickup, INGREDIENT_COLORS } from "./celebrate";
import { QUEST } from "../data/quest";
import {
	RAFA_POSITION,
	RAFA_WALK_IN_START,
	RAFA_OPENING_POSITION,
	FRANKIE_DOG_BED_SPAWN,
	FRANKIE_WAKE_SPOT,
	OPENING_DIALOGUE,
	RAFA_MARKET_REMINDER_LINES,
	RAFA_REMINDER_LINES,
	ENDING_DIALOGUE,
	ENDING_REMINDER_LINES,
	APARTMENT_DOOR,
	APARTMENT_SPAWN_FROM_STREET,
	RAFA_COLLIDER,
	MICHELL_POSITION,
	MICHELL_INTERACT_RADIUS,
	APARTMENT_SOFA_BLOCKER,
	MICHELL_BADGE_OFFSET,
	michellLines,
	MICHELL_WINDOW_POSITION,
	MICHELL_WINDOW_ZONE,
	INGREDIENT_PROPS,
} from "../data/apartment.gameplay";
import {
	TEDDY_POSITION,
	TEDDY_INTERACT_RADIUS,
	FETCH_ITEMS,
	HIDING_SPOTS,
	teddyBusyLines,
	TEDDY_HANDOVER_LINES,
	TEDDY_ALREADY_GIVEN_LINES,
	TEDDY_AFTER_CAKE_LINES,
	BAKERY_DOOR,
	BAKERY_SPAWN_FROM_STREET,
	BAKERY_LOCKED_LINES,
	HIDING_SPOT_INTERACT_RADIUS,
} from "../data/bakery.gameplay";
import {
	STREET_DOOR_TO_BAKERY,
	STREET_SPAWN_FROM_BAKERY,
	STREET_DOOR_TO_APARTMENT,
	STREET_SPAWN_FROM_APARTMENT,
	STREET_DOOR_TO_MARKET,
	STREET_SPAWN_FROM_MARKET,
	STREET_DOOR_TO_PANINIS,
	STREET_SPAWN_FROM_PANINIS,
	STORK_POSITION,
	PIGEON_WANDER_BOUNDS,
	PIGEON_STARTS,
	STREET_MARKET_ARCH_PASSAGE_BLOCKER,
	STREET_MARKET_PILLAR_BLOCKERS,
	WINDOW_BOX,
	WINDOW_BOX_LINES,
} from "../data/street.gameplay";
import { FRANKIE_ORIGIN } from "../data/frankieAnim";
import { addNpcCollider } from "./npcCollider";
import { addStaticBlocker, removeGeneratedBlocker } from "./worldColliders";
import { createStork, createPigeon } from "./wildlife";
import { MarketGameplay } from "./market/MarketGameplay";
import { PaninisFlatGameplay } from "./PaninisFlatGameplay";
import { PANINIS_DOOR, PANINIS_SPAWN } from "../data/paninis-flat.gameplay";
import { currentObjective } from "../data/objectives";
import { getAudio } from "./audio";
import { attachDinnerClues } from "./dinner";
import { DINNER_ASSIGNMENT, dinnerReminder } from "../data/dinner";
import { registerPropThoughts, findImageByTexture } from "./propThoughts";
import { TapMove } from "./TapMove";
import { squash, dustPuff, buzz, reward, burst, emote } from "./juice";
import { waterShimmer, steam, chimneySmoke, driftingLeaves, lampGlow, bubbles, idleLife, npcFidget, beamMotes } from "./ambient";
import { PANINI_SUNBEAM } from "../data/paninis-flat.gameplay";
import { PALETTE } from "./palette";
import { isScreenUI } from "./uiInput";
import { runEnding, placeCake, seatMichellAtTable, playMichell } from "./ending";
import { RAFA_AFTER_LINES, MICHELL_AFTER_LINES, MICHELL_NOTEBOOK_LINES, MICHELL_AT_TABLE, RAFA_STREET_POSITION } from "../data/ending";
import { PROP_THOUGHTS } from "../data/propThoughts";

interface HasFrankie {
	frankie: Phaser.GameObjects.Sprite;
	wasd: Record<string, Phaser.Input.Keyboard.Key>;
	cursors: Phaser.Types.Input.Keyboard.CursorKeys;
	faceAndSpawn: (x: number, y: number, facing: "north" | "south" | "east" | "west") => void;
	getFrankie?: () => Phaser.GameObjects.Sprite;
	getWorldColliders?: () => Phaser.Physics.Arcade.StaticGroup;
	getAuthoredImage?: (textureKey: string) => Phaser.GameObjects.Image | null;
}

interface HasBaker {
	baker: Phaser.GameObjects.Sprite;
}

interface HasMichell {
	michell: Phaser.GameObjects.Sprite;
}

/**
 * The one hook the generated scenes call, at the end of create(). Everything else lives in
 * src/data and src/systems -- this file just wires them together for a given scene key.
 * `scene` is typed loosely because Apartment/Bakery declare `frankie` as a
 * TypeScript-private field: private is compile-time only, and no gameplay logic is allowed to
 * live in the generated file itself, so this cast is the intended access point.
 */
export function attachGameplay(scene: Phaser.Scene, sceneKey: "Apartment" | "Bakery" | "Street" | "Market" | "PaninisFlat") {
	const s = scene as unknown as HasFrankie;
	const gameState = getGameState(scene);
	// Assigned further down, once the UI camera actually exists -- declared here so any world
	// object spawned at runtime (a found-item icon, a cutscene prop) can call
	// `uiCamera.ignore(itself)` right after creation. See the assignment site for why this is
	// necessary at all: the ignore-list built there is a one-time snapshot.
	let uiCamera!: Phaser.Cameras.Scene2D.Camera;
	let updateMichellCollider = () => {};
	/** A per-scene per-frame hook (the bakery sniff cue, ambient motion); set by the scene branch that needs one. */
	let sceneUpdate: () => void = () => {};
	const dialogueBox = new DialogueBox(scene);
	const interactions = new InteractionManager(scene, () => ({ x: s.frankie.x, y: s.frankie.y }), () => facingFromAnimation(s.frankie));
	// Dev-only: lets a script drive/inspect this scene directly (see scripts/tests/manual-test-
	// dialogue.mjs) instead of simulating keyboard/touch input, which is fragile and slow to get
	// right around physics-based movement and timing. Never present in a production build.
	if (import.meta.env.DEV) {
		Object.assign(scene as unknown as Record<string, unknown>, { __interactions: interactions, __dialogueBox: dialogueBox });
	}
	if (new URLSearchParams(location.search).get("admin") === "1" || new URLSearchParams(location.search).has("playtest")) {
		scene.data.set("playtest:controls", {
			zones: () => interactions.debugState().zones,
			interact: (id: string) => interactions.interactForPlaytest(id),
			advance: () => { if (dialogueBox.isActive()) dialogueBox.advance(); },
		});
	}
	const transition = new SceneTransition(scene, () => facingFromAnimation(s.frankie));
	// The door that leads toward the current objective glows (see SceneTransition.setGoalResolver
	// and src/data/objectives.ts) -- the same "where now?" answer the journal shows as text.
	transition.setGoalResolver(() => currentObjective(gameState, sceneKey)?.doorTarget ?? null);
	const journal = new JournalUI(scene, gameState, sceneKey);
	const touchControls = new TouchControls(scene, dialogueBox, interactions);
	// Tap/click to move (and to walk up to a thing and use it). Created after TouchControls so the
	// stick's own pointer handling stays first in line.
	const tapMove = new TapMove(scene, () => s.frankie, interactions, () => [s.cursors?.up, s.cursors?.down, s.cursors?.left, s.cursors?.right, s.wasd?.W, s.wasd?.A, s.wasd?.S, s.wasd?.D], () => scene.physics.world.isPaused || dialogueBox.isActive(), () => transition.doorList());
	// Desktop: a click advances an open dialogue, the same as a tap does on touch (TouchControls
	// handles that path). TapMove ignores the release of a click that started while paused.
	if (!scene.sys.game.device.input.touch) scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
		if (scene.physics.world.isPaused || over.some(isScreenUI)) interactions.consumePointer(pointer);
		if (dialogueBox.isActive() && !scene.data.get("hud:modal")) dialogueBox.advance();
	});
	let menuOwnsPause = false;
	const openMenus = new Set<string>();
	const onHudPanel = (id: string, open: boolean) => {
		if (open) openMenus.add(id); else openMenus.delete(id);
		if (openMenus.size) {
			if (!menuOwnsPause) menuOwnsPause = !scene.physics.world.isPaused;
			scene.data.set("hud:modal", true);
			scene.physics.world.pause();
			scene.time.paused = true;
			tapMove.cancel();
			touchControls.cancel();
		} else {
			const resume = menuOwnsPause && !dialogueBox.isActive();
			menuOwnsPause = false;
			scene.data.set("hud:modal", false);
			scene.time.paused = false;
			if (resume) scene.physics.world.resume();
		}
	};
	scene.events.on("hud:panel", onHudPanel);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { scene.events.off("hud:panel", onHudPanel); scene.time.paused = false; scene.data.set("hud:modal", false); });
	const settings = new SettingsUI(scene);
	const onDialogueKey = (event: KeyboardEvent) => {
		if (!scene.physics.world.isPaused || !dialogueBox.isActive() || event.repeat || !["Space", "KeyE"].includes(event.code)) return;
		if (!scene.data.get("hud:modal") && dialogueBox.isActive()) dialogueBox.advance();
		// Handle the keydown itself: Phaser clears JustDown on a same-frame keyup.
		Phaser.Input.Keyboard.JustDown(scene.input.keyboard!.addKey(event.keyCode));
		event.stopPropagation();
	};
	scene.input.keyboard!.on("keydown", onDialogueKey);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off("keydown", onDialogueKey));
	let marketGameplay: MarketGameplay | null = null;

	// Sound: this scene's music (lazy-loaded, crossfaded from whatever was playing) and the
	// dialogue voices. Everything else plays itself from the system that owns the moment.
	const audio = getAudio(scene);
	audio.attach(scene);
	const onDialogueOpen = () => audio.sfx("dialogue-open", { volume: 0.5 });
	const onDialogueLine = (speaker: string, phase: string) => audio.voice(speaker, phase);
	scene.events.on(DialogueBox.EVENT_OPEN, onDialogueOpen);
	scene.events.on(DialogueBox.EVENT_LINE, onDialogueLine);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
		scene.events.off(DialogueBox.EVENT_OPEN, onDialogueOpen);
		scene.events.off(DialogueBox.EVENT_LINE, onDialogueLine);
	});
	const playerSpeed = () => {
		const body = s.frankie.body as Phaser.Physics.Arcade.Body | null;
		return body ? body.velocity.length() : 0;
	};

	Object.assign(scene, { __tapMove: tapMove });

	SceneTransition.fadeIn(scene);
	const spawnId = SceneTransition.consumePendingSpawn(scene);

	const pauseDuring = (play: () => void) => {
		scene.physics.world.pause();
		tapMove.cancel();
		touchControls.cancel();
		(s.frankie.body as Phaser.Physics.Arcade.Body).stop();
		// Paused scene updates preserve authored poses, but must retire input-driven walking.
		if (s.frankie.anims.currentAnim?.key.startsWith("frankie-walking-")) s.faceAndSpawn(s.frankie.x, s.frankie.y, facingFromAnimation(s.frankie));
		play();
	};
	const dialogueDone = () => {
		// Completing a script hands its pause to any remaining menu instead of releasing it.
		if (openMenus.size) menuOwnsPause = true;
		else scene.physics.world.resume();
	};

	if (sceneKey === "Apartment") {
		// faceAndSpawn, not setPosition: `facing` is a scene *instance* field and Phaser reuses scene
		// instances across scene.start(), so it survives the room change still pointing the way
		// Frankie was walking when he left -- which is always straight at the door he has just come
		// out of. Arriving spawns sit only ~20px clear of a door that fires on that same facing, so
		// the first frame of forward input walked him straight back where he came from.
		if (spawnId === "fromStreet") s.faceAndSpawn(APARTMENT_SPAWN_FROM_STREET.x, APARTMENT_SPAWN_FROM_STREET.y, "north");
		// The generated per-object footprint is a shallow strip at each object's base -- right for
		// walking behind a bookcase, wrong for the desk Michell is sitting at, which Frankie could
		// round the side of and stand in the middle of (see APARTMENT_SOFA_BLOCKER).
		const apartmentColliders = s.getWorldColliders?.();
		if (apartmentColliders) addStaticBlocker(scene, apartmentColliders, APARTMENT_SOFA_BLOCKER);

		const makeRafaAnim = (key: string) => {
			if (!scene.anims.exists(key)) {
				scene.anims.create({
					key,
					frames: scene.anims.generateFrameNumbers(`${key}-sheet`, {}),
					frameRate: 9,
					repeat: -1,
				});
			}
		};
		makeRafaAnim("rafa-idle-south");

		const firstVisit = !gameState.hasSeenIntro();
		// The day after the cake Rafa is out on the street (see the Street branch), giving the two
		// of them some room; his zone below is only added while he's here.
		const rafaAway = gameState.flag("cakeGiven");
		const rafaStart = firstVisit ? RAFA_WALK_IN_START : RAFA_POSITION;
		// Where Rafa ends up once he's settled: beside the dog bed for the opening (first visit
		// only -- see FRANKIE_DOG_BED_SPAWN), otherwise the usual RAFA_POSITION. Every later
		// visit recreates this scene fresh with firstVisit already false, so this always
		// collapses back to plain RAFA_POSITION once the opening has actually played.
		const rafaRestPosition = firstVisit ? RAFA_OPENING_POSITION : RAFA_POSITION;
		const rafa = scene.add
			.sprite(rafaStart.x, rafaStart.y, "rafa-idle-south-sheet", 0)
			.setOrigin(0.5, 1)
			.setDepth(RAFA_POSITION.y);

		if (!rafaAway) addNpcCollider(scene, s.frankie, { ...RAFA_COLLIDER, x: rafaRestPosition.x, y: rafaRestPosition.y });

		const beginOpeningDialogue = () => {
			pauseDuring(() =>
				dialogueBox.play(OPENING_DIALOGUE, () => {
					gameState.markIntroSeen();
					gameState.revealIngredient(QUEST.flourIngredientId);
					journal.show();
					dialogueDone();
				})
			);
		};

		const makeFrankieAnim = (key: string, sheet: string, repeat: number) => {
			if (!scene.anims.exists(key)) {
				scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(sheet, {}), frameRate: 8, repeat });
			}
		};

		// Opens the scene with Frankie already asleep (first visit only -- editorCreate already
		// started him in frankie-idle-south, so this overrides that) and wakes him into his
		// normal idle right as Rafa arrives, instead of the walk-in playing out in front of a
		// dog who is inexplicably already awake and standing.
		const wakeFrankieThen = (then: () => void) => {
			makeFrankieAnim("frankie-wake-up-south", "frankie-sleeping-wake-up-south-sheet", 0);
			// The wake sheet's feet sit on its last row where the sleeping sheet's sat 5px up, so
			// the anchor moves down by that much and the drawn body stays where it was.
			s.frankie.setOrigin(...FRANKIE_ORIGIN["wake-up-south"]).setY(FRANKIE_DOG_BED_SPAWN.y + 5);
			// The resized wake sheet ends on a standing dog ~44px tall against the idle sheet's 57:
			// he grows to full standing scale as he uncurls, so the hand-off to idle has no pop.
			s.frankie.setScale(1);
			s.frankie.play("frankie-wake-up-south");
			const grow = scene.tweens.add({ targets: s.frankie, scale: 1.3, duration: 1000, ease: "Sine.easeInOut" });
			s.frankie.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
				// Stop the grow tween before resetting, or its last tick lands after the reset and
				// leaves him at 1.3 with a scaled (displaced) physics body.
				grow.stop();
				s.frankie.setScale(1).setOrigin(...FRANKIE_ORIGIN["idle-south"]);
				s.frankie.play("frankie-idle-south");
				// A beat standing on the bed, then an unhurried step down onto the corridor floor
				// with the walk cycle at its own foot anchor (playing it under the idle anchor is
				// what made him hop 13px in the air), then hand the physics body the landing spot.
				scene.time.delayedCall(280, () => {
					const dist = Math.hypot(FRANKIE_WAKE_SPOT.x - s.frankie.x, FRANKIE_WAKE_SPOT.y - s.frankie.y);
					s.frankie.setOrigin(...FRANKIE_ORIGIN["walking-south"]);
					s.frankie.play("frankie-walking-south");
					scene.tweens.add({
						targets: s.frankie,
						x: FRANKIE_WAKE_SPOT.x,
						y: FRANKIE_WAKE_SPOT.y,
						duration: Math.max(300, (dist / 55) * 1000),
						ease: "Sine.easeInOut",
						onUpdate: () => s.frankie.setDepth(s.frankie.y),
						onComplete: () => {
							s.faceAndSpawn(FRANKIE_WAKE_SPOT.x, FRANKIE_WAKE_SPOT.y, "south");
							// The world is paused for the whole opening, so the body never gets a
							// physics step to re-sync from the sprite; reset it here (same idiom as
							// the market's lane reset) or it keeps the sleeping frame's stale position.
							(s.frankie.body as Phaser.Physics.Arcade.Body).reset(FRANKIE_WAKE_SPOT.x, FRANKIE_WAKE_SPOT.y);
							then();
						},
					});
				});
			});
		};

		if (firstVisit) {
			// Curled up in his own dog bed (FRANKIE_DOG_BED_SPAWN), not asleep in the open floor at
			// the default spawn -- the bed sat empty by Michell's desk while he slept elsewhere.
			// setPosition, not faceAndSpawn: the sleeping origin/animation below replace its idle
			// ones immediately, and faceAndSpawn's own idle-south frame would only flash for one tick.
			// Drawn on top of the bed (depth 177 in Apartment.ts), not sorted by his feet, which
			// would put him behind it; the physics body is parked here too but never moves until
			// wakeFrankieThen hands it FRANKIE_WAKE_SPOT.
			s.frankie.setPosition(FRANKIE_DOG_BED_SPAWN.x, FRANKIE_DOG_BED_SPAWN.y).setDepth(178);
			// The sleeping_zzz sheet already draws its own "Z" above him each loop -- an
			// additional floating text "Z" was tried here too and just doubled up on screen.
			makeFrankieAnim("frankie-sleeping-south", "frankie-sleeping-sleeping-zzz-south-sheet", -1);
			s.frankie.setOrigin(...FRANKIE_ORIGIN["sleeping-south"]);
			s.frankie.play("frankie-sleeping-south");
		}

		// Rafa arriving doesn't wake Frankie instantly -- he's clearly still trying, twice, while
		// Frankie keeps sleeping. Reads as "hey. HEY." before Frankie actually stirs. This used to
		// pop the shared "tap here" speech-bubble badge above Rafa, but that's the exact icon
		// InteractionManager uses for real interactive prompts elsewhere -- reusing it during a
		// cutscene the player has no control over read as a broken/stuck tap target instead of a
		// bark. A small insistent bounce on Rafa himself has no such ambiguity.
		const tryToWakeFrankie = (then: () => void) => {
			const nudge = () =>
				scene.tweens.add({
					targets: rafa,
					scaleX: { from: 1, to: 0.94 },
					scaleY: { from: 1, to: 1.12 },
					duration: 160,
					yoyo: true,
					ease: "Quad.easeOut",
				});
			nudge();
			scene.time.delayedCall(500, nudge);
			scene.time.delayedCall(1300, then);
		};

		if (firstVisit) {
			// Walk in from the door, straight line, to meet Frankie before the opening dialogue
			// begins -- camera follows him for the walk, then hands back to Frankie so he never
			// ends up panned past the point where the two of them meet.
			const cam = scene.cameras.main;
			// The scene opens on Frankie asleep in his bed and stays there: with the bed in the
			// room's top band the camera is clamped at the top edge, and Rafa's walk-in from the
			// door starts just off the bottom of the frame and comes up into it. (Following Rafa
			// opened on an empty middle of the room and panned about while he walked.)
			cam.startFollow(s.frankie, true);
			makeRafaAnim("rafa-walking-north");
			rafa.play("rafa-walking-north");
			pauseDuring(() => {
				const dist = Phaser.Math.Distance.Between(RAFA_WALK_IN_START.x, RAFA_WALK_IN_START.y, rafaRestPosition.x, rafaRestPosition.y);
				scene.tweens.add({
					targets: rafa,
					x: rafaRestPosition.x,
					y: rafaRestPosition.y,
					duration: dist * (1000 / 70),
					onUpdate: () => rafa.setDepth(rafa.y),
					onComplete: () => {
						rafa.play("rafa-idle-south");
						cam.startFollow(s.frankie, true);
						tryToWakeFrankie(() => wakeFrankieThen(beginOpeningDialogue));
					},
				});
			});
		} else {
			rafa.play("rafa-idle-south");
			journal.show();
		}

		const michell = (scene as unknown as HasMichell).michell;
		const has = (id: string) => gameState.hasIngredient(id);
		const marketDone = () => has(QUEST.eggsIngredientId) && has(QUEST.sugarIngredientId);

		// What's come home so far, on display (audit item 7). Gone once they're in the cake.
		const ingredientProps: Phaser.GameObjects.Image[] = [];
		if (!gameState.flag("bakeDone")) {
			for (const prop of INGREDIENT_PROPS) {
				if (!has(prop.ingredient) || !scene.textures.exists(prop.texture)) continue;
				ingredientProps.push(scene.add.image(prop.x, prop.y, prop.texture).setOrigin(0.5, 1).setScale(prop.scale).setDepth(prop.depth));
			}
		}
		const consumeIngredients = () => {
			for (const img of ingredientProps) {
				scene.tweens.add({ targets: img, alpha: 0, scale: 0, duration: 250, onComplete: () => img.destroy() });
			}
			ingredientProps.length = 0;
		};
		if (gameState.flag("cakeGiven")) placeCake(scene, (o) => uiCamera?.ignore(o));

		// Michell's zone moves with her: desk (working) -> window (after the market) -> table
		// (after the cake). Registered after she's been placed so the zone matches the sprite.
		if (marketDone() || gameState.flag("cakeGiven")) {
			scene.add.image(michell.x, michell.y, "desk-empty").setOrigin(0).setDepth(michell.depth);
		}
		let michellZone = { x: MICHELL_POSITION.x, y: MICHELL_POSITION.y, radius: MICHELL_INTERACT_RADIUS, indicatorOffset: MICHELL_BADGE_OFFSET };
		if (gameState.flag("cakeGiven")) {
			seatMichellAtTable(michell);
			michellZone = { x: MICHELL_AT_TABLE.x, y: MICHELL_AT_TABLE.y + 4, radius: 44, indicatorOffset: 64 };
		} else if (marketDone()) {
			michell.setOrigin(0.5, 1).setPosition(MICHELL_WINDOW_POSITION.x, MICHELL_WINDOW_POSITION.y).setDepth(MICHELL_WINDOW_POSITION.y);
			playMichell(michell, "idle", MICHELL_WINDOW_POSITION.facing);
			gameState.setFlag("michellMoved");
			michellZone = MICHELL_WINDOW_ZONE;
		}
		if (marketDone() || gameState.flag("cakeGiven")) {
			const body = addNpcCollider(scene, s.frankie, { id: "michell", x: michell.x, y: michell.y, width: 26, height: 14 });
			updateMichellCollider = () => {
				if (body.x === michell.x && body.y === michell.y - 7) return;
				body.setPosition(michell.x, michell.y - 7);
				(body.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
				tapMove.invalidateGrid();
			};
		}
		const startDinnerErrand = () => pauseDuring(() => dialogueBox.play(DINNER_ASSIGNMENT, () => {
			gameState.setFlag("dinnerStarted");
			dialogueDone();
		}));
		const registerMichellZone = () => {
			interactions.removeZone("michell");
			interactions.addZone({
				id: "michell",
				...michellZone,
				gameObject: michell,
				// Working art includes the desk; point to her head rather than its canvas corner.
				...(!marketDone() && !gameState.flag("cakeGiven") ? { marker: { x: 244, y: 196, top: 152 } } : {}),
				onInteract: () => {
					if (dialogueBox.isActive()) return;
					if (gameState.flag("cakeGiven") && !gameState.flag("dinnerStarted") && !gameState.flag("dinnerRevealed")) { startDinnerErrand(); return; }
					let lines;
					if (gameState.flag("cakeGiven")) {
						const chats = gameState.count("michellChats");
						const allThoughts = Object.values(PROP_THOUGHTS).flat().every(prop => gameState.count(`propSeen:${prop.id}`) > 0);
						lines = gameState.flag("dinnerStarted") && !gameState.flag("dinnerRevealed") ? dinnerReminder(gameState, "Michell") : allThoughts && chats >= MICHELL_AFTER_LINES.length
							? MICHELL_NOTEBOOK_LINES
							: MICHELL_AFTER_LINES[Math.min(chats, MICHELL_AFTER_LINES.length - 1)];
					} else {
						lines = michellLines(gameState);
						gameState.setFlag("michellGreeted");
					}
					pauseDuring(() => dialogueBox.play(lines, () => {
						if (marketDone() || gameState.flag("cakeGiven")) gameState.bump("michellChats");
						dialogueDone();
					}));
				},
			});
		};
		registerMichellZone();

		// Idle life in the flat: Michell hums at her desk now and then; Wilmo the sourdough starter
		// bubbles in the fridge once Frankie has met him (the fridge thought).
		if (!marketDone() && !gameState.flag("cakeGiven")) npcFidget(scene, michell, "hum", (o) => uiCamera?.ignore(o), { everyMs: [11000, 16000], emoteOffset: { offsetX: 94, offsetY: -49 } });
		if (gameState.count("propSeen:fridge") > 0) bubbles(scene, 379, 342, (o) => uiCamera?.ignore(o), 3000, 400);

		const startEnding = () => {
			runEnding({
				scene,
				gameState,
				dialogueBox,
				frankie: s.frankie,
				michell,
				pauseDuring,
				dialogueDone,
				hideFromWorldCamera: (o) => scene.cameras.main.ignore(o),
				ignoreInUi: (o) => uiCamera?.ignore(o),
				faceAndSpawn: (x, y, facing) => s.faceAndSpawn(x, y, facing),
				consumeIngredients,
				resumeAfterBake: gameState.flag("bakeDone"),
				onFinished: () => {
					gameState.bump("michellChats", -gameState.count("michellChats"));
					michellZone = { x: MICHELL_AT_TABLE.x, y: MICHELL_AT_TABLE.y + 4, radius: 44, indicatorOffset: 64 };
					registerMichellZone();
					if (!gameState.flag("dinnerStarted") && !gameState.flag("dinnerRevealed")) startDinnerErrand();
				},
			});
		};

		if (rafaAway) rafa.setVisible(false);
		if (!rafaAway) interactions.addZone({
			id: "rafa",
			x: rafaRestPosition.x,
			y: rafaRestPosition.y,
			radius: 40,
			indicatorOffset: 44,
			gameObject: rafa,
			onInteract: () => {
				if (dialogueBox.isActive()) return;
				// Gated on all four ingredients, not just flour. Teddy's flour handoff is barely a
				// third of the errand -- it also *reveals* eggs and sugar -- so gating the ending on
				// flour alone played "You got it! Every last thing" over a journal still showing two
				// unchecked rows, marked the ending seen, and left the real payoff unreachable: every
				// later visit, market genuinely finished, got the stale one-liner instead.
				// Existing saves that already baked may still finish their celebration.
				const hasEverything = has(QUEST.flourIngredientId) && has(QUEST.eggsIngredientId) && has(QUEST.sugarIngredientId) && has(QUEST.butterIngredientId) || gameState.flag("bakeDone");
				if (hasEverything && !gameState.flag("cakeGiven")) {
					// The ending proper (src/systems/ending.ts). A save that had "seen the ending"
					// under the old build (Rafa's line and nothing else) gets the short reminder as
					// its lead-in and then the same bake -- the payoff was never actually paid.
					const intro = gameState.hasSeenEnding() ? ENDING_REMINDER_LINES : ENDING_DIALOGUE;
					pauseDuring(() =>
						dialogueBox.play(intro, () => {
							gameState.markEndingSeen();
							startEnding();
						})
					);
					return;
				}
				const lines = hasEverything
					? RAFA_AFTER_LINES
					: marketDone() && !has(QUEST.butterIngredientId)
						? [{ speaker: "Rafa", text: "One last thing: butter. Panini keeps it upstairs, across the street. Find her a better place to loaf." }]
						: has(QUEST.flourIngredientId)
						? RAFA_MARKET_REMINDER_LINES
						: gameState.hasSeenIntro()
							? RAFA_REMINDER_LINES
							: OPENING_DIALOGUE;
				pauseDuring(() => dialogueBox.play(lines, dialogueDone));
			},
		});

		registerPropThoughts(scene, "Apartment", interactions, dialogueBox, gameState, pauseDuring, dialogueDone,
			kind => emote(scene, s.frankie, kind, o => uiCamera?.ignore(o), { holdMs: 550 }));
		transition.addDoor(APARTMENT_DOOR, () => ({ x: s.frankie.x, y: s.frankie.y }));
	}

	if (sceneKey === "Bakery") {
		if (spawnId === "fromStreet") s.faceAndSpawn(BAKERY_SPAWN_FROM_STREET.x, BAKERY_SPAWN_FROM_STREET.y, "north");
		journal.show();

		// See HIDING_SPOT_INTERACT_RADIUS: sized against how close Frankie's feet can actually get to
		// each spot's own collider, not against the icon.
		const FETCH_ITEM_RADIUS = HIDING_SPOT_INTERACT_RADIUS;
		// Touch needs an actual GameObject under the tap (InteractionManager only wires a
		// pointerdown handler when a zone has one). Two spots (crate, flour-sack) get a real,
		// always-visible container sprite of their own -- a player should see something worth
		// searching, not tap an arbitrary patch of floor. The wicker basket is existing room
		// furniture instead (its own collider from Bakery.COLLIDERS already blocks
		// Frankie), so it reuses the old invisible-fill tap rectangle rather than drawing a
		// second sprite on top of it.
		// fillAlpha 0 (not .setVisible(false)) on that fallback rectangle -- Phaser's hit test
		// skips any GameObject that fails willRender(), which setVisible(false) trips, so an
		// invisible-via-.visible rect can never be tapped at all (confirmed dead: real device tap
		// landed exactly on the rectangle's world coordinates and still produced zero hits). A
		// transparent *fill* keeps the GameObject itself "visible" to Phaser's own render-mask
		// check while drawing nothing.
		// Container sprites use spot.x/y as their own center (default 0.5,0.5 origin), unlike every
		// other bottom-anchored object in these rooms (Frankie, Teddy, room props) -- CONTAINER_HALF_H
		// converts that center to the bottom-edge foot point the rest of the scene sorts and collides
		// by. 22 = half of the 64px canvas at the 0.7 display scale below (64*0.7/2).
		const CONTAINER_HALF_H = 22;
		const spotTapTargets = new Map<string, Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image>(
			HIDING_SPOTS.map((spot) => {
				if (!spot.containerTexture) {
					// The prop's own art when the scene has it (so the tap lands where the player
					// looks), else an invisible square over the collider.
					const art = spot.artTexture ? findImageByTexture(scene, spot.artTexture) : null;
					return [spot.id, art ?? scene.add.rectangle(spot.x, spot.y, 48, 48, 0x000000, 0).setInteractive()] as const;
				}
				const footY = spot.y + CONTAINER_HALF_H;
				// A real static body -- without one Frankie walked straight through both containers,
				// and depth-sorting alone (below) only controls draw order, not collision.
				addNpcCollider(scene, s.frankie, { id: spot.id, x: spot.x, y: footY, width: 30, height: 16 });
				// 0.7 -- generated at a 64px canvas nearly edge-to-edge, next to room furniture that
				// natively renders at ~44-48px (a 48px canvas with a few px of margin); at full size
				// this read about as wide as Frankie himself instead of a knee-high floor prop.
				// Depth uses the same foot point as the collider, not spot.y (the sprite's center) --
				// otherwise Frankie could draw in front of a container he's actually standing behind.
				const image = scene.add.image(spot.x, spot.y, spot.containerTexture).setScale(0.7).setDepth(footY).setInteractive();
				return [spot.id, image] as const;
			})
		);

		// The sniff cue (audit §2.3): the hidden supplies have no marker, so Frankie's nose is the
		// marker. Within SNIFF_RANGE of an unfound spot, small cream motes drift up from his muzzle,
		// faster the closer he is, and the first time he gets close to each spot he gets a "♪". No
		// new art: the same puff texture the footsteps use, a few pixels ahead of his face.
		const SNIFF_RANGE = 96;
		const activeSpots = new Map<string, { x: number; y: number; noted: boolean }>();
		let lastSniffAt = 0;
		sceneUpdate = () => {
			if (activeSpots.size === 0 || scene.physics.world.isPaused) return;
			let nearest: { x: number; y: number; noted: boolean } | null = null;
			let best = Infinity;
			for (const spot of activeSpots.values()) {
				const d = Math.hypot(spot.x - s.frankie.x, spot.y - s.frankie.y);
				if (d < best) { best = d; nearest = spot; }
			}
			if (!nearest || best > SNIFF_RANGE) return;
			const closeness = 1 - best / SNIFF_RANGE;
			const interval = 520 - closeness * 380;
			if (scene.time.now - lastSniffAt < interval) return;
			lastSniffAt = scene.time.now;
			const facing = facingFromAnimation(s.frankie);
			const nose = { x: s.frankie.x + (facing === "east" ? 12 : facing === "west" ? -12 : 0), y: s.frankie.y - (facing === "north" ? 30 : 20) };
			burst(scene, nose.x, nose.y, 0xfff4d6, (o) => uiCamera?.ignore(o), { shape: "puff", count: 1 + Math.round(closeness * 2), speed: { min: 6, max: 18 }, gravityY: -40, scale: 0.55, lifespan: 500, angle: { min: 250, max: 290 }, depth: s.frankie.y + 1 });
			if (!nearest.noted && closeness > 0.55) {
				nearest.noted = true;
				emote(scene, s.frankie, "note", (o) => uiCamera?.ignore(o));
			}
		};
		const registerHiddenFetchZone = (item: (typeof FETCH_ITEMS)[number], spot: (typeof HIDING_SPOTS)[number]) => {
			activeSpots.set(item.id, { x: spot.x, y: spot.y, noted: false });
			interactions.addZone({
				id: item.id,
				x: spot.x,
				y: spot.y,
				radius: FETCH_ITEM_RADIUS,
				reachBounds: spot.reachBounds,
				kind: "object",
				action: "Search",
				gameObject: spotTapTargets.get(spot.id),
				onInteract: () => {
					interactions.removeZone(item.id);
					activeSpots.delete(item.id);
					audio.sfx("pickup");
					// Pop size: a found supply is a sub-goal, one step up from a plain tick.
					reward.pop(scene, { x: spot.x, y: spot.y - 10 }, 0xd9b27c, (o) => uiCamera?.ignore(o), { frankie: s.frankie, count: 9, sting: false });
					// Saved now, shown on arrival: the journal holds the slot dim until the icon
					// lands (below), so a door taken mid-flight can't lose the item any more.
					journal.holdSubItem(item.id);
					gameState.collectBakeryItem(item.id);
					// The item isn't drawn at all until it's actually found -- spawn it fresh at its
					// hiding spot for the reveal, rather than having sat visibly out this whole time.
					const sprite = scene.add.image(spot.x, spot.y, `bkry-icon-${item.id}`).setDepth(spot.y);
					// Spawned after the UI camera's one-time ignore-list snapshot (see that comment),
					// so without this it renders a second time via the UI camera's own unzoomed,
					// unscrolled transform -- a phantom second icon flying to a numerically-resolved
					// screen position instead of the journal.
					uiCamera.ignore(sprite);
					flyPickup(scene, sprite, () => journal.getSubItemScreenPosition(item.id) ?? { x: scene.scale.width - 100, y: 40 }, () => {
						journal.releaseSubItem(item.id);
						journal.pulse();
					});
				},
			});
		};

		// Search zones (and the errand checklist row in the journal, see JournalUI's errandActive)
		// only turn on once Frankie has actually spoken to Teddy and been given the errand --
		// otherwise the errand can be finished before it exists.
		const spotAssignment = gameState.getHidingSpotAssignment(
			FETCH_ITEMS.map((item) => item.id),
			HIDING_SPOTS.map((spot) => spot.id)
		);
		const spotById = new Map(HIDING_SPOTS.map((spot) => [spot.id, spot]));
		const activateFetchItems = () => {
			for (const item of FETCH_ITEMS) {
				if (gameState.hasBakeryItem(item.id)) continue;
				registerHiddenFetchZone(item, spotById.get(spotAssignment[item.id])!);
			}
		};
		if (gameState.hasStartedErrand()) {
			activateFetchItems();
		} else {
			const onErrandStart = () => {
				if (!gameState.hasStartedErrand()) return;
				activateFetchItems();
				gameState.offChange(onErrandStart);
			};
			gameState.onChange(onErrandStart);
			// GameState is a session-lived registry singleton, so this listener outlives the scene
			// unless it is explicitly dropped: leaving the bakery WITHOUT talking to Teddy left it
			// subscribed, holding the dead scene. On the next visit both the old and new listeners
			// fired, and the stale one called activateFetchItems() against destroyed sprites --
			// setInteractive() on a destroyed GameObject throws, which aborted notify() partway and
			// left the real fetch zones unregistered. Teddy then asked for three items that did not
			// exist: an unwinnable errand. (Same shutdown-unsubscribe pattern as JournalUI.ts:84.)
			scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameState.offChange(onErrandStart));
		}

		const baker = (scene as unknown as HasBaker).baker;
		// Teddy needs no runtime collider of his own: build-bakery-pixellab.py explicitly
		// special-cases him outside its normal per-manifest-object loop (a "keep the baker as a
		// blocker" block emitting [301,180,40,14] into Bakery.COLLIDERS -- see
		// docs/superpowers/specs/2026-08-26-npc-collision-hitbox-qa-design.md) and that box is
		// already wired into physics by buildColliders() same as every other static prop in the
		// scene.
		interactions.addZone({
			id: "teddy",
			x: TEDDY_POSITION.x,
			y: TEDDY_POSITION.y,
			radius: TEDDY_INTERACT_RADIUS,
			indicatorOffset: 56,
			gameObject: baker,
			onInteract: () => {
				if (dialogueBox.isActive()) return;
				if (gameState.flag("cakeGiven")) {
					pauseDuring(() => dialogueBox.play(TEDDY_AFTER_CAKE_LINES, dialogueDone));
					return;
				}
				if (gameState.hasIngredient(QUEST.flourIngredientId)) {
					pauseDuring(() => dialogueBox.play(TEDDY_ALREADY_GIVEN_LINES, dialogueDone));
					return;
				}
				gameState.startErrand();
				const remaining = QUEST.bakeryItemIds.length - gameState.bakeryItemsCollectedCount();
				if (remaining > 0) {
					pauseDuring(() => dialogueBox.play(teddyBusyLines(remaining), dialogueDone));
					return;
				}
				pauseDuring(() =>
					dialogueBox.play(TEDDY_HANDOVER_LINES, () => {
						gameState.addIngredient(QUEST.flourIngredientId);
						// Reveal next errand immediately (see quest-handoff.test.mjs)
						gameState.revealIngredient(QUEST.eggsIngredientId);
						gameState.revealIngredient(QUEST.sugarIngredientId);
						gameState.revealIngredient(QUEST.butterIngredientId);
						celebrateIngredient(
							{ scene, journal, frankie: s.frankie, pauseDuring, ignoreInUi: (o) => uiCamera?.ignore(o), hideFromWorldCamera: (o) => scene.cameras.main.ignore(o) },
							{ texture: "icon-flour", label: "Flour!", source: { x: TEDDY_POSITION.x, y: TEDDY_POSITION.y - 20 }, giver: baker, color: INGREDIENT_COLORS.flour, ingredient: QUEST.flourIngredientId, onDone: dialogueDone },
						);
					})
				);
			},
		});

		registerPropThoughts(scene, "Bakery", interactions, dialogueBox, gameState, pauseDuring, dialogueDone);
		// The room breathes: steam off the bread rack and the oven window, and Teddy kneads at the
		// counter every few seconds (a squash and a puff of flour at his hands).
		const rack = findImageByTexture(scene, "bkry-239e9866");
		if (rack) steam(scene, rack.x + rack.width / 2, rack.y + 6, (o) => uiCamera?.ignore(o), 1600, rack.depth + 1);
		const oven = findImageByTexture(scene, "bkry-3a8a34e1");
		if (oven) steam(scene, oven.x + oven.width / 2, oven.y + 12, (o) => uiCamera?.ignore(o), 2100, oven.depth + 1);
		if (baker) npcFidget(scene, baker, "knead", (o) => uiCamera?.ignore(o), { everyMs: [6000, 9000], puffAt: { x: TEDDY_POSITION.x, y: TEDDY_POSITION.y - 14 } });
		transition.addDoor(
			BAKERY_DOOR,
			() => ({ x: s.frankie.x, y: s.frankie.y }),
			() => gameState.hasIngredient(QUEST.flourIngredientId),
			() => {
				if (dialogueBox.isActive()) return;
				pauseDuring(() => dialogueBox.play(BAKERY_LOCKED_LINES, dialogueDone));
			}
		);
	}

	if (sceneKey === "Street") {
		// Facing south, away from the door just stepped out of -- see the Apartment branch above for
		// why a bare setPosition leaves him pointed back into it.
		if (spawnId === "fromApartment") s.faceAndSpawn(STREET_SPAWN_FROM_APARTMENT.x, STREET_SPAWN_FROM_APARTMENT.y, "south");
		else if (spawnId === "fromBakery") s.faceAndSpawn(STREET_SPAWN_FROM_BAKERY.x, STREET_SPAWN_FROM_BAKERY.y, "south");
		else if (spawnId === "fromPaninis") s.faceAndSpawn(STREET_SPAWN_FROM_PANINIS.x, STREET_SPAWN_FROM_PANINIS.y, "south");
		else if (spawnId === "fromMarket") s.faceAndSpawn(STREET_SPAWN_FROM_MARKET.x, STREET_SPAWN_FROM_MARKET.y, "south");
		// No spawn id = the dev `?start=Street` shortcut; the authored default sat 20px inside a
		// collider, so use the apartment doorstep like a real arrival.
		else s.faceAndSpawn(STREET_SPAWN_FROM_APARTMENT.x, STREET_SPAWN_FROM_APARTMENT.y, "south");
		journal.show();

		transition.addDoor(STREET_DOOR_TO_BAKERY, () => ({ x: s.frankie.x, y: s.frankie.y }));
		transition.addDoor(STREET_DOOR_TO_APARTMENT, () => ({ x: s.frankie.x, y: s.frankie.y }));
		transition.addDoor(STREET_DOOR_TO_MARKET, () => ({ x: s.frankie.x, y: s.frankie.y }),
			() => gameState.flag("cakeGiven") || gameState.hasIngredient("flour"),
			() => pauseDuring(() => dialogueBox.play([{ speaker: "Frankie", text: "Teddy is expecting me at the bakery first.", thought: true }], dialogueDone)));
		const streetColliders = s.getWorldColliders?.();
		if (streetColliders) {
			removeGeneratedBlocker(streetColliders, STREET_MARKET_ARCH_PASSAGE_BLOCKER);
			for (const bounds of STREET_MARKET_PILLAR_BLOCKERS) addStaticBlocker(scene, streetColliders, bounds);
		}
		transition.addDoor(STREET_DOOR_TO_PANINIS, () => ({ x: s.frankie.x, y: s.frankie.y }),
			() => gameState.flag("cakeGiven") || ["flour", "eggs", "sugar"].every(id => gameState.hasIngredient(id)),
			() => pauseDuring(() => dialogueBox.play([{ speaker: "Frankie", text: gameState.hasIngredient("flour") ? "Eggs and sugar from Pierre first. Then a visit to Panini." : "First stop: Teddy's bakery. Panini can enjoy her nap.", thought: true }], dialogueDone)));

		// The day after: Rafa out at the cafe with his one new line.
		if (gameState.flag("cakeGiven") && scene.textures.exists(`rafa-idle-${RAFA_STREET_POSITION.facing}-sheet`)) {
			const key = `rafa-idle-${RAFA_STREET_POSITION.facing}`;
			if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(`${key}-sheet`, {}), frameRate: 9, repeat: -1 });
			const rafaOut = scene.add.sprite(RAFA_STREET_POSITION.x, RAFA_STREET_POSITION.y, `${key}-sheet`, 0).setOrigin(0.5, 1).setDepth(RAFA_STREET_POSITION.y);
			rafaOut.play(key);
			npcFidget(scene, rafaOut, "hum", (o) => uiCamera?.ignore(o), { everyMs: [9000, 15000] });
			addNpcCollider(scene, s.frankie, { id: "rafa-street", x: RAFA_STREET_POSITION.x, y: RAFA_STREET_POSITION.y, width: 30, height: 14 });
			interactions.addZone({
				id: "rafa",
				x: RAFA_STREET_POSITION.x,
				y: RAFA_STREET_POSITION.y,
				radius: 44,
				indicatorOffset: 44,
				gameObject: rafaOut,
				onInteract: () => {
					if (dialogueBox.isActive()) return;
					pauseDuring(() => dialogueBox.play(gameState.flag("dinnerStarted") && !gameState.flag("dinnerRevealed") ? dinnerReminder(gameState, "Rafa") : RAFA_AFTER_LINES, dialogueDone));
				},
			});
		}

		// Ambient wildlife -- decorative only, see src/systems/wildlife.ts.
		createStork(scene, STORK_POSITION.x, STORK_POSITION.y);
		// The street moves even when nobody does: a current on the pond, a leaf drifting across
		// every so often, smoke from the two chimneys, and on the second day the lamps glow.
		waterShimmer(scene, [{ x: 568, y: 380, width: 96, height: 76 }], (o) => uiCamera?.ignore(o), -2999);
		driftingLeaves(scene, { x: 112, y: 190, width: 992, height: 600 }, (o) => uiCamera?.ignore(o));
		chimneySmoke(scene, 318, 296, (o) => uiCamera?.ignore(o));
		chimneySmoke(scene, 690, 546, (o) => uiCamera?.ignore(o));
		if (gameState.flag("cakeGiven")) {
			lampGlow(scene, 764, 262, (o) => uiCamera?.ignore(o));
			lampGlow(scene, 760, 627, (o) => uiCamera?.ignore(o));
		}
		const pigeons = PIGEON_STARTS.map((start) => createPigeon(scene, PIGEON_WANDER_BOUNDS, start));
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => pigeons.forEach((p) => p.stop()));

		registerPropThoughts(scene, "Street", interactions, dialogueBox, gameState, pauseDuring, dialogueDone);

		// The window box (see street.gameplay WINDOW_BOX): nose it once per visit, watch it grow.
		let flower: Phaser.GameObjects.Image | null = null;
		const showFlowerStage = () => {
			const watered = gameState.count("windowBoxWatered");
			const stage = [...WINDOW_BOX.stages].reverse().find((st) => watered >= st.at);
			if (!stage || !scene.textures.exists(stage.texture)) return;
			if (!flower) {
				flower = scene.add.image(WINDOW_BOX.flower.x, WINDOW_BOX.flower.y, stage.texture).setOrigin(0.5, 1).setScale(WINDOW_BOX.flower.scale).setDepth(WINDOW_BOX.flower.y + 20);
				uiCamera?.ignore(flower);
			} else if (flower.texture.key !== stage.texture) {
				flower.setTexture(stage.texture);
				scene.tweens.add({ targets: flower, scale: { from: WINDOW_BOX.flower.scale * 0.5, to: WINDOW_BOX.flower.scale }, duration: 260, ease: "Back.easeOut" });
			}
		};
		showFlowerStage();
		let wateredThisVisit = false;
		interactions.addZone({
			id: "window-box",
			x: WINDOW_BOX.zone.x,
			y: WINDOW_BOX.zone.y,
			radius: WINDOW_BOX.zone.radius,
			indicatorOffset: WINDOW_BOX.zone.indicatorOffset,
			kind: "object",
			action: () => wateredThisVisit ? "Look" : "Water",
			reachBounds: { x: 644, y: 685, width: 57, height: 14 },
			gameObject: findImageByTexture(scene, "str-1fc47a2b") ?? undefined,
			onInteract: () => {
				if (dialogueBox.isActive()) return;
				let watered = gameState.count("windowBoxWatered");
				if (!wateredThisVisit) {
					wateredThisVisit = true;
					watered = gameState.bump("windowBoxWatered");
					audio.sfx("pickup", { volume: 0.5, detune: -300 });
					squash(scene, s.frankie, 0.1);
					buzz();
					showFlowerStage();
					if (watered >= WINDOW_BOX.stages[WINDOW_BOX.stages.length - 1].at && !gameState.flag("cakeGiven")) gameState.setFlag("windowBoxBloomed");
				}
				const lines = WINDOW_BOX_LINES[Math.min(Math.max(watered - 1, 0), WINDOW_BOX_LINES.length - 1)];
				pauseDuring(() => dialogueBox.play(lines, dialogueDone));
			},
		});
	}

	if (sceneKey === "PaninisFlat") {
		s.faceAndSpawn(PANINIS_SPAWN.x, PANINIS_SPAWN.y, "north");
		journal.show();
		steam(scene, 207, 111, o => uiCamera?.ignore(o), 2400, 142, "mug");
		const colliders = s.getWorldColliders?.();
		if (!colliders) throw new Error("Panini's flat needs its authored colliders");
		new PaninisFlatGameplay(scene, colliders, {
			gameState, dialogueBox, interactions, journal, pauseDuring, dialogueDone,
			frankie: s.frankie,
			faceAndSpawn: (x, y, facing) => s.faceAndSpawn(x, y, facing),
			ignoreInUi: o => uiCamera?.ignore(o),
			hideFromWorldCamera: o => scene.cameras.main.ignore(o),
			invalidateNavigation: () => tapMove.invalidateGrid(),
		});
		transition.addDoor(PANINIS_DOOR, () => ({ x: s.frankie.x, y: s.frankie.y }));
		if (gameState.flag("paniniCurtainsOpen")) beamMotes(scene, PANINI_SUNBEAM, (o) => uiCamera?.ignore(o));
		else {
			const onCurtains = () => beamMotes(scene, PANINI_SUNBEAM, (o) => uiCamera?.ignore(o));
			scene.events.once("panini:curtains", onCurtains);
			scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off("panini:curtains", onCurtains));
		}
	}

	if (sceneKey === "Market") {
		const frankie = s.getFrankie?.() ?? s.frankie;
		const worldColliders = s.getWorldColliders?.();
		if (!worldColliders) throw new Error("Market scene did not expose its static collider group");
		if (!s.getAuthoredImage) throw new Error("Market scene did not expose authored image lookup");
		const marketHost = {
			faceAndSpawn: s.faceAndSpawn.bind(s),
			getAuthoredImage: s.getAuthoredImage.bind(s),
		};
		marketGameplay = new MarketGameplay(scene, marketHost, frankie, worldColliders, {
			gameState,
			dialogueBox,
			interactions,
			transition,
			journal,
			pauseDuring,
			dialogueDone,
			ignoreInUi: (object) => uiCamera?.ignore(object),
			hideFromWorldCamera: (object) => scene.cameras.main.ignore(object),
		}, spawnId);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => marketGameplay?.stop());
		registerPropThoughts(scene, "Market", interactions, dialogueBox, gameState, pauseDuring, dialogueDone);
		// The canal: a slow current and blinking sparks over the four water strips (the market's
		// own colliders for them), which were flat cyan until now.
		waterShimmer(scene, [
			{ x: 116, y: 244, width: 200, height: 72 }, { x: 404, y: 244, width: 184, height: 72 },
			{ x: 116, y: 404, width: 200, height: 72 }, { x: 404, y: 404, width: 184, height: 72 },
		], (o) => uiCamera?.ignore(o), 5);
	}

	// Screen-pinned UI (dialogue box, journal, touch joystick) is drawn via setScrollFactor(0),
	// which only cancels the main camera's PAN -- Phaser still multiplies scrollFactor(0)
	// objects by the camera's ZOOM (see TransformMatrix.copyWithScrollFactorFrom, which copies
	// the zoom-bearing a/b/c/d matrix components unconditionally). Both scenes zoom to 2x, so
	// without a fix all of this UI renders at 2x size and off-position. The standard Phaser fix
	// is a second, unzoomed camera dedicated to UI: the main camera ignores the UI objects, and
	// this camera ignores everything else already in the scene.
	// That ignore-list is a one-time snapshot, though -- anything spawned into the scene AFTER
	// this line (a found-item icon flying to the journal, the old wake-up-cutscene badge) is
	// invisible to it, so it renders on BOTH cameras: once correctly via the main camera, and a
	// second time via this camera's own (unzoomed, unscrolled) transform, landing at whatever
	// screen position its world coordinates numerically resolve to -- "two icons fly to the
	// journal" instead of one. Anything created later must call `uiCamera.ignore(itself)`
	// explicitly (see registerHiddenFetchZone's reveal sprite for the pattern).
	// The day after the cake: a warm evening over every room and street. Multiply-blended so the
	// art keeps its own colours, just later in the day. Created before the UI-camera snapshot below
	// so it is world-only; sized to the screen and pinned, so it costs one quad.
	if (gameState.flag("cakeGiven")) {
		const dusk = scene.add.rectangle(0, 0, 1, 1, 0xffc48a, 1).setName("evening-tint").setScrollFactor(0).setDepth(15000).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0.8);
		const fitDusk = () => {
			const cam = scene.cameras.main;
			dusk.setPosition(cam.width / 2, cam.height / 2).setSize(cam.width / cam.zoom, cam.height / cam.zoom);
		};
		fitDusk();
		scene.events.on(Phaser.Scenes.Events.UPDATE, fitDusk);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, fitDusk));
	}
	const dinnerGuide = attachDinnerClues({ scene, sceneKey, state: gameState, interactions, dialogue: dialogueBox, pause: pauseDuring, done: dialogueDone, journal, frankie: s.frankie, ignore: o => uiCamera?.ignore(o) });
	const uiObjects: Phaser.GameObjects.GameObject[] = [dialogueBox.gameObject, ...journal.gameObjects, journal.scrim, ...touchControls.gameObjects, ...settings.gameObjects, ...(marketGameplay?.uiObjects ?? []), ...(dinnerGuide ? [dinnerGuide] : [])];
	uiCamera = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height).setScroll(0, 0);
	scene.cameras.main.ignore(uiObjects);
	uiCamera.ignore(scene.children.list.filter((o) => !uiObjects.includes(o)));
	const onUiCamResize = (gameSize: Phaser.Structs.Size) => uiCamera.setSize(gameSize.width, gameSize.height);
	scene.scale.on(Phaser.Scale.Events.RESIZE, onUiCamResize);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, onUiCamResize));

	// One-time touch hint: the joystick and tap targets are silent about themselves, and a phone
	// player's first minute is otherwise spent finding out that tapping works. Shown once the
	// world is running (after the opening), fades on the first tap or after a few seconds.
	if (scene.sys.game.device.input.touch && !gameState.flag("touchHintSeen")) {
		let shown = false;
		const showHint = () => {
			if (shown) return;
			shown = true;
			gameState.setFlag("touchHintSeen");
			const w = scene.scale.width;
			const h = scene.scale.height;
			const text = scene.add.text(w / 2, h - 96, "Drag to walk\nTap nearby characters or objects to interact", {
				fontFamily: "Nunito, sans-serif",
				fontSize: "15px",
				fontStyle: "bold",
				color: PALETTE.css.panelLight,
				align: "center",
				stroke: PALETTE.css.shadow,
				strokeThickness: 4,
				lineSpacing: 4,
			}).setOrigin(0.5).setScrollFactor(0).setDepth(9700).setAlpha(0);
			scene.cameras.main.ignore(text);
			scene.tweens.add({ targets: text, alpha: 1, duration: 300 });
			const dismiss = () => {
				scene.events.off("touch:tap", dismiss);
				scene.tweens.add({ targets: text, alpha: 0, duration: 400, delay: 600, onComplete: () => text.destroy() });
			};
			scene.events.once("touch:tap", dismiss);
			scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off("touch:tap", dismiss));
			scene.time.delayedCall(7000, dismiss);
		};
		const waitForWorld = () => {
			if (scene.physics.world.isPaused || dialogueBox.isActive()) scene.time.delayedCall(400, waitForWorld);
			else showHint();
		};
		scene.time.delayedCall(800, waitForWorld);
	}

	// Gate on the physics pause rather than dialogueBox.isActive() alone: Rafa's walk-in tween
	// pauses physics before the dialogue box actually opens, and interactions/doors must stay
	// quiet for that window too, not just while a line is on screen.
	// Frankie's idle behaviour (a "?" after a while, then settling with a quiet sleep cue). No rotation-based
	// "wag" or head tilt: turning the whole sprite a few degrees reads as the dog shaking.
	const idle = idleLife(scene, s.frankie, () => playerSpeed() > 5, () => scene.physics.world.isPaused || dialogueBox.isActive(), (o) => uiCamera?.ignore(o));
	// Arriving through a door: land with a dust puff and the door closing behind him, and hold
	// input for a beat so the room registers before he can walk off.
	if (spawnId) {
		scene.physics.world.pause();
		scene.time.delayedCall(140, () => {
			if (!dialogueBox.isActive() && !scene.data.get("hud:modal")) scene.physics.world.resume();
			dustPuff(scene, s.frankie.x, s.frankie.y, (o) => uiCamera?.ignore(o));
			audio.sfx("door-close", { volume: 0.45 });
		});
	}
	const onUpdate = () => {
		updateMichellCollider();
		sceneUpdate();
		idle.update();
		if (scene.physics.world.isPaused) {
			// No badge over an NPC while a cutscene/dialogue runs; update() would re-place it next frame.
			interactions.update();
			tapMove.cancel();
			return;
		}
		marketGameplay?.update();
		tapMove.update(touchControls.isDragging);
		interactions.update();
		transition.update();
		if (audio.footstep(scene.time.now, playerSpeed())) dustPuff(scene, s.frankie.x, s.frankie.y, (o) => uiCamera.ignore(o));
	};
	scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
}
