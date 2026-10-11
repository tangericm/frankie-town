import Phaser from "phaser";

/** Keep canvas text smooth without changing the nearest-neighbour room art or bitmap labels.
 * Phaser 4's Text.updateText reuploads with the game's pixelArt filter on every setText/style
 * change, so setting LINEAR once at scene creation does not survive even the first typed letter.
 */
export function installReadableText(game: Phaser.Game) {
	const prepared = new WeakSet<Phaser.GameObjects.Text>();
	const prepare = (object: Phaser.GameObjects.GameObject) => {
		if (!(object instanceof Phaser.GameObjects.Text) || prepared.has(object)) return;
		prepared.add(object);
		const updateText = object.updateText;
		object.updateText = function () {
			updateText.call(this);
			this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
			return this;
		};
		// Late-created touch hints and minigame labels need the same supersampling as dialogue.
		object.setResolution(Math.max(2, object.style.resolution));
	};
	for (const scene of game.scene.scenes) {
		scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, prepare);
		scene.events.once(Phaser.Scenes.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, prepare));
	}
}
