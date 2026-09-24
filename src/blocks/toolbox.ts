import * as SB from "scratch-blocks";
import type { BlockDef } from "../catalog";
import {
  COLOURS,
  EXTENSION_BLOCKS,
  EXTENSION_NAMES,
  extBlockType,
  extensionIcon,
  extMenuType,
  MATRIX_INPUTS,
  NOTE_INPUTS,
} from "./setup";

type Category = {
  id: string;
  name: string;
  style: string;
  icon?: string;
  custom?: string;
  items: string[];
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SEP = '<sep gap="36"/>';

function b(type: string, ...inner: string[]): string {
  return `<block type="${type}">${inner.join("")}</block>`;
}

function shadow(name: string, type: string, field = "", value = ""): string {
  const f = field ? `<field name="${field}">${esc(value)}</field>` : "";
  return `<value name="${name}"><shadow type="${type}">${f}</shadow></value>`;
}

const num = (name: string, v: string, type = "math_number") =>
  shadow(name, type, "NUM", v);
const txt = (name: string, v: string) => shadow(name, "text", "TEXT", v);
const colour = (name: string, v: string) =>
  shadow(name, "colour_picker", "COLOUR", v);
const menu = (name: string, type: string) => shadow(name, type);

const CORE: Category[] = [
  {
    id: "motion",
    name: "Motion",
    style: "motion",
    items: [
      b("motion_movesteps", num("STEPS", "10")),
      b("motion_turnright", num("DEGREES", "15")),
      b("motion_turnleft", num("DEGREES", "15")),
      SEP,
      b("motion_goto", menu("TO", "motion_goto_menu")),
      b("motion_gotoxy", num("X", "0"), num("Y", "0")),
      b("motion_glideto", num("SECS", "1"), menu("TO", "motion_glideto_menu")),
      b("motion_glidesecstoxy", num("SECS", "1"), num("X", "0"), num("Y", "0")),
      SEP,
      b("motion_pointindirection", num("DIRECTION", "90", "math_angle")),
      b("motion_pointtowards", menu("TOWARDS", "motion_pointtowards_menu")),
      SEP,
      b("motion_changexby", num("DX", "10")),
      b("motion_setx", num("X", "0")),
      b("motion_changeyby", num("DY", "10")),
      b("motion_sety", num("Y", "0")),
      SEP,
      b("motion_ifonedgebounce"),
      SEP,
      b("motion_setrotationstyle"),
      SEP,
      b("motion_xposition"),
      b("motion_yposition"),
      b("motion_direction"),
    ],
  },
  {
    id: "looks",
    name: "Looks",
    style: "looks",
    items: [
      b("looks_sayforsecs", txt("MESSAGE", "Hello!"), num("SECS", "2")),
      b("looks_say", txt("MESSAGE", "Hello!")),
      b("looks_thinkforsecs", txt("MESSAGE", "Hmm..."), num("SECS", "2")),
      b("looks_think", txt("MESSAGE", "Hmm...")),
      SEP,
      b("looks_switchcostumeto", menu("COSTUME", "looks_costume")),
      b("looks_nextcostume"),
      b("looks_switchbackdropto", menu("BACKDROP", "looks_backdrops")),
      b("looks_switchbackdroptoandwait", menu("BACKDROP", "looks_backdrops")),
      b("looks_nextbackdrop"),
      SEP,
      b("looks_changesizeby", num("CHANGE", "10")),
      b("looks_setsizeto", num("SIZE", "100")),
      SEP,
      b("looks_changeeffectby", num("CHANGE", "25")),
      b("looks_seteffectto", num("VALUE", "0")),
      b("looks_cleargraphiceffects"),
      SEP,
      b("looks_show"),
      b("looks_hide"),
      SEP,
      b("looks_gotofrontback"),
      b("looks_goforwardbackwardlayers", num("NUM", "1", "math_integer")),
      SEP,
      b("looks_costumenumbername"),
      b("looks_backdropnumbername"),
      b("looks_size"),
    ],
  },
  {
    id: "sound",
    name: "Sound",
    style: "sounds",
    items: [
      b("sound_playuntildone", menu("SOUND_MENU", "sound_sounds_menu")),
      b("sound_play", menu("SOUND_MENU", "sound_sounds_menu")),
      b("sound_stopallsounds"),
      SEP,
      b("sound_changeeffectby", num("VALUE", "10")),
      b("sound_seteffectto", num("VALUE", "100")),
      b("sound_cleareffects"),
      SEP,
      b("sound_changevolumeby", num("VOLUME", "-10")),
      b("sound_setvolumeto", num("VOLUME", "100")),
      b("sound_volume"),
    ],
  },
  {
    id: "events",
    name: "Events",
    style: "event",
    items: [
      b("event_whenflagclicked"),
      b("event_whenkeypressed"),
      b("event_whenthisspriteclicked"),
      b("event_whenstageclicked"),
      b("event_whenbackdropswitchesto"),
      SEP,
      b("event_whengreaterthan", num("VALUE", "10")),
      SEP,
      b("event_whenbroadcastreceived"),
      b("event_broadcast", menu("BROADCAST_INPUT", "event_broadcast_menu")),
      b(
        "event_broadcastandwait",
        menu("BROADCAST_INPUT", "event_broadcast_menu"),
      ),
    ],
  },
  {
    id: "control",
    name: "Control",
    style: "control",
    items: [
      b("control_wait", num("DURATION", "1", "math_positive_number")),
      SEP,
      b("control_repeat", num("TIMES", "10", "math_whole_number")),
      b("control_forever"),
      SEP,
      b("control_if"),
      b("control_if_else"),
      b("control_wait_until"),
      b("control_repeat_until"),
      SEP,
      b("control_stop"),
      SEP,
      b("control_start_as_clone"),
      b(
        "control_create_clone_of",
        menu("CLONE_OPTION", "control_create_clone_of_menu"),
      ),
      b("control_delete_this_clone"),
    ],
  },
  {
    id: "sensing",
    name: "Sensing",
    style: "sensing",
    items: [
      b(
        "sensing_touchingobject",
        menu("TOUCHINGOBJECTMENU", "sensing_touchingobjectmenu"),
      ),
      b("sensing_touchingcolor", colour("COLOR", "#4a6cd4")),
      b(
        "sensing_coloristouchingcolor",
        colour("COLOR", "#4a6cd4"),
        colour("COLOR2", "#e6a822"),
      ),
      b("sensing_distanceto", menu("DISTANCETOMENU", "sensing_distancetomenu")),
      SEP,
      b("sensing_askandwait", txt("QUESTION", "What's your name?")),
      b("sensing_answer"),
      SEP,
      b("sensing_keypressed", menu("KEY_OPTION", "sensing_keyoptions")),
      b("sensing_mousedown"),
      b("sensing_mousex"),
      b("sensing_mousey"),
      SEP,
      b("sensing_setdragmode"),
      SEP,
      b("sensing_loudness"),
      SEP,
      b("sensing_timer"),
      b("sensing_resettimer"),
      SEP,
      b("sensing_of", menu("OBJECT", "sensing_of_object_menu")),
      SEP,
      b("sensing_current"),
      b("sensing_dayssince2000"),
      SEP,
      b("sensing_username"),
    ],
  },
  {
    id: "operators",
    name: "Operators",
    style: "operators",
    items: [
      b("operator_add", num("NUM1", ""), num("NUM2", "")),
      b("operator_subtract", num("NUM1", ""), num("NUM2", "")),
      b("operator_multiply", num("NUM1", ""), num("NUM2", "")),
      b("operator_divide", num("NUM1", ""), num("NUM2", "")),
      SEP,
      b("operator_random", num("FROM", "1"), num("TO", "10")),
      SEP,
      b("operator_gt", txt("OPERAND1", ""), txt("OPERAND2", "50")),
      b("operator_lt", txt("OPERAND1", ""), txt("OPERAND2", "50")),
      b("operator_equals", txt("OPERAND1", ""), txt("OPERAND2", "50")),
      SEP,
      b("operator_and"),
      b("operator_or"),
      b("operator_not"),
      SEP,
      b("operator_join", txt("STRING1", "apple "), txt("STRING2", "banana")),
      b(
        "operator_letter_of",
        num("LETTER", "1", "math_whole_number"),
        txt("STRING", "apple"),
      ),
      b("operator_length", txt("STRING", "apple")),
      b("operator_contains", txt("STRING1", "apple"), txt("STRING2", "a")),
      SEP,
      b("operator_mod", num("NUM1", ""), num("NUM2", "")),
      b("operator_round", num("NUM", "")),
      SEP,
      b("operator_mathop", num("NUM", "")),
    ],
  },
  {
    id: "variables",
    name: "Variables",
    style: "data",
    custom: "VARIABLE",
    items: [],
  },
  {
    id: "myBlocks",
    name: "My Blocks",
    style: "more",
    custom: "PROCEDURE",
    items: [],
  },
];

function extItem(block: BlockDef): string {
  const inner = block.inputs.map((input, i) => {
    const name = `ARG${i}`;
    const key = `${block.key}.${i}`;
    if (NOTE_INPUTS.has(key)) return shadow(name, "note", "NOTE", input.default);
    if (MATRIX_INPUTS.has(key))
      return shadow(name, "matrix", "MATRIX", "0101010101100010101000100");
    switch (input.kind) {
      case "number":
        return num(name, input.default);
      case "text":
        return txt(name, input.default);
      case "color":
        return colour(name, input.default);
      case "boolean":
        return "";
      case "menu":
        return input.round
          ? shadow(name, extMenuType(block, i), "MENU", input.default)
          : `<field name="${name}">${esc(input.default)}</field>`;
    }
  });
  return b(extBlockType(block), ...inner);
}

function extensionCategories(): Category[] {
  return Object.entries(EXTENSION_NAMES).map(([ext, name]) => ({
    id: ext,
    name,
    style: "pen",
    icon: extensionIcon(ext),
    items: EXTENSION_BLOCKS.filter((x) => x.category === ext).map(extItem),
  }));
}

let categories: Category[] | null = null;

function allCategories(): Category[] {
  categories ??= [...CORE, ...extensionCategories()];
  return categories;
}

function categoryXml(c: Category): string {
  const s = COLOURS[c.style];
  const attrs = [
    `name="${esc(c.name)}"`,
    `id="${c.id}"`,
    `colour="${s?.colourPrimary}"`,
    `secondaryColour="${s?.colourTertiary}"`,
    c.icon ? `iconURI="${esc(c.icon)}"` : "",
    c.custom ? `custom="${c.custom}"` : "",
  ].join(" ");
  return `<category ${attrs}>${c.items.join("")}</category>`;
}

export function toolboxXml(showExtensions: boolean): string {
  const shown = showExtensions ? allCategories() : CORE;
  return `<xml style="display: none">${shown.map(categoryXml).join("")}</xml>`;
}

// ---------- Search ----------

const labelCache = new Map<string, string>();
let scratch: SB.Workspace | null = null;

function labelOf(xml: string): string {
  const cached = labelCache.get(xml);
  if (cached !== undefined) return cached;
  let label = "";
  try {
    scratch ??= new SB.Workspace();
    const block = SB.Xml.domToBlock(SB.utils.xml.textToDom(xml), scratch);
    label = block.toString();
    block.dispose(false);
  } catch {
    label = xml.match(/type="([^"]+)"/)?.[1]?.replace(/_/g, " ") ?? "";
  }
  label = label.toLowerCase();
  labelCache.set(xml, label);
  return label;
}

export function searchToolboxXml(
  query: string,
  workspace: SB.WorkspaceSvg,
): string {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: string[] = [];
  const dynamic = (c: Category): string[] => {
    const els =
      c.custom === "VARIABLE"
        ? SB.ScratchVariables.getVariablesCategory(workspace)
        : SB.ScratchProcedures.getProceduresCategory(workspace);
    return els
      .filter((el) => el.tagName.toLowerCase() === "block")
      .map((el) => SB.Xml.domToText(el));
  };
  for (const c of allCategories()) {
    const items = c.custom ? dynamic(c) : c.items;
    for (const item of items) {
      if (item === SEP) continue;
      const hay = `${labelOf(item)} ${c.name.toLowerCase()}`;
      if (words.every((w) => hay.includes(w))) hits.push(item);
    }
  }
  return `<xml style="display: none"><category name="Results" id="results" colour="#888888" secondaryColour="#666666">${hits.join("")}</category></xml>`;
}
