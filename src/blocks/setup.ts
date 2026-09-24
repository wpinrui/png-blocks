import * as En from "blockly/msg/en";
import * as SB from "scratch-blocks";
import { CATALOG, type BlockDef } from "../catalog";
import { renderSvg } from "../render";

export const MEDIA = "/scratch-blocks-media/";

type Style = {
  colourPrimary: string;
  colourSecondary: string;
  colourTertiary: string;
  colourQuaternary: string;
};

function style(p: string, s: string, t: string): Style {
  return {
    colourPrimary: p,
    colourSecondary: s,
    colourTertiary: t,
    colourQuaternary: t,
  };
}

export const COLOURS: Record<string, Style> = {
  motion: style("#4C97FF", "#4280D7", "#3373CC"),
  looks: style("#9966FF", "#855CD6", "#774DCB"),
  sounds: style("#CF63CF", "#C94FC9", "#BD42BD"),
  control: style("#FFAB19", "#EC9C13", "#CF8B17"),
  event: style("#FFBF00", "#E6AC00", "#CC9900"),
  sensing: style("#5CB1D6", "#47A8D1", "#2E8EB8"),
  pen: style("#0FBD8C", "#0DA57A", "#0B8E69"),
  operators: style("#59C059", "#46B946", "#389438"),
  data: style("#FF8C1A", "#FF8000", "#DB6E00"),
  data_lists: style("#FF661A", "#FF5500", "#E64D00"),
  more: style("#FF6680", "#FF4D6A", "#FF3355"),
  textField: style("#FFFFFF", "#FFFFFF", "#FFFFFF"),
};

export function makeTheme() {
  return new SB.Theme("default", COLOURS as never);
}

// ---------- Dropdowns that accept a typed-in value ----------

const CUSTOM_KEY = "sbp-custom-options";
const CUSTOM_VALUE = "__custom__";

function loadCustom(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const custom = loadCustom();

function addCustom(menu: string, value: string) {
  const list = custom[menu] ?? [];
  if (!list.includes(value)) list.push(value);
  custom[menu] = list;
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  } catch {
    // Storage full or blocked: the value still works for this session.
  }
}

type Option = [string, string];

function editableDropdown(menu: string, name: string, base: Option[]) {
  return {
    type: "field_dropdown",
    name,
    options: () => [
      ...base,
      ...(custom[menu] ?? []).map((v): Option => [v, v]),
      ["Other...", CUSTOM_VALUE] as Option,
    ],
  };
}

function customValidator(menu: string) {
  return (value: string) => {
    if (value !== CUSTOM_VALUE) return value;
    const text = window.prompt("Value");
    if (!text) return null;
    addCustom(menu, text);
    return text;
  };
}

function defineMenu(
  type: string,
  field: string,
  colour: string,
  base: Option[],
) {
  SB.Blocks[type] = {
    init(this: SB.Block) {
      this.jsonInit({
        message0: "%1",
        args0: [editableDropdown(type, field, base)],
        extensions: [`colours_${colour}`, "output_string"],
      });
      this.getField(field)?.setValidator(customValidator(type));
    },
  };
}

const SPRITE: Option = ["Sprite1", "Sprite1"];

