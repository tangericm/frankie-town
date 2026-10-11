export interface PlainLine {
	speaker: string;
	text: string;
	/** Frankie's inner voice (prop thoughts, random-event framing) -- rendered italic and a shade
	 * quieter than spoken lines, so the player reads it as what he notices, not what he barks. */
	thought?: boolean;
}

export interface TwoPhaseLine {
	speaker: string;
	noise: string;
	bumper: string;
	english: string;
}

export type DialogueLine = PlainLine | TwoPhaseLine;

export type DialoguePhase = "plain" | "thought" | "noise" | "bumper" | "english";

function isTwoPhase(line: DialogueLine): line is TwoPhaseLine {
	return "noise" in line;
}

/** The advance-on-key state machine for a linear list of dialogue lines. No rendering. */
export class DialogueSequencer {
	private lines: DialogueLine[];
	private index = 0;
	private phase: DialoguePhase;

	constructor(lines: DialogueLine[]) {
		this.lines = lines;
		this.phase = this.startPhaseFor(0);
	}

	private startPhaseFor(index: number): DialoguePhase {
		const line = this.lines[index];
		if (!line) return "plain";
		return isTwoPhase(line) ? "noise" : "plain";
	}

	current(): { speaker: string; text: string; phase: DialoguePhase } | null {
		const line = this.lines[this.index];
		if (!line) return null;
		if (!isTwoPhase(line)) return { speaker: line.speaker, text: line.text, phase: line.thought ? "thought" : "plain" };
		if (this.phase === "noise") return { speaker: line.speaker, text: line.noise, phase: "noise" };
		if (this.phase === "bumper") return { speaker: line.speaker, text: line.bumper, phase: "bumper" };
		return { speaker: line.speaker, text: line.english, phase: "english" };
	}

	isDone(): boolean {
		return this.index >= this.lines.length;
	}

	/**
	 * Moves a two-phase line to its next phase, or moves to the next line. Returns false once
	 * there is nothing left (the caller should close the dialogue box on a false return).
	 */
	advance(): boolean {
		const line = this.lines[this.index];
		if (line && isTwoPhase(line)) {
			if (this.phase === "noise") {
				this.phase = "bumper";
				return true;
			}
			if (this.phase === "bumper") {
				this.phase = "english";
				return true;
			}
		}
		this.index += 1;
		this.phase = this.startPhaseFor(this.index);
		return !this.isDone();
	}
}