function defineCoreMenus() {
  defineMenu("motion_goto_menu", "TO", "motion", [
    ["random position", "_random_"],
    ["mouse-pointer", "_mouse_"],
    SPRITE,
  ]);
  defineMenu("motion_glideto_menu", "TO", "motion", [
    ["random position", "_random_"],
    ["mouse-pointer", "_mouse_"],
    SPRITE,
  ]);
  defineMenu("motion_pointtowards_menu", "TOWARDS", "motion", [
    ["mouse-pointer", "_mouse_"],
    SPRITE,
  ]);
  defineMenu("looks_costume", "COSTUME", "looks", [
    ["costume1", "costume1"],
    ["costume2", "costume2"],
  ]);
  defineMenu("looks_backdrops", "BACKDROP", "looks", [
    ["backdrop1", "backdrop1"],
    ["next backdrop", "next backdrop"],
    ["previous backdrop", "previous backdrop"],
    ["random backdrop", "random backdrop"],
  ]);
  defineMenu("sound_sounds_menu", "SOUND_MENU", "sounds", [["Meow", "Meow"]]);
  defineMenu("control_create_clone_of_menu", "CLONE_OPTION", "control", [
    ["myself", "_myself_"],
    SPRITE,
  ]);
  defineMenu("sensing_touchingobjectmenu", "TOUCHINGOBJECTMENU", "sensing", [
    ["mouse-pointer", "_mouse_"],
    ["edge", "_edge_"],
    SPRITE,
  ]);
  defineMenu("sensing_distancetomenu", "DISTANCETOMENU", "sensing", [
    ["mouse-pointer", "_mouse_"],
    SPRITE,
  ]);
  defineMenu("sensing_of_object_menu", "OBJECT", "sensing", [
    ["Stage", "_stage_"],
    SPRITE,
  ]);

  SB.Blocks.event_whenbackdropswitchesto = {
    init(this: SB.Block) {
      this.jsonInit({
        message0: "when backdrop switches to %1",
        args0: [
          editableDropdown("event_whenbackdropswitchesto", "BACKDROP", [
            ["backdrop1", "backdrop1"],
          ]),
        ],
        extensions: ["colours_event", "shape_hat"],
      });
      this.getField("BACKDROP")?.setValidator(
        customValidator("event_whenbackdropswitchesto"),
      );
    },
  };

  const props = [
    "backdrop #",
    "backdrop name",
    "volume",
    "x position",
    "y position",
    "direction",
    "costume #",
    "costume name",
    "size",
  ].map((p): Option => [p, p]);
  SB.Blocks.sensing_of = {
    init(this: SB.Block) {
      this.jsonInit({
        message0: "%1 of %2",
        args0: [
          editableDropdown("sensing_of", "PROPERTY", props),
          { type: "input_value", name: "OBJECT" },
        ],
        output: true,
        outputShape: 2,
        extensions: ["colours_sensing", "output_number"],
      });
      this.getField("PROPERTY")?.setValidator(customValidator("sensing_of"));
    },
  };
}

// ---------- Extension blocks, built from the scratchblocks catalog ----------

export const EXTENSION_NAMES: Record<string, string> = {
  music: "Music",
  pen: "Pen",
  video: "Video Sensing",
  tts: "Text to Speech",
  translate: "Translate",
  faceSensing: "Face Sensing",
  makeymakey: "Makey Makey",
  microbit: "micro:bit",
  ev3: "LEGO MINDSTORMS EV3",
  wedo: "LEGO WeDo 2.0",
  gdxfor: "Force and Acceleration",
  boost: "LEGO BOOST",
};

const MEDIA_ICONS: Record<string, string> = {
  music: "extensions/music-block-icon.svg",
  pen: "extensions/pen-block-icon.svg",
  microbit: "extensions/microbit-block-icon.svg",
  wedo: "extensions/wedo2-block-icon.svg",
};

const iconCache: Record<string, string> = {};

// Extension icons missing from scratch-blocks' media are lifted from the
// scratchblocks renderer's own SVG defs.
export function extensionIcon(ext: string): string {
  const cached = iconCache[ext];
  if (cached) return cached;
  const media = MEDIA_ICONS[ext];
  let uri = media ? MEDIA + media : "";
  if (!uri) {
    const svg = renderSvg("x", 1);
    const id = ext === "translate" ? "translateBlock" : `${ext}Block`;
    const el = svg.querySelector(`#sb3-${id}`);
    if (el) {
      const clone = el.cloneNode(true) as Element;
      clone.removeAttribute("id");
      const xml = new XMLSerializer().serializeToString(clone);
      uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="40" viewBox="0 0 40 40">${xml}</svg>`,
      )}`;
    }
  }
  iconCache[ext] = uri;
  return uri;
}

export function extBlockType(b: BlockDef): string {
  return `ext_${b.key.replace(/\W/g, "_")}`;
}

export function extMenuType(b: BlockDef, i: number): string {
  return `${extBlockType(b)}_menu${i}`;
}

// Inputs whose Scratch 3 editor is a piano or LED matrix, not a plain number.
export const NOTE_INPUTS = new Set([
  "music.playNoteForBeats.0",
  "ev3.beepNote.0",
]);
export const MATRIX_INPUTS = new Set(["microbit.displaySymbol.0"]);

export const EXTENSION_BLOCKS = CATALOG.filter((b) => b.category in EXTENSION_NAMES);

function defineExtensionBlock(b: BlockDef) {
  const args: object[] = [];
  b.inputs.forEach((input, i) => {
    const name = `ARG${i}`;
    if (input.kind === "menu" && !input.round && !MATRIX_INPUTS.has(`${b.key}.${i}`)) {
      args.push({
        type: "field_dropdown",
        name,
        options: (input.options ?? [input.default]).map((o) => [o, o]),
      });
    } else if (input.kind === "boolean") {
      args.push({ type: "input_value", name, check: "Boolean" });
    } else {
      args.push({ type: "input_value", name });
    }
    if (input.kind === "menu" && input.round) {
      const options = (input.options ?? [input.default]).map((o) => [o, o]);
      SB.Blocks[extMenuType(b, i)] = {
        init(this: SB.Block) {
          this.jsonInit({
            message0: "%1",
            args0: [{ type: "field_dropdown", name: "MENU", options }],
            extensions: ["colours_pen", "output_string"],
          });
        },
      };
    }
  });

  const message = b.spec
    .replace(/%(\d+)/g, (_, n) => `%${Number(n) + 2}`)
    .replace(/@\w+/g, "");
  const shapeExt: Record<string, string[]> = {
    stack: ["shape_statement"],
    hat: ["shape_hat"],
    reporter: ["output_string"],
    boolean: ["output_boolean"],
  };
  const ext = b.category;
  SB.Blocks[extBlockType(b)] = {
    init(this: SB.Block) {
      this.jsonInit({
        message0: `%1 %2 ${message}`,
        args0: [
          {
            type: "field_image",
            src: extensionIcon(ext),
            width: 40,
            height: 40,
          },
          { type: "field_vertical_separator" },
          ...args,
        ],
        extensions: [
          "colours_pen",
          ...(shapeExt[b.shape] ?? ["shape_statement"]),
          "scratch_extension",
        ],
      });
    },
  };
}

// ---------- Prompts ----------

function parseProcedure(text: string) {
  const parts: string[] = [];
  const names: string[] = [];
  const defaults: string[] = [];
  for (const m of text.matchAll(/\(([^)]*)\)|<([^>]*)>|([^()<>]+)/g)) {
    if (m[1] !== undefined) {
      parts.push("%s");
      names.push(m[1].trim() || "number or text");
      defaults.push("");
    } else if (m[2] !== undefined) {
      parts.push("%b");
      names.push(m[2].trim() || "boolean");
      defaults.push("false");
    } else if (m[3]?.trim()) {
      parts.push(m[3].trim());
    }
  }
  return { proccode: parts.join(" "), names, defaults };
}

function procedureText(mutation: Element): string {
  const proccode = mutation.getAttribute("proccode") ?? "";
  const names: string[] = JSON.parse(
    mutation.getAttribute("argumentnames") ?? "[]",
  );
  let i = 0;
  return proccode.replace(/%[snb]/g, (t) => {
    const name = names[i++] ?? "";
    return t === "%b" ? `<${name}>` : `(${name})`;
  });
}

function setupPrompts() {
  SB.ScratchVariables.setPromptHandler((message, defaultValue, callback) => {
    callback(window.prompt(message, defaultValue), []);
  });
  SB.ScratchProcedures.externalProcedureDefCallback = (mutation, done) => {
    const text = window.prompt(
      "Block text. Use (name) for a number or text input, <name> for a boolean.",
      procedureText(mutation),
    );
    if (!text?.trim()) {
      done();
      return;
    }
    const { proccode, names, defaults } = parseProcedure(text);
    const oldIds: string[] = JSON.parse(
      mutation.getAttribute("argumentids") ?? "[]",
    );
    const ids = names.map((_, i) => oldIds[i] ?? SB.utils.idGenerator.genUid());
    mutation.setAttribute("proccode", proccode);
    mutation.setAttribute("argumentids", JSON.stringify(ids));
    mutation.setAttribute("argumentnames", JSON.stringify(names));
    mutation.setAttribute("argumentdefaults", JSON.stringify(defaults));
    done(mutation);
  };
}

let done = false;

export function setupBlocks() {
  if (done) return;
  done = true;
  // Blockly's own strings (context menu items and so on) are not bundled
  // with blockly/core; Scratch's strings then override the shared keys.
  SB.setLocale(En as unknown as Record<string, string>);
  SB.ScratchMsgs.setLocale("en");
  defineCoreMenus();
  for (const b of EXTENSION_BLOCKS) defineExtensionBlock(b);
  setupPrompts();
}
